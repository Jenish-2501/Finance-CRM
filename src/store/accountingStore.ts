import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { createJSONStorage, StateStorage } from 'zustand/middleware';

// Fire-and-forget SQLite persistence for the Electron shell.
// Uses the atomic store:persistChanges channel (multi-entity, transactional).
// No-ops in browser/web mode. Failures never break in-memory business logic.
function persistDiff(payload: Record<string, unknown[]>) {
  try {
    window.electronAPI?.store.persistChanges(payload)?.catch(() => {});
  } catch {
    // IPC unavailable — memory state remains the source of truth.
  }
}

// Safe wrapper around localStorage to check and migrate old data to SQLite
const electronStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (window.electronAPI) {
      const oldLocalDataStr = localStorage.getItem(name);
      if (oldLocalDataStr) {
        try {
          const parsed = JSON.parse(oldLocalDataStr);
          const migrated = await window.electronAPI.store.migrateLocalStorage(parsed);
          if (migrated) {
            // Cutover complete: drop the legacy copy so later launches
            // boot straight from SQLite (no re-parse, no re-send).
            try {
              localStorage.removeItem(name);
            } catch {
              // storage failure must not block startup
            }
          }
        } catch (e) {
          console.error("Migration failed", e);
        }
      }

      const data = await window.electronAPI.store.loadAll();
      return JSON.stringify({ state: data, version: 1 });
    }
    return null;
  },
  setItem: (_name: string, _value: string): void => {
  },
  removeItem: (_name: string): void => {
  },
};

import {
  BusinessSettings,
  UnitOfMeasure,
  Customer,
  Product,
  ProductUnit,
  ProductPrice,
  CustomerProductPrice,
  CustomerPriceHistory,
  StockReceipt,
  StockReceiptItem,
  InventoryMovement,
  CustomerInventoryMovement,
  DispatchDocument,
  Invoice,
  InvoiceItem,
  InvoiceCustomerInventoryAllocation,
  InvoiceSeries,
  InvoicePayment,
  AuditLog,
  InvoiceStatus,
  PaymentMethod,
  OWNER_ID,
  OWNER_NAME
} from '../types/database';
import {
  SEED_BUSINESS_SETTINGS,
  SEED_UOMS,
  SEED_CUSTOMERS,
  SEED_PRODUCTS,
  SEED_PRODUCT_UNITS,
  SEED_PRODUCT_PRICES,
  SEED_STOCK_RECEIPTS,
  SEED_STOCK_RECEIPT_ITEMS,
  SEED_INVENTORY_MOVEMENTS,
  SEED_CUSTOMER_INVENTORY_MOVEMENTS,
  SEED_INVOICES,
  SEED_INVOICE_ITEMS,
  SEED_INVOICE_ALLOCATIONS,
  SEED_INVOICE_PAYMENTS,
  SEED_AUDIT_LOGS
} from '../data/seedData';
import {
  roundCurrency,
  convertQuantity,
  getPieceWeightMapping as resolvePieceWeightMapping,
  isValidGramsPerPiece,
  calculateLineItemFinancials,
  calculateInvoiceTotals,
  calculateInvoiceOutstanding,
  getFyForDate,
  getCustomerStateCode,
  suggestCustomerNumber,
  suggestNextPlainNumber
} from '../utils/calculations';

export interface LedgerEntry {
  date: string;
  type: 'INVOICE' | 'PAYMENT';
  referenceId: string;
  referenceNumber: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface BillableMovementItem {
  movementId: string;
  movementDate: string;
  referenceId: string;
  productId: string;
  productName: string;
  sku: string;
  unitId: string;
  unitCode: string;
  dispatchedQuantity: number;
  allocatedQuantity: number;
  availableBillableQuantity: number;
  applicablePrice: number;
  basePrice: number;
  isCustomPrice: boolean;
}

export interface CustomerProductSummary {
  productId: string;
  productName: string;
  sku: string;
  unitCode: string;
  totalReceived: number;
  totalReturned: number;
  currentBalance: number;
  billedQuantity: number;
  unbilledQuantity: number;
}

interface AccountingState {
  // Relational Entities (single-owner: no users table, no roles)
  businessSettings: BusinessSettings;
  uoms: Record<string, UnitOfMeasure>;
  customers: Record<string, Customer>;
  products: Record<string, Product>;
  productUnits: Record<string, ProductUnit>;
  productPrices: Record<string, ProductPrice>;
  customerPrices: Record<string, CustomerProductPrice>;
  customerPriceHistory: Record<string, CustomerPriceHistory>;
  stockReceipts: Record<string, StockReceipt>;
  stockReceiptItems: Record<string, StockReceiptItem>;
  inventoryMovements: Record<string, InventoryMovement>;
  customerInventoryMovements: Record<string, CustomerInventoryMovement>;
  dispatchDocuments: Record<string, DispatchDocument>;
  invoices: Record<string, Invoice>;
  invoiceItems: Record<string, InvoiceItem>;
  invoiceAllocations: Record<string, InvoiceCustomerInventoryAllocation>;
  invoiceSeries: Record<string, InvoiceSeries>;
  invoicePayments: Record<string, InvoicePayment>;
  auditLogs: AuditLog[];

  // Selectors / Queries
  getCurrentCompanyStock: (productId: string) => number;
  getCustomerProductInventory: (customerId: string, productId: string) => number;
  getCustomerInventorySummary: (customerId: string) => CustomerProductSummary[];
  getBillableMovementsForCustomer: (customerId: string) => BillableMovementItem[];
  getInvoiceOutstanding: (invoiceId: string) => { totalPaid: number; outstanding: number };
  getCustomerOutstanding: (customerId: string) => number;
  getCustomerLedger: (customerId: string) => LedgerEntry[];
  getProductEffectivePrice: (productId: string, unitId: string, asOfDate?: string) => number;
  resolvePriceForCustomer: (productId: string, unitId: string, customerId: string) => { price: number; basePrice: number; isCustom: boolean };
  getCustomerPriceHistory: (customerId: string) => CustomerPriceHistory[];

  // Actions
  updateBusinessSettings: (data: Partial<BusinessSettings>) => void;
  // M2 DB-authoritative writes. In the desktop shell these go through the
  // validated main-process API first and only then update memory; in browser
  // preview (no bridge) they fall back to memory-only (localOnly: true).
  saveBusinessSettings: (
    data: Partial<BusinessSettings>
  ) => Promise<{ ok: boolean; error?: string; localOnly?: boolean }>;
  refreshBusinessConfig: () => Promise<void>;
  saveUom: (data: {
    code: string;
    name: string;
    description?: string;
  }) => Promise<{ ok: boolean; uom?: UnitOfMeasure; error?: string; localOnly?: boolean }>;
  setUomActive: (id: string, isActive: boolean) => Promise<{ ok: boolean; error?: string; localOnly?: boolean }>;
  createUOM: (data: Omit<UnitOfMeasure, 'id' | 'created_at' | 'updated_at'>) => UnitOfMeasure;
  createCustomer: (data: Omit<Customer, 'id' | 'created_at' | 'updated_at'>) => { success: boolean; customer?: Customer; error?: string };
  updateCustomer: (id: string, data: Partial<Customer>) => { success: boolean; error?: string };
  isCustomerNumberTaken: (customerNumber: string, excludeId?: string) => boolean;
  suggestNextCustomerNumber: () => string;
  deleteCustomer: (id: string) => { success: boolean; message?: string };

  createProduct: (
    productData: Omit<Product, 'id' | 'created_at' | 'updated_at'>,
    initialPrice: number
  ) => Product;
  updateProduct: (id: string, data: Partial<Product>) => void;
  configureProductUnit: (data: Omit<ProductUnit, 'id' | 'created_at' | 'updated_at'>) => ProductUnit;
  // Piece-weight mapping ("enter PCS, weight comes automatically"). Ensures the
  // PCS row (grams per piece, in primary units) and — for GRAM-primary products —
  // the KG row (1000). Billing (Phase 3) and challan entry (Phase 2) key off
  // getPieceWeightMapping.
  getPieceWeightMapping: (productId: string) => { gramsPerPiece: number; pcsUnitId: string; kgUnitId: string } | null;
  savePieceWeightMapping: (productId: string, gramsPerPiece: number) => { success: boolean; error?: string };
  removePieceWeightMapping: (productId: string) => { success: boolean; error?: string };
  createProductPrice: (data: Omit<ProductPrice, 'id' | 'created_at' | 'updated_at'>) => ProductPrice;
  setCustomerPrice: (data: { customerId: string; productId: string; unitId: string; price: number }) => { success: boolean; error?: string };
  clearCustomerPrice: (customerId: string, productId: string, unitId: string) => { success: boolean; error?: string };

  // Inventory Actions
  createStockReceipt: (
    receiptData: {
      supplierName: string;
      referenceNumber: string;
      receiptDate: string;
      notes: string;
    },
    items: Array<{
      productId: string;
      unitId: string;
      quantity: number;
      unitCost: number;
    }>
  ) => StockReceipt;

  dispatchInventoryToCustomer: (params: {
    customerId: string;
    productId: string;
    unitId: string;
    quantity: number;
    referenceId: string;
    movementDate?: string;
  }) => { success: boolean; movementId?: string; referenceId?: string; error?: string };

  dispatchBatchInventoryToCustomer: (params: {
    customerId: string;
    referenceId?: string;
    movementDate?: string;
    items: Array<{
      productId: string;
      unitId: string;
      quantity: number;
    }>;
  }) => { success: boolean; movementIds?: string[]; referenceId?: string; error?: string };

  // Dispatch-document numbering: one shared plain sequence for challans + returns.
  suggestNextDocumentNumber: (customerId: string, documentType: 'DISPATCH' | 'RETURN') => string;

  createCustomerReturn: (params: {
    customerId: string;
    productId: string;
    unitId: string;
    quantity: number;
    referenceId: string;
    movementDate?: string;
  }) => { success: boolean; error?: string };

  createInventoryAdjustment: (params: {
    productId: string;
    unitId: string;
    quantity: number;
    movementType: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';
    notes: string;
  }) => { success: boolean; error?: string };

  // Billing & Invoices Actions
  // FY series: ensureSeries (get-or-create, automatic rollover), startNewFySeries
  // (explicit rollover for the current FY), setSeriesNextNumber (owner control).
  ensureSeries: (fy: string) => InvoiceSeries;
  startNewFySeries: () => { success: boolean; fy: string; existed: boolean };
  setSeriesNextNumber: (fy: string, nextNumber: number) => { success: boolean; error?: string };
  createInvoice: (params: {
    customerId: string;
    billingPeriodStart: string;
    billingPeriodEnd: string;
    items: Array<{
      productId: string;
      unitId: string;
      quantity: number;
      unitPrice: number;
      discount?: number;
      movementAllocations?: Array<{ movementId: string; allocatedQuantity: number }>;
    }>;
    otherCharges?: number;
    notes?: string;
    status?: InvoiceStatus;
    invoiceDate?: string; // backdated billing date (ISO); defaults to now; never the future
  }) => { success: boolean; invoiceId?: string; error?: string };

  finalizeInvoice: (invoiceId: string) => { success: boolean; error?: string };
  cancelInvoice: (invoiceId: string, reason: string) => { success: boolean; error?: string };

  // Payments Actions
  createInvoicePayment: (params: {
    invoiceId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    referenceNumber: string;
    notes: string;
    paymentDate?: string;
  }) => { success: boolean; paymentId?: string; error?: string };

  cancelInvoicePayment: (paymentId: string, reason: string) => { success: boolean; error?: string };

  // System
  logAudit: (
    action: string,
    entityType: string,
    entityId: string,
    newData?: Record<string, unknown> | null,
    oldData?: Record<string, unknown> | null,
    metadata?: Record<string, unknown> | null
  ) => void;
  resetToSeedData: () => void;
}

// Resolve a dispatch-document number for (customer, type): a provided reference
// wins when free, otherwise the next free plain number is assigned. The shared
// counter only ever moves forward, so sequences from both families stay tight.
// Pure over its inputs — the caller persists the advanced floor.
function claimDocumentNumber(
  headers: DispatchDocument[],
  customerId: string,
  documentType: 'DISPATCH' | 'RETURN',
  floor: number,
  preferred?: string
): { ok: boolean; number?: string; nextFloor?: number; error?: string } {
  const trimmed = (preferred || '').trim();
  const scoped = headers.filter((h) => h.customer_id === customerId && h.document_type === documentType);
  if (trimmed) {
    const taken = scoped.some((h) => h.document_number.trim().toUpperCase() === trimmed.toUpperCase());
    if (taken) {
      return { ok: false, error: `Document number ${trimmed} already exists for this customer.` };
    }
    const parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : 0;
    return { ok: true, number: trimmed, nextFloor: Math.max(floor, parsed + 1) };
  }
  const number = suggestNextPlainNumber(
    scoped.map((h) => h.document_number),
    floor
  );
  if (!number) return { ok: false, error: 'No free document number available.' };
  return { ok: true, number, nextFloor: Number(number) + 1 };
}

export const useAccountingStore = create<AccountingState>()(
  persist(
    (set, get) => ({
      businessSettings: { ...SEED_BUSINESS_SETTINGS },
      uoms: { ...SEED_UOMS },
      customers: { ...SEED_CUSTOMERS },
      products: { ...SEED_PRODUCTS },
      productUnits: { ...SEED_PRODUCT_UNITS },
      productPrices: { ...SEED_PRODUCT_PRICES },
      customerPrices: {},
      customerPriceHistory: {},
      stockReceipts: { ...SEED_STOCK_RECEIPTS },
      stockReceiptItems: { ...SEED_STOCK_RECEIPT_ITEMS },
      inventoryMovements: { ...SEED_INVENTORY_MOVEMENTS },
      customerInventoryMovements: { ...SEED_CUSTOMER_INVENTORY_MOVEMENTS },
      dispatchDocuments: {},
      invoices: { ...SEED_INVOICES },
      invoiceItems: { ...SEED_INVOICE_ITEMS },
      invoiceAllocations: { ...SEED_INVOICE_ALLOCATIONS },
      invoiceSeries: {},
      invoicePayments: { ...SEED_INVOICE_PAYMENTS },
      auditLogs: [...SEED_AUDIT_LOGS],

      // Selectors
      getCurrentCompanyStock: (productId: string) => {
        const { inventoryMovements, productUnits, products } = get();
        const product = products[productId];
        if (!product) return 0;

        const pUnits = Object.values(productUnits).filter((pu) => pu.product_id === productId);

        let netStockInPrimary = 0;
        for (const mov of Object.values(inventoryMovements)) {
          if (mov.product_id === productId) {
            const qtyInPrimary = convertQuantity(
              mov.quantity,
              mov.unit_id,
              product.primary_unit_id,
              pUnits
            );
            if (
              mov.movement_type === 'STOCK_IN' ||
              mov.movement_type === 'CUSTOMER_RETURN' ||
              mov.movement_type === 'ADJUSTMENT_IN'
            ) {
              netStockInPrimary += qtyInPrimary;
            } else if (
              mov.movement_type === 'CUSTOMER_DISPATCH' ||
              mov.movement_type === 'ADJUSTMENT_OUT'
            ) {
              netStockInPrimary -= qtyInPrimary;
            }
          }
        }
        return roundCurrency(netStockInPrimary);
      },

      getCustomerProductInventory: (customerId: string, productId: string) => {
        const { customerInventoryMovements, productUnits, products } = get();
        const product = products[productId];
        if (!product) return 0;

        const pUnits = Object.values(productUnits).filter((pu) => pu.product_id === productId);

        let balance = 0;
        for (const mov of Object.values(customerInventoryMovements)) {
          if (mov.customer_id === customerId && mov.product_id === productId) {
            const qtyInPrimary = convertQuantity(
              mov.quantity,
              mov.unit_id,
              product.primary_unit_id,
              pUnits
            );
            if (mov.movement_type === 'DISPATCH' || mov.movement_type === 'ADJUSTMENT_IN') {
              balance += qtyInPrimary;
            } else if (mov.movement_type === 'RETURN' || mov.movement_type === 'ADJUSTMENT_OUT') {
              balance -= qtyInPrimary;
            }
          }
        }
        return roundCurrency(balance);
      },

      getCustomerInventorySummary: (customerId: string) => {
        const { customerInventoryMovements, invoiceAllocations, invoices, products, uoms, productUnits } = get();
        const summaryMap: Record<string, CustomerProductSummary> = {};

        // Calculate total dispatched and returned
        for (const mov of Object.values(customerInventoryMovements)) {
          if (mov.customer_id === customerId) {
            const prod = products[mov.product_id];
            if (!prod) continue;
            const primaryUom = uoms[prod.primary_unit_id];
            const pUnits = Object.values(productUnits).filter((pu) => pu.product_id === prod.id);
            const qtyPrimary = convertQuantity(mov.quantity, mov.unit_id, prod.primary_unit_id, pUnits);

            if (!summaryMap[mov.product_id]) {
              summaryMap[mov.product_id] = {
                productId: prod.id,
                productName: prod.product_name,
                sku: prod.sku,
                unitCode: primaryUom ? primaryUom.code : 'PCS',
                totalReceived: 0,
                totalReturned: 0,
                currentBalance: 0,
                billedQuantity: 0,
                unbilledQuantity: 0
              };
            }

            if (mov.movement_type === 'DISPATCH' || mov.movement_type === 'ADJUSTMENT_IN') {
              summaryMap[mov.product_id].totalReceived += qtyPrimary;
            } else if (mov.movement_type === 'RETURN' || mov.movement_type === 'ADJUSTMENT_OUT') {
              summaryMap[mov.product_id].totalReturned += qtyPrimary;
            }
          }
        }

        // Calculate billed quantity from explicit allocations for non-cancelled invoices
        for (const alloc of Object.values(invoiceAllocations)) {
          const inv = invoices[alloc.invoice_id];
          if (!inv || inv.status === 'CANCELLED' || inv.customer_id !== customerId) continue;
          const mov = customerInventoryMovements[alloc.customer_inventory_movement_id];
          if (!mov) continue;
          if (summaryMap[mov.product_id]) {
            const prod = products[mov.product_id];
            const pUnits = Object.values(productUnits).filter((pu) => pu.product_id === prod.id);
            const qtyPrimary = convertQuantity(alloc.allocated_quantity, mov.unit_id, prod.primary_unit_id, pUnits);
            summaryMap[mov.product_id].billedQuantity += qtyPrimary;
          }
        }

        return Object.values(summaryMap).map((item) => {
          const currentBalance = roundCurrency(item.totalReceived - item.totalReturned);
          const unbilledQuantity = Math.max(0, roundCurrency(currentBalance - item.billedQuantity));
          return {
            ...item,
            totalReceived: roundCurrency(item.totalReceived),
            totalReturned: roundCurrency(item.totalReturned),
            currentBalance,
            billedQuantity: roundCurrency(item.billedQuantity),
            unbilledQuantity
          };
        });
      },

      getBillableMovementsForCustomer: (customerId: string) => {
        const {
          customerInventoryMovements,
          invoiceAllocations,
          invoices,
          products,
          uoms
        } = get();

        const dispatchMovements = Object.values(customerInventoryMovements).filter(
          (m) => m.customer_id === customerId && m.movement_type === 'DISPATCH'
        );

        const result: BillableMovementItem[] = [];

        for (const mov of dispatchMovements) {
          const prod = products[mov.product_id];
          const uom = uoms[mov.unit_id];
          if (!prod) continue;

          // Sum allocations for this movement across active/draft/finalized invoices
          const totalAllocated = Object.values(invoiceAllocations)
            .filter((a) => {
              if (a.customer_inventory_movement_id !== mov.id) return false;
              const inv = invoices[a.invoice_id];
              return inv && inv.status !== 'CANCELLED';
            })
            .reduce((sum, a) => roundCurrency(sum + a.allocated_quantity), 0);

          const availableBillable = Math.max(0, roundCurrency(mov.quantity - totalAllocated));

          // Agreed customer price wins; base price otherwise (see resolvePriceForCustomer)
          const resolved = get().resolvePriceForCustomer(prod.id, mov.unit_id, customerId);

          if (availableBillable > 0) {
            result.push({
              movementId: mov.id,
              movementDate: mov.movement_date,
              referenceId: mov.reference_id,
              productId: prod.id,
              productName: prod.product_name,
              sku: prod.sku,
              unitId: mov.unit_id,
              unitCode: uom ? uom.code : 'PCS',
              dispatchedQuantity: mov.quantity,
              allocatedQuantity: totalAllocated,
              availableBillableQuantity: availableBillable,
              applicablePrice: resolved.price,
              basePrice: resolved.basePrice,
              isCustomPrice: resolved.isCustom
            });
          }
        }

        return result;
      },

      getProductEffectivePrice: (productId: string, unitId: string, asOfDate?: string) => {
        const { productPrices } = get();
        const targetDate = asOfDate ? new Date(asOfDate).getTime() : Date.now();

        const prices = Object.values(productPrices).filter(
          (pp) => pp.product_id === productId && pp.unit_id === unitId
        );

        for (const p of prices) {
          const from = new Date(p.effective_from).getTime();
          const to = p.effective_to ? new Date(p.effective_to).getTime() : Infinity;
          if (targetDate >= from && targetDate <= to) {
            return p.price;
          }
        }

        // Fallback to active price
        const active = prices.find((p) => !p.effective_to);
        return active ? active.price : 0;
      },

      getInvoiceOutstanding: (invoiceId: string) => {
        const { invoices, invoicePayments } = get();
        const invoice = invoices[invoiceId];
        if (!invoice) return { totalPaid: 0, outstanding: 0 };
        const payments = Object.values(invoicePayments).filter((p) => p.invoice_id === invoiceId);
        return calculateInvoiceOutstanding(invoice.grand_total, invoice.status, payments);
      },

      getCustomerOutstanding: (customerId: string) => {
        const { invoices, invoicePayments } = get();
        let totalOutstanding = 0;

        for (const inv of Object.values(invoices)) {
          if (inv.customer_id === customerId && inv.status === 'FINALIZED') {
            const payments = Object.values(invoicePayments).filter((p) => p.invoice_id === inv.id);
            const { outstanding } = calculateInvoiceOutstanding(inv.grand_total, inv.status, payments);
            totalOutstanding = roundCurrency(totalOutstanding + outstanding);
          }
        }
        return totalOutstanding;
      },

      getCustomerLedger: (customerId: string) => {
        const { invoices, invoicePayments } = get();
        const entries: Array<Omit<LedgerEntry, 'balance'>> = [];

        // Finalized Invoices generate DEBIT entries
        for (const inv of Object.values(invoices)) {
          if (inv.customer_id === customerId && inv.status === 'FINALIZED') {
            entries.push({
              date: inv.invoice_date,
              type: 'INVOICE',
              referenceId: inv.id,
              referenceNumber: inv.invoice_number,
              description: `Sales Invoice #${inv.invoice_number} finalized`,
              debit: inv.grand_total,
              credit: 0
            });
          }
        }

        // Active Payments generate CREDIT entries
        for (const pay of Object.values(invoicePayments)) {
          if (pay.status === 'ACTIVE') {
            const inv = invoices[pay.invoice_id];
            if (inv && inv.customer_id === customerId) {
              entries.push({
                date: pay.payment_date,
                type: 'PAYMENT',
                referenceId: pay.id,
                referenceNumber: pay.reference_number || `PAY-${pay.id.slice(0, 6)}`,
                description: `Payment received via ${pay.payment_method} for Inv #${inv.invoice_number}`,
                debit: 0,
                credit: pay.amount
              });
            }
          }
        }

        // Sort chronologically: Date asc, then INVOICE before PAYMENT on same date
        entries.sort((a, b) => {
          const timeA = new Date(a.date).getTime();
          const timeB = new Date(b.date).getTime();
          if (timeA !== timeB) return timeA - timeB;
          return a.type === 'INVOICE' ? -1 : 1;
        });

        // Compute running balance
        let runningBalance = 0;
        const ledger: LedgerEntry[] = [];
        for (const entry of entries) {
          runningBalance = roundCurrency(runningBalance + entry.debit - entry.credit);
          ledger.push({
            ...entry,
            balance: runningBalance
          });
        }

        return ledger;
      },

      // Actions
      updateBusinessSettings: (data: Partial<BusinessSettings>) => {
        const current = get().businessSettings;
        const updated: BusinessSettings = {
          ...current,
          ...data,
          updated_at: new Date().toISOString()
        };
        set({ businessSettings: updated });
        persistDiff({ businessSettings: [updated as unknown as Record<string, unknown>] });
        get().logAudit(
          'SETTINGS_UPDATED',
          'BUSINESS_SETTINGS',
          current.id,
          updated as unknown as Record<string, unknown>,
          current as unknown as Record<string, unknown>
        );
      },

      createUOM: (data) => {
        const id = `uom-${data.code.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
        const newUOM: UnitOfMeasure = {
          ...data,
          id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        set((state) => ({
          uoms: { ...state.uoms, [id]: newUOM }
        }));
        persistDiff({ uoms: [newUOM as unknown as Record<string, unknown>] });
        get().logAudit('UOM_CREATED', 'UNIT_OF_MEASURE', id, newUOM as unknown as Record<string, unknown>);
        return newUOM;
      },

      // M2: database-first business configuration (see interface note).
      saveBusinessSettings: async (data) => {
        const bridge = window.electronAPI?.business_settings;
        if (!bridge?.update) {
          get().updateBusinessSettings(data);
          return { ok: true, localOnly: true };
        }
        try {
          const result = await bridge.update(data as unknown as Record<string, unknown>);
          if (!result.ok) {
            return { ok: false, error: result.message ?? 'Business settings could not be saved.' };
          }
          const updated = result.settings as unknown as BusinessSettings;
          const previous = get().businessSettings;
          set({ businessSettings: updated });
          get().logAudit(
            'SETTINGS_UPDATED',
            'BUSINESS_SETTINGS',
            updated.id,
            updated as unknown as Record<string, unknown>,
            previous as unknown as Record<string, unknown>
          );
          return { ok: true };
        } catch {
          return {
            ok: false,
            error: 'Desktop app is out of date. Please fully quit and restart AccuLedger, then try again.'
          };
        }
      },

      refreshBusinessConfig: async () => {
        const bridge = window.electronAPI?.business_settings;
        if (!bridge?.get) return;
        try {
          const [settings, uomRows] = await Promise.all([
            bridge.get(),
            window.electronAPI?.uoms?.list
              ? window.electronAPI.uoms.list()
              : Promise.resolve(null)
          ]);
          if (settings && typeof settings === 'object' && (settings as { id?: unknown }).id) {
            set({ businessSettings: settings as unknown as BusinessSettings });
          }
          if (Array.isArray(uomRows) && uomRows.length > 0) {
            const map: Record<string, UnitOfMeasure> = {};
            for (const row of uomRows) {
              const uom = row as unknown as UnitOfMeasure;
              if (uom.id) map[uom.id] = uom;
            }
            set({ uoms: map });
          }
        } catch {
          // Stale shell — memory state remains the source of truth.
        }
      },

      saveUom: async (data) => {
        const bridge = window.electronAPI?.uoms;
        if (!bridge?.create) {
          const created = get().createUOM({
            code: data.code,
            name: data.name,
            description: data.description ?? '',
            is_active: true
          });
          return { ok: true, uom: created, localOnly: true };
        }
        try {
          const result = await bridge.create(data);
          if (!result.ok) {
            return { ok: false, error: result.message ?? 'Unit of measure could not be saved.' };
          }
          const uom = result.uom as unknown as UnitOfMeasure;
          set((state) => ({ uoms: { ...state.uoms, [uom.id]: uom } }));
          get().logAudit('UOM_CREATED', 'UNIT_OF_MEASURE', uom.id, uom as unknown as Record<string, unknown>);
          return { ok: true, uom };
        } catch {
          return {
            ok: false,
            error: 'Desktop app is out of date. Please fully quit and restart AccuLedger, then try again.'
          };
        }
      },

      setUomActive: async (id, isActive) => {
        const bridge = window.electronAPI?.uoms;
        if (!bridge?.setActive) {
          const existing = get().uoms[id];
          if (!existing) return { ok: false, error: 'Unit of measure was not found.' };
          const updated: UnitOfMeasure = {
            ...existing,
            is_active: isActive,
            updated_at: new Date().toISOString()
          };
          set((state) => ({ uoms: { ...state.uoms, [id]: updated } }));
          return { ok: true, localOnly: true };
        }
        try {
          const result = await bridge.setActive(id, isActive);
          if (!result.ok) {
            return { ok: false, error: result.message ?? 'Unit of measure could not be updated.' };
          }
          const uom = result.uom as unknown as UnitOfMeasure;
          set((state) => ({ uoms: { ...state.uoms, [uom.id]: uom } }));
          get().logAudit(
            isActive ? 'UOM_ACTIVATED' : 'UOM_DEACTIVATED',
            'UNIT_OF_MEASURE',
            uom.id,
            uom as unknown as Record<string, unknown>
          );
          return { ok: true };
        } catch {
          return {
            ok: false,
            error: 'Desktop app is out of date. Please fully quit and restart AccuLedger, then try again.'
          };
        }
      },

      isCustomerNumberTaken: (customerNumber: string, excludeId?: string) => {
        const needle = customerNumber.trim().toUpperCase();
        if (!needle) return false;
        return Object.values(get().customers).some(
          (c) => c.id !== excludeId && (c.customer_number || '').trim().toUpperCase() === needle
        );
      },

      suggestNextCustomerNumber: () => {
        const floor = get().businessSettings.customer_next_number;
        return suggestCustomerNumber(
          Object.values(get().customers).map((c) => c.customer_number || ''),
          Number.isInteger(floor) && (floor as number) >= 1 ? (floor as number) : 1
        );
      },

      suggestNextDocumentNumber: (customerId: string, documentType: 'DISPATCH' | 'RETURN') => {
        const floor = get().businessSettings.document_next_number;
        return suggestNextPlainNumber(
          Object.values(get().dispatchDocuments)
            .filter((h) => h.customer_id === customerId && h.document_type === documentType)
            .map((h) => h.document_number),
          Number.isInteger(floor) && (floor as number) >= 1 ? (floor as number) : 1
        );
      },

      createCustomer: (data) => {
        let customerNumber = (data.customer_number || '').trim().toUpperCase();
        const autoAssigned = !customerNumber;
        if (autoAssigned) {
          // Automatic plain sequence (1, 2, 3…): suggestion skips taken numbers.
          customerNumber = get().suggestNextCustomerNumber().toUpperCase();
          if (!customerNumber) {
            return { success: false, error: 'No free customer number available.' };
          }
        }
        if (get().isCustomerNumberTaken(customerNumber)) {
          return { success: false, error: `Customer number ${customerNumber} is already in use.` };
        }
        // Advance the floor past the issued number so the next auto-assign continues the sequence.
        const issued = /^\d+$/.test(customerNumber) ? Number(customerNumber) : 0;
        const floor = get().businessSettings.customer_next_number;
        const nextFloor = Math.max(
          Number.isInteger(floor) && (floor as number) >= 1 ? (floor as number) : 1,
          issued + 1
        );
        const id = `cust-${Date.now()}`;
        const now = new Date().toISOString();
        const newCust: Customer = {
          ...data,
          customer_number: customerNumber,
          id,
          created_at: now,
          updated_at: now
        };
        const updatedSettings: BusinessSettings = {
          ...get().businessSettings,
          customer_next_number: nextFloor,
          updated_at: now
        };
        set((state) => ({
          customers: { ...state.customers, [id]: newCust },
          businessSettings: updatedSettings
        }));
        get().logAudit('CUSTOMER_CREATED', 'CUSTOMER', id, newCust as unknown as Record<string, unknown>);
        persistDiff({
          customers: [newCust as unknown as Record<string, unknown>],
          businessSettings: [updatedSettings as unknown as Record<string, unknown>]
        });
        return { success: true, customer: newCust };
      },

      updateCustomer: (id: string, data: Partial<Customer>) => {
        const oldCust = get().customers[id];
        if (!oldCust) return { success: false, error: 'Customer not found.' };
        if (data.customer_number !== undefined) {
          const customerNumber = (data.customer_number || '').trim().toUpperCase();
          if (!customerNumber) {
            return { success: false, error: 'Customer number is required.' };
          }
          if (get().isCustomerNumberTaken(customerNumber, id)) {
            return { success: false, error: `Customer number ${customerNumber} is already in use.` };
          }
          data = { ...data, customer_number: customerNumber };
        }
        const updatedCust: Customer = {
          ...oldCust,
          ...data,
          updated_at: new Date().toISOString()
        };
        set((state) => ({
          customers: { ...state.customers, [id]: updatedCust }
        }));
        persistDiff({ customers: [updatedCust as unknown as Record<string, unknown>] });
        get().logAudit(
          'CUSTOMER_UPDATED',
          'CUSTOMER',
          id,
          updatedCust as unknown as Record<string, unknown>,
          oldCust as unknown as Record<string, unknown>
        );
        return { success: true };
      },

      deleteCustomer: (id: string) => {
        const { invoices, customerInventoryMovements } = get();
        const hasInvoices = Object.values(invoices).some((i) => i.customer_id === id);
        const hasMovements = Object.values(customerInventoryMovements).some((m) => m.customer_id === id);
        if (hasInvoices || hasMovements) {
          // Soft disable instead of breaking relational integrity
          get().updateCustomer(id, { is_active: false });
          return { success: true, message: 'Customer has associated invoices or inventory movements; deactivated successfully.' };
        }
        set((state) => {
          const next = { ...state.customers };
          delete next[id];
          return { customers: next };
        });
        try {
          window.electronAPI?.customers.delete(id)?.catch(() => {});
        } catch {
          // IPC unavailable — memory state remains the source of truth.
        }
        get().logAudit('CUSTOMER_DELETED', 'CUSTOMER', id);
        return { success: true };
      },

      createProduct: (productData, initialPrice) => {
        const id = `prod-${Date.now()}`;
        const newProd: Product = {
          ...productData,
          id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        // Primary product unit
        const primaryPuId = `pu-${id}-primary`;
        const primaryPU: ProductUnit = {
          id: primaryPuId,
          product_id: id,
          unit_id: productData.primary_unit_id,
          conversion_to_primary: 1,
          is_stock_unit: true,
          is_billing_unit: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        // Primary price
        const priceId = `pp-${id}-1`;
        const primaryPrice: ProductPrice = {
          id: priceId,
          product_id: id,
          unit_id: productData.primary_unit_id,
          price: initialPrice,
          effective_from: new Date().toISOString(),
          effective_to: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const newUnits: Record<string, ProductUnit> = { [primaryPuId]: primaryPU };
        const newPrices: Record<string, ProductPrice> = { [priceId]: primaryPrice };

        set((state) => ({
          products: { ...state.products, [id]: newProd },
          productUnits: { ...state.productUnits, ...newUnits },
          productPrices: { ...state.productPrices, ...newPrices }
        }));

        if(window.electronAPI) {
          persistDiff({
            products: [newProd as unknown as Record<string, unknown>],
            productPrices: Object.values(newPrices) as unknown as Record<string, unknown>[],
            productUnits: Object.values(newUnits) as unknown as Record<string, unknown>[]
          });
        }
        get().logAudit('PRODUCT_CREATED', 'PRODUCT', id, newProd as unknown as Record<string, unknown>);
        return newProd;
      },

      updateProduct: (id: string, data: Partial<Product>) => {
        const oldProd = get().products[id];
        if (!oldProd) return;
        const updated: Product = {
          ...oldProd,
          ...data,
          updated_at: new Date().toISOString()
        };
        set((state) => ({
          products: { ...state.products, [id]: updated }
        }));
        persistDiff({ products: [updated as unknown as Record<string, unknown>] });
        get().logAudit(
          'PRODUCT_UPDATED',
          'PRODUCT',
          id,
          updated as unknown as Record<string, unknown>,
          oldProd as unknown as Record<string, unknown>
        );
      },

      configureProductUnit: (data) => {
        const id = `pu-${Date.now()}`;
        const newPU: ProductUnit = {
          ...data,
          id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        set((state) => ({
          productUnits: { ...state.productUnits, [id]: newPU }
        }));
        persistDiff({ productUnits: [newPU as unknown as Record<string, unknown>] });
        get().logAudit('PRODUCT_UNIT_CONFIGURED', 'UNIT_OF_MEASURE', id, newPU as unknown as Record<string, unknown>);
        return newPU;
      },

      getPieceWeightMapping: (productId: string) => {
        const { products, productUnits, uoms } = get();
        const product = products[productId];
        if (!product) return null;
        const pus = Object.values(productUnits).filter((pu) => pu.product_id === productId);
        return resolvePieceWeightMapping(pus, uoms, product.primary_unit_id);
      },

      savePieceWeightMapping: (productId: string, gramsPerPiece: number) => {
        const { products, productUnits, uoms } = get();
        const product = products[productId];
        if (!product || !product.is_active) {
          return { success: false, error: 'Product not found or inactive.' };
        }
        const primary = uoms[product.primary_unit_id];
        const primaryCode = (primary?.code || '').trim().toUpperCase();
        const primaryIsGram = primaryCode === 'GRAM';
        const primaryIsKg = primaryCode === 'KG';
        if (!primary || (!primaryIsGram && !primaryIsKg)) {
          return { success: false, error: 'Piece mapping needs a GRAM or KG primary product.' };
        }
        if (!isValidGramsPerPiece(gramsPerPiece)) {
          return { success: false, error: 'Grams per piece must be a number more than zero.' };
        }
        // Factor is stored in PRIMARY units (grams as-is; grams/1000 for KG).
        const pcsFactor = primaryIsGram ? gramsPerPiece : gramsPerPiece / 1000;
        if (!(pcsFactor > 0) || !Number.isFinite(pcsFactor)) {
          return { success: false, error: 'Grams per piece must be a number more than zero.' };
        }
        const pcs = Object.values(uoms).find((u) => u.code === 'PCS' && u.is_active);
        const kg = Object.values(uoms).find((u) => u.code === 'KG' && u.is_active);
        if (!pcs || !kg) {
          return { success: false, error: 'PCS and KG units must exist and stay active.' };
        }
        const now = new Date().toISOString();
        const existing = Object.values(productUnits).filter((pu) => pu.product_id === productId);
        const taken = new Set(Object.values(productUnits).map((pu) => pu.id));
        const claimId = (base: string): string => {
          let id = base;
          let n = 2;
          while (taken.has(id)) {
            id = `${base}-${n}`;
            n += 1;
          }
          taken.add(id);
          return id;
        };
        const rows: ProductUnit[] = [];
        const pcsRow = existing.find((pu) => pu.unit_id === pcs.id);
        if (pcsRow) {
          if (
            pcsRow.conversion_to_primary !== pcsFactor ||
            !pcsRow.is_stock_unit ||
            pcsRow.is_billing_unit
          ) {
            rows.push({
              ...pcsRow,
              conversion_to_primary: pcsFactor,
              is_stock_unit: true,
              is_billing_unit: false,
              updated_at: now
            });
          }
        } else {
          rows.push({
            id: claimId(`pu-${productId}-pcs`),
            product_id: productId,
            unit_id: pcs.id,
            conversion_to_primary: pcsFactor,
            is_stock_unit: true,
            is_billing_unit: false,
            created_at: now,
            updated_at: now
          });
        }
        if (primaryIsGram) {
          // KG billing/display row (1 KG = 1000 gram). For KG-primary products
          // the primary row itself is the KG row — nothing to ensure.
          const kgRow = existing.find((pu) => pu.unit_id === kg.id);
          if (kgRow) {
            if (kgRow.conversion_to_primary !== 1000 || !kgRow.is_billing_unit) {
              rows.push({
                ...kgRow,
                conversion_to_primary: 1000,
                is_billing_unit: true,
                updated_at: now
              });
            }
          } else {
            rows.push({
              id: claimId(`pu-${productId}-kg`),
              product_id: productId,
              unit_id: kg.id,
              conversion_to_primary: 1000,
              is_stock_unit: false,
              is_billing_unit: true,
              created_at: now,
              updated_at: now
            });
          }
        } else {
          // KG primary: keep the primary row billing-enabled so KG pricing
          // stays visible in Customer Pricing.
          const primaryRow = existing.find((pu) => pu.unit_id === product.primary_unit_id);
          if (primaryRow && !primaryRow.is_billing_unit) {
            rows.push({ ...primaryRow, is_billing_unit: true, updated_at: now });
          }
        }
        if (rows.length === 0) return { success: true }; // already exact
        set((state) => {
          const next = { ...state.productUnits };
          for (const r of rows) next[r.id] = r;
          return { productUnits: next };
        });
        persistDiff({ productUnits: rows as unknown as Record<string, unknown>[] });
        get().logAudit('PIECE_WEIGHT_SET', 'PRODUCT_UNIT', rows[0].id, {
          productId,
          productName: product.product_name,
          gramsPerPiece
        });
        return { success: true };
      },

      removePieceWeightMapping: (productId: string) => {
        const st = get();
        const mapping = st.getPieceWeightMapping(productId);
        if (!mapping) return { success: true }; // nothing mapped
        // Recorded PCS movements derive their weight from this mapping — removing
        // it would silently reinterpret them 1:1 (convertQuantity fallback).
        const pcsUsed =
          Object.values(st.customerInventoryMovements).some(
            (m) => m.product_id === productId && m.unit_id === mapping.pcsUnitId
          ) ||
          Object.values(st.inventoryMovements).some(
            (m) => m.product_id === productId && m.unit_id === mapping.pcsUnitId
          );
        if (pcsUsed) {
          return {
            success: false,
            error: 'Mapping is used by recorded stock movements and cannot be removed.'
          };
        }
        const row = Object.values(st.productUnits).find(
          (pu) => pu.product_id === productId && pu.unit_id === mapping.pcsUnitId
        );
        if (!row) return { success: true };
        set((state) => {
          const next = { ...state.productUnits };
          delete next[row.id];
          return { productUnits: next };
        });
        try {
          window.electronAPI?.store.delete('productUnits', row.id)?.catch(() => {});
        } catch {
          // IPC unavailable — memory state remains the source of truth.
        }
        get().logAudit('PIECE_WEIGHT_REMOVED', 'PRODUCT_UNIT', row.id, { productId });
        return { success: true };
      },

      createProductPrice: (data) => {
        const id = `pp-${Date.now()}`;
        const newPrice: ProductPrice = {
          ...data,
          id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        // Close any currently active price for this product and unit
        const updatedPrices = { ...get().productPrices };
        const closedPrices: ProductPrice[] = [];
        for (const [key, existing] of Object.entries(updatedPrices)) {
          if (
            existing.product_id === data.product_id &&
            existing.unit_id === data.unit_id &&
            !existing.effective_to
          ) {
            updatedPrices[key] = {
              ...existing,
              effective_to: new Date(new Date(data.effective_from).getTime() - 1000).toISOString(),
              updated_at: new Date().toISOString()
            };
            closedPrices.push(updatedPrices[key]);
          }
        }
        updatedPrices[id] = newPrice;

        set({ productPrices: updatedPrices });
        persistDiff({
          productPrices: [newPrice, ...closedPrices] as unknown as Record<string, unknown>[]
        });
        get().logAudit('PRODUCT_PRICE_UPDATED', 'PRODUCT_PRICE', id, newPrice as unknown as Record<string, unknown>);
        return newPrice;
      },

      resolvePriceForCustomer: (productId: string, unitId: string, customerId: string) => {
        const basePrice = get().getProductEffectivePrice(productId, unitId);
        const override = Object.values(get().customerPrices).find(
          (cp) => cp.customer_id === customerId && cp.product_id === productId && cp.unit_id === unitId
        );
        if (override) {
          return { price: override.price, basePrice, isCustom: true };
        }
        return { price: basePrice, basePrice, isCustom: false };
      },

      getCustomerPriceHistory: (customerId: string) => {
        return Object.values(get().customerPriceHistory)
          .filter((h) => h.customer_id === customerId)
          .sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());
      },

      setCustomerPrice: ({ customerId, productId, unitId, price }) => {
        const { customers, products, customerPrices } = get();
        const customer = customers[customerId];
        if (!customer || !customer.is_active) {
          return { success: false, error: 'Customer not found or inactive.' };
        }
        const product = products[productId];
        if (!product || !product.is_active) {
          return { success: false, error: 'Product not found or inactive.' };
        }
        if (!Number.isFinite(price) || price < 0) {
          return { success: false, error: 'Agreed price must be zero or more.' };
        }
        const rounded = roundCurrency(price);
        const now = new Date().toISOString();
        const existing = Object.values(customerPrices).find(
          (cp) => cp.customer_id === customerId && cp.product_id === productId && cp.unit_id === unitId
        );
        if (existing && existing.price === rounded) {
          return { success: true }; // no change, no history spam
        }
        const row: CustomerProductPrice = {
          id: existing?.id || `cpp-${Date.now()}`,
          customer_id: customerId,
          product_id: productId,
          unit_id: unitId,
          price: rounded,
          created_at: existing?.created_at || now,
          updated_at: now
        };
        const history: CustomerPriceHistory = {
          id: `cph-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          customer_id: customerId,
          product_id: productId,
          unit_id: unitId,
          old_price: existing ? existing.price : null,
          new_price: rounded,
          changed_at: now,
          changed_by: OWNER_ID
        };
        set((state) => ({
          customerPrices: { ...state.customerPrices, [row.id]: row },
          customerPriceHistory: { ...state.customerPriceHistory, [history.id]: history }
        }));
        persistDiff({
          customerPrices: [row as unknown as Record<string, unknown>],
          customerPriceHistory: [history as unknown as Record<string, unknown>]
        });
        get().logAudit('CUSTOMER_PRICE_SET', 'CUSTOMER_PRODUCT_PRICE', row.id, {
          customerId,
          customerName: customer.customer_name,
          productId,
          productName: product.product_name,
          oldPrice: history.old_price,
          newPrice: rounded
        });
        return { success: true };
      },

      clearCustomerPrice: (customerId: string, productId: string, unitId: string) => {
        const { customerPrices } = get();
        const existing = Object.values(customerPrices).find(
          (cp) => cp.customer_id === customerId && cp.product_id === productId && cp.unit_id === unitId
        );
        if (!existing) return { success: true }; // nothing to clear
        const now = new Date().toISOString();
        const history: CustomerPriceHistory = {
          id: `cph-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          customer_id: customerId,
          product_id: productId,
          unit_id: unitId,
          old_price: existing.price,
          new_price: null,
          changed_at: now,
          changed_by: OWNER_ID
        };
        set((state) => {
          const next = { ...state.customerPrices };
          delete next[existing.id];
          return {
            customerPrices: next,
            customerPriceHistory: { ...state.customerPriceHistory, [history.id]: history }
          };
        });
        try {
          window.electronAPI?.store.delete('customerPrices', existing.id)?.catch(() => {});
        } catch {
          // IPC unavailable — memory state remains the source of truth.
        }
        persistDiff({
          customerPriceHistory: [history as unknown as Record<string, unknown>]
        });
        get().logAudit('CUSTOMER_PRICE_REMOVED', 'CUSTOMER_PRODUCT_PRICE', existing.id, {
          customerId,
          productId,
          oldPrice: existing.price
        });
        return { success: true };
      },

      createStockReceipt: (receiptData, items) => {
        const receiptId = `sr-${Date.now()}`;
        const now = new Date().toISOString();

        const newReceipt: StockReceipt = {
          id: receiptId,
          receipt_number: `SR-2026-${Math.floor(100 + Math.random() * 900)}`,
          receipt_date: receiptData.receiptDate || now,
          supplier_name: receiptData.supplierName,
          reference_number: receiptData.referenceNumber,
          notes: receiptData.notes,
          status: 'RECEIVED',
          created_at: now,
          updated_at: now
        };

        const newItems: Record<string, StockReceiptItem> = {};
        const newMovements: Record<string, InventoryMovement> = {};

        items.forEach((item, index) => {
          const itemId = `sri-${receiptId}-${index + 1}`;
          newItems[itemId] = {
            id: itemId,
            stock_receipt_id: receiptId,
            product_id: item.productId,
            unit_id: item.unitId,
            quantity: item.quantity,
            unit_cost: item.unitCost,
            total_cost: roundCurrency(item.quantity * item.unitCost),
            created_at: now
          };

          const movId = `im-${Date.now()}-${index + 1}`;
          newMovements[movId] = {
            id: movId,
            product_id: item.productId,
            unit_id: item.unitId,
            quantity: item.quantity,
            movement_type: 'STOCK_IN',
            movement_date: receiptData.receiptDate || now,
            reference_type: 'STOCK_RECEIPT',
            reference_id: receiptId,
            notes: `Receipt from ${receiptData.supplierName} (Ref #${receiptData.referenceNumber || 'N/A'})`,
            created_at: now,
            created_by: OWNER_ID
          };
        });

        set((state) => ({
          stockReceipts: { ...state.stockReceipts, [receiptId]: newReceipt },
          stockReceiptItems: { ...state.stockReceiptItems, ...newItems },
          inventoryMovements: { ...state.inventoryMovements, ...newMovements }
        }));

        persistDiff({
          stockReceipts: [newReceipt as unknown as Record<string, unknown>],
          stockReceiptItems: Object.values(newItems) as unknown as Record<string, unknown>[],
          inventoryMovements: Object.values(newMovements) as unknown as Record<string, unknown>[]
        });

        get().logAudit(
          'STOCK_RECEIVED',
          'STOCK_RECEIPT',
          receiptId,
          newReceipt as unknown as Record<string, unknown>,
          null,
          { itemsCount: items.length }
        );

        return newReceipt;
      },

      dispatchInventoryToCustomer: ({
        customerId,
        productId,
        unitId,
        quantity,
        referenceId,
        movementDate
      }) => {
        const batchRes = get().dispatchBatchInventoryToCustomer({
          customerId,
          referenceId,
          movementDate,
          items: [{ productId, unitId, quantity }]
        });

        return {
          success: batchRes.success,
          movementId: batchRes.movementIds?.[0],
          referenceId: batchRes.referenceId,
          error: batchRes.error
        };
      },

      dispatchBatchInventoryToCustomer: ({
        customerId,
        referenceId,
        movementDate,
        items
      }) => {
        if (!items || items.length === 0) {
          return { success: false, error: 'At least one item must be specified for dispatch.' };
        }

        for (const item of items) {
          if (item.quantity <= 0) {
            return { success: false, error: 'All dispatch quantities must be greater than zero.' };
          }
        }

        const { products, productUnits, customers, getCurrentCompanyStock } = get();
        const customer = customers[customerId];

        if (!customer) return { success: false, error: 'Customer not found.' };

        // Validate stock for all items
        for (const item of items) {
          const product = products[item.productId];
          if (!product) return { success: false, error: `Product not found: ${item.productId}` };

          const pUnits = Object.values(productUnits).filter((pu) => pu.product_id === item.productId);
          const qtyInPrimary = convertQuantity(item.quantity, item.unitId, product.primary_unit_id, pUnits);
          const currentStock = getCurrentCompanyStock(item.productId);

          if (currentStock < qtyInPrimary) {
            return {
              success: false,
              error: `Insufficient company warehouse stock for "${product.product_name}". Available: ${currentStock}, Requested: ${qtyInPrimary}`
            };
          }
        }

        const now = new Date().toISOString();
        const date = movementDate || now;
        // One atomic document: header row + all movement rows share document_id.
        const floor = get().businessSettings.document_next_number;
        const claim = claimDocumentNumber(
          Object.values(get().dispatchDocuments),
          customerId,
          'DISPATCH',
          Number.isInteger(floor) && (floor as number) >= 1 ? (floor as number) : 1,
          referenceId
        );
        if (!claim.ok) return { success: false, error: claim.error };
        const refId = claim.number as string;
        const docId = `doc-${Date.now()}`;
        const header: DispatchDocument = {
          id: docId,
          document_number: refId,
          customer_id: customerId,
          document_type: 'DISPATCH',
          document_date: date,
          created_at: now
        };
        const updatedSettings: BusinessSettings = {
          ...get().businessSettings,
          document_next_number: claim.nextFloor as number,
          updated_at: now
        };

        const newCustomerMovs: Record<string, CustomerInventoryMovement> = {};
        const newCompanyMovs: Record<string, InventoryMovement> = {};
        const createdIds: string[] = [];

        items.forEach((item, idx) => {
          const cimId = `cim-${Date.now()}-${idx}`;
          const imId = `im-${Date.now()}-${idx}`;
          createdIds.push(cimId);

          newCustomerMovs[cimId] = {
            id: cimId,
            customer_id: customerId,
            product_id: item.productId,
            unit_id: item.unitId,
            quantity: item.quantity,
            movement_type: 'DISPATCH',
            movement_date: date,
            reference_type: 'DISPATCH',
            reference_id: refId,
            document_id: docId,
            created_at: now,
            created_by: OWNER_ID
          };

          newCompanyMovs[imId] = {
            id: imId,
            product_id: item.productId,
            unit_id: item.unitId,
            quantity: item.quantity,
            movement_type: 'CUSTOMER_DISPATCH',
            movement_date: date,
            reference_type: 'CUSTOMER_DISPATCH',
            reference_id: cimId,
            notes: `Dispatched to ${customer.customer_name} (Challan: ${refId})`,
            created_at: now,
            created_by: OWNER_ID
          };
        });

        set((state) => ({
          customerInventoryMovements: {
            ...state.customerInventoryMovements,
            ...newCustomerMovs
          },
          inventoryMovements: {
            ...state.inventoryMovements,
            ...newCompanyMovs
          },
          dispatchDocuments: {
            ...state.dispatchDocuments,
            [docId]: header
          },
          businessSettings: updatedSettings
        }));

        persistDiff({
          customerInventoryMovements: Object.values(newCustomerMovs) as unknown as Record<string, unknown>[],
          inventoryMovements: Object.values(newCompanyMovs) as unknown as Record<string, unknown>[],
          dispatchDocuments: [header as unknown as Record<string, unknown>],
          businessSettings: [updatedSettings as unknown as Record<string, unknown>]
        });

        get().logAudit('CUSTOMER_DISPATCH', 'CUSTOMER_INVENTORY_MOVEMENT', refId, {
          customerId,
          customerName: customer.customer_name,
          itemsCount: items.length,
          referenceId: refId
        });

        return { success: true, movementIds: createdIds, referenceId: refId };
      },

      createCustomerReturn: ({ customerId, productId, unitId, quantity, referenceId, movementDate }) => {
        if (quantity <= 0) {
          return { success: false, error: 'Return quantity must be greater than zero.' };
        }

        const { products, productUnits, customers, getCustomerProductInventory } = get();
        const product = products[productId];
        const customer = customers[customerId];

        if (!product) return { success: false, error: 'Product not found.' };
        if (!customer) return { success: false, error: 'Customer not found.' };

        // Convert requested return quantity to primary units to check customer inventory balance
        const pUnits = Object.values(productUnits).filter((pu) => pu.product_id === productId);
        const qtyInPrimary = convertQuantity(quantity, unitId, product.primary_unit_id, pUnits);
        const customerStock = getCustomerProductInventory(customerId, productId);

        if (customerStock < qtyInPrimary) {
          return {
            success: false,
            error: `Customer inventory insufficient for return. Held: ${customerStock}, Return attempted: ${qtyInPrimary} (Primary Units)`
          };
        }

        // Returns are accepted only against unbilled stock: once everything the
        // customer holds is billed, there is nothing left to take back. Uses the
        // same summary semantics as holdings/billing, so the definition of
        // "billed" can never drift between screens.
        const unbilledRow = get()
          .getCustomerInventorySummary(customerId)
          .find((s) => s.productId === productId);
        const unbilled = unbilledRow ? unbilledRow.unbilledQuantity : 0;
        if (qtyInPrimary > unbilled) {
          const unitCode = unbilledRow ? unbilledRow.unitCode : '';
          return {
            success: false,
            error: `Only ${unbilled} unbilled ${unitCode} available for return. Billed stock cannot be returned.`
          };
        }

        const now = new Date().toISOString();
        const date = movementDate || now;
        const cimId = `cim-${Date.now()}`;
        const imId = `im-${Date.now()}`;

        const floor = get().businessSettings.document_next_number;
        const claim = claimDocumentNumber(
          Object.values(get().dispatchDocuments),
          customerId,
          'RETURN',
          Number.isInteger(floor) && (floor as number) >= 1 ? (floor as number) : 1,
          referenceId
        );
        if (!claim.ok) return { success: false, error: claim.error };
        const returnRef = claim.number as string;
        const docId = `doc-${Date.now()}-ret`;
        const header: DispatchDocument = {
          id: docId,
          document_number: returnRef,
          customer_id: customerId,
          document_type: 'RETURN',
          document_date: date,
          created_at: now
        };
        const updatedSettings: BusinessSettings = {
          ...get().businessSettings,
          document_next_number: claim.nextFloor as number,
          updated_at: now
        };

        // ATOMIC MUTATION: header + Customer movement (RETURN) + Company movement (CUSTOMER_RETURN)
        const newCustomerMov: CustomerInventoryMovement = {
          id: cimId,
          customer_id: customerId,
          product_id: productId,
          unit_id: unitId,
          quantity,
          movement_type: 'RETURN',
          movement_date: date,
          reference_type: 'RETURN',
          reference_id: returnRef,
          document_id: docId,
          created_at: now,
          created_by: OWNER_ID
        };

        const newCompanyMov: InventoryMovement = {
          id: imId,
          product_id: productId,
          unit_id: unitId,
          quantity,
          movement_type: 'CUSTOMER_RETURN',
          movement_date: date,
          reference_type: 'CUSTOMER_RETURN',
          reference_id: cimId,
          notes: `Customer return from ${customer.customer_name} (Ref: ${newCustomerMov.reference_id})`,
          created_at: now,
          created_by: OWNER_ID
        };

        set((state) => ({
          customerInventoryMovements: {
            ...state.customerInventoryMovements,
            [cimId]: newCustomerMov
          },
          inventoryMovements: {
            ...state.inventoryMovements,
            [imId]: newCompanyMov
          },
          dispatchDocuments: {
            ...state.dispatchDocuments,
            [docId]: header
          },
          businessSettings: updatedSettings
        }));

        persistDiff({
          customerInventoryMovements: [newCustomerMov as unknown as Record<string, unknown>],
          inventoryMovements: [newCompanyMov as unknown as Record<string, unknown>],
          dispatchDocuments: [header as unknown as Record<string, unknown>],
          businessSettings: [updatedSettings as unknown as Record<string, unknown>]
        });

        get().logAudit('CUSTOMER_RETURN', 'CUSTOMER_INVENTORY_MOVEMENT', cimId, {
          customerId,
          customerName: customer.customer_name,
          productId,
          productName: product.product_name,
          quantity,
          referenceId: newCustomerMov.reference_id
        });

        return { success: true };
      },

      createInventoryAdjustment: ({ productId, unitId, quantity, movementType, notes }) => {
        if (quantity <= 0) return { success: false, error: 'Adjustment quantity must be greater than zero.' };
        const { products, productUnits, getCurrentCompanyStock } = get();
        const product = products[productId];
        if (!product) return { success: false, error: 'Product not found.' };

        const pUnits = Object.values(productUnits).filter((pu) => pu.product_id === productId);
        const qtyInPrimary = convertQuantity(quantity, unitId, product.primary_unit_id, pUnits);

        if (movementType === 'ADJUSTMENT_OUT') {
          const currentStock = getCurrentCompanyStock(productId);
          if (currentStock < qtyInPrimary) {
            return { success: false, error: `Insufficient stock for downward adjustment. Available: ${currentStock}` };
          }
        }

        const now = new Date().toISOString();
        const imId = `im-adj-${Date.now()}`;
        const newMov: InventoryMovement = {
          id: imId,
          product_id: productId,
          unit_id: unitId,
          quantity,
          movement_type: movementType,
          movement_date: now,
          reference_type: 'MANUAL_ADJUSTMENT',
          reference_id: imId,
          notes: notes || 'Physical audit reconciliation adjustment',
          created_at: now,
          created_by: OWNER_ID
        };

        set((state) => ({
          inventoryMovements: { ...state.inventoryMovements, [imId]: newMov }
        }));

        persistDiff({ inventoryMovements: [newMov as unknown as Record<string, unknown>] });

        get().logAudit('INVENTORY_ADJUSTED', 'INVENTORY_MOVEMENT', imId, {
          productId,
          movementType,
          quantity,
          notes
        });

        return { success: true };
      },

      ensureSeries: (fy: string) => {
        const existing = Object.values(get().invoiceSeries).find((s) => s.fy === fy);
        if (existing) return existing;
        const now = new Date().toISOString();
        const start = get().businessSettings.invoice_start_number;
        const row: InvoiceSeries = {
          id: `series-${fy}`,
          fy,
          next_number: Number.isInteger(start) && (start as number) >= 1 ? (start as number) : 1,
          start_number: Number.isInteger(start) && (start as number) >= 1 ? (start as number) : 1,
          created_at: now
        };
        set((state) => ({ invoiceSeries: { ...state.invoiceSeries, [row.id]: row } }));
        persistDiff({ invoiceSeries: [row as unknown as Record<string, unknown>] });
        get().logAudit('FY_SERIES_STARTED', 'INVOICE_SERIES', row.id, {
          fy,
          startNumber: row.start_number
        });
        return row;
      },

      startNewFySeries: () => {
        const fy = getFyForDate(new Date().toISOString());
        const existed = Object.values(get().invoiceSeries).some((s) => s.fy === fy);
        get().ensureSeries(fy);
        return { success: true, fy, existed };
      },

      setSeriesNextNumber: (fy: string, nextNumber: number) => {
        if (!Number.isInteger(nextNumber) || nextNumber < 1 || nextNumber > 999999999) {
          return { success: false, error: 'Next number must be a whole number of 1 or more.' };
        }
        const series = get().ensureSeries(fy);
        // Never rewind into already-issued numbers of this FY.
        let maxUsed = 0;
        for (const inv of Object.values(get().invoices)) {
          if (inv.fy === fy) {
            const n = Number(inv.invoice_number);
            if (Number.isInteger(n) && n > maxUsed) maxUsed = n;
          }
        }
        const floor = Math.max(series.start_number, maxUsed + 1);
        if (nextNumber < floor) {
          return {
            success: false,
            error: `Next number cannot go below ${floor} — higher numbers are already issued in FY ${fy}.`
          };
        }
        if (series.next_number === nextNumber) return { success: true };
        const updated: InvoiceSeries = { ...series, next_number: nextNumber };
        set((state) => ({ invoiceSeries: { ...state.invoiceSeries, [series.id]: updated } }));
        persistDiff({ invoiceSeries: [updated as unknown as Record<string, unknown>] });
        get().logAudit('FY_SERIES_UPDATED', 'INVOICE_SERIES', series.id, {
          fy,
          nextNumber
        });
        return { success: true };
      },

      createInvoice: ({ customerId, billingPeriodStart, billingPeriodEnd, items, otherCharges = 0, notes = '', status = 'DRAFT', invoiceDate }) => {
        const { customers, products, uoms, businessSettings } = get();
        const customer = customers[customerId];
        if (!customer) return { success: false, error: 'Customer not found.' };
        if (!items || items.length === 0) return { success: false, error: 'Invoice must contain at least one line item.' };

        const now = new Date().toISOString();
        // Backdated billing: the invoice belongs to its own date's FY, never the wall clock.
        const invDate = invoiceDate || now;
        if (Number.isNaN(Date.parse(invDate))) {
          return { success: false, error: 'Invoice date is invalid.' };
        }
        if (new Date(invDate).getTime() > Date.now()) {
          return { success: false, error: 'Invoice date cannot be in the future.' };
        }
        const fy = getFyForDate(invDate);
        const series = get().ensureSeries(fy);
        // Consume the next free plain number in this FY (skip legacy/edited collisions).
        let seq = series.next_number;
        let guard = 0;
        while (
          Object.values(get().invoices).some((i) => i.fy === fy && i.invoice_number === String(seq)) &&
          guard < 500
        ) {
          seq += 1;
          guard += 1;
        }
        if (guard >= 500) {
          return { success: false, error: `No free invoice number left near ${series.next_number} in FY ${fy}.` };
        }
        const invoiceNumber = String(seq);
        const updatedSeries: InvoiceSeries = { ...series, next_number: seq + 1 };

        const invoiceId = `inv-${Date.now()}`;

        // Build item snapshots and calculate taxes
        const newInvoiceItems: Record<string, InvoiceItem> = {};
        const newAllocations: Record<string, InvoiceCustomerInventoryAllocation> = {};
        const calculatedItemsForTotals: Array<{
          quantity: number;
          unit_price: number;
          discount?: number;
          taxable_amount?: number;
          cgst?: number;
          sgst?: number;
          igst?: number;
          line_total?: number;
        }> = [];

        items.forEach((item, index) => {
          const prod = products[item.productId];
          const uom = uoms[item.unitId];
          const itemId = `ii-${invoiceId}-${index + 1}`;

          const financials = calculateLineItemFinancials(
            item.quantity,
            item.unitPrice,
            item.discount || 0,
            businessSettings.default_gst_rate,
            0,
            businessSettings.state_code,
            getCustomerStateCode(customer)
          );

          newInvoiceItems[itemId] = {
            id: itemId,
            invoice_id: invoiceId,
            product_id: item.productId,
            product_name_snapshot: prod?.product_name || 'Item',
            sku_snapshot: prod?.sku || 'SKU',
            unit_id: item.unitId,
            uom_snapshot: uom?.code || 'PCS',
            quantity: item.quantity,
            unit_price: item.unitPrice,
            discount: item.discount || 0,
            taxable_amount: financials.taxableAmount,
            gst_rate: businessSettings.default_gst_rate,
            cgst: financials.cgst,
            sgst: financials.sgst,
            igst: financials.igst,
            extra_charges: 0,
            line_total: financials.lineTotal,
            created_at: now
          };

          calculatedItemsForTotals.push(newInvoiceItems[itemId]);

          // Process explicit customer movement allocations if provided
          if (item.movementAllocations && item.movementAllocations.length > 0) {
            item.movementAllocations.forEach((alloc, aIndex) => {
              const allocId = `ia-${invoiceId}-${index}-${aIndex}`;
              newAllocations[allocId] = {
                id: allocId,
                invoice_id: invoiceId,
                customer_inventory_movement_id: alloc.movementId,
                allocated_quantity: alloc.allocatedQuantity,
                created_at: now
              };
            });
          }
        });

        const totals = calculateInvoiceTotals(calculatedItemsForTotals, otherCharges);

        // PERSIST IMMUTABLE SNAPSHOTS
        const newInvoice: Invoice = {
          id: invoiceId,
          invoice_number: invoiceNumber,
          customer_id: customerId,
          invoice_date: invDate,
          fy,
          billing_period_start: billingPeriodStart,
          billing_period_end: billingPeriodEnd,
          status,
          subtotal: totals.subtotal,
          discount: totals.discount,
          taxable_amount: totals.taxableAmount,
          cgst: totals.cgst,
          sgst: totals.sgst,
          igst: totals.igst,
          other_charges: totals.otherCharges,
          grand_total: totals.grandTotal,
          customer_snapshot: {
            customer_name: customer.customer_name,
            pan: customer.pan,
            gst_number: customer.gst_number,
            email: '',
            mobile: customer.mobile,
            address: customer.address,
            city: customer.city,
            state: customer.state,
            country: customer.country,
            postal_code: customer.postal_code,
            state_code: getCustomerStateCode(customer)
          },
          business_snapshot: {
            business_name: businessSettings.business_name,
            legal_name: businessSettings.legal_name,
            gst_number: businessSettings.gst_number,
            pan: businessSettings.pan,
            address: businessSettings.address,
            city: businessSettings.city,
            state: businessSettings.state,
            country: businessSettings.country,
            postal_code: businessSettings.postal_code,
            phone: businessSettings.phone,
            email: businessSettings.email,
            website: businessSettings.website,
            state_code: businessSettings.state_code
          },
          bank_snapshot: {
            bank_name: businessSettings.bank_name,
            bank_account_number: businessSettings.bank_account_number,
            ifsc: businessSettings.ifsc,
            branch: businessSettings.branch
          },
          notes,
          created_at: now,
          updated_at: now
        };

        set((state) => ({
          invoices: { ...state.invoices, [invoiceId]: newInvoice },
          invoiceItems: { ...state.invoiceItems, ...newInvoiceItems },
          invoiceAllocations: { ...state.invoiceAllocations, ...newAllocations },
          invoiceSeries: { ...state.invoiceSeries, [updatedSeries.id]: updatedSeries }
        }));

        persistDiff({
          invoices: [newInvoice as unknown as Record<string, unknown>],
          invoiceItems: Object.values(newInvoiceItems) as unknown as Record<string, unknown>[],
          invoiceAllocations: Object.values(newAllocations) as unknown as Record<string, unknown>[],
          invoiceSeries: [updatedSeries as unknown as Record<string, unknown>]
        });

        get().logAudit(
          status === 'FINALIZED' ? 'INVOICE_FINALIZED' : 'INVOICE_CREATED',
          'INVOICE',
          invoiceId,
          {
            invoiceNumber,
            fy,
            customerName: customer.customer_name,
            grandTotal: totals.grandTotal,
            status
          }
        );

        return { success: true, invoiceId };
      },

      finalizeInvoice: (invoiceId: string) => {
        const invoice = get().invoices[invoiceId];
        if (!invoice) return { success: false, error: 'Invoice not found.' };
        if (invoice.status !== 'DRAFT') {
          return { success: false, error: `Cannot finalize invoice with status ${invoice.status}` };
        }

        const now = new Date().toISOString();
        const updated: Invoice = {
          ...invoice,
          status: 'FINALIZED',
          updated_at: now
        };

        set((state) => ({
          invoices: { ...state.invoices, [invoiceId]: updated }
        }));

        persistDiff({ invoices: [updated as unknown as Record<string, unknown>] });

        get().logAudit('INVOICE_FINALIZED', 'INVOICE', invoiceId, {
          invoiceNumber: invoice.invoice_number,
          grandTotal: invoice.grand_total
        });

        return { success: true };
      },

      cancelInvoice: (invoiceId: string, reason: string) => {
        const invoice = get().invoices[invoiceId];
        if (!invoice) return { success: false, error: 'Invoice not found.' };
        if (invoice.status === 'CANCELLED') {
          return { success: false, error: 'Invoice is already cancelled.' };
        }

        // Check if there are active payments against this invoice
        const payments = Object.values(get().invoicePayments).filter(
          (p) => p.invoice_id === invoiceId && p.status === 'ACTIVE'
        );
        if (payments.length > 0) {
          return {
            success: false,
            error: 'Cannot cancel invoice with active payments. Please cancel all payments first.'
          };
        }

        const now = new Date().toISOString();
        const updated: Invoice = {
          ...invoice,
          status: 'CANCELLED',
          notes: `${invoice.notes ? invoice.notes + ' | ' : ''}Cancelled: ${reason}`,
          updated_at: now
        };

        set((state) => ({
          invoices: { ...state.invoices, [invoiceId]: updated }
        }));

        persistDiff({ invoices: [updated as unknown as Record<string, unknown>] });

        get().logAudit('INVOICE_CANCELLED', 'INVOICE', invoiceId, {
          invoiceNumber: invoice.invoice_number,
          reason
        });

        return { success: true };
      },

      createInvoicePayment: ({ invoiceId, amount, paymentMethod, referenceNumber, notes, paymentDate }) => {
        if (amount <= 0) return { success: false, error: 'Payment amount must be greater than zero.' };

        const invoice = get().invoices[invoiceId];
        if (!invoice) return { success: false, error: 'Invoice not found.' };
        if (invoice.status !== 'FINALIZED') {
          return { success: false, error: 'Payments can only be recorded against finalized invoices.' };
        }

        const { outstanding } = get().getInvoiceOutstanding(invoiceId);
        if (roundCurrency(amount) > roundCurrency(outstanding)) {
          return {
            success: false,
            error: `Payment amount (${amount}) exceeds remaining outstanding balance (${outstanding}).`
          };
        }

        const now = new Date().toISOString();
        const payId = `pay-${Date.now()}`;
        const newPayment: InvoicePayment = {
          id: payId,
          invoice_id: invoiceId,
          payment_date: paymentDate || now,
          amount: roundCurrency(amount),
          payment_method: paymentMethod,
          reference_number: referenceNumber || `REF-${Math.floor(100000 + Math.random() * 900000)}`,
          notes: notes || '',
          status: 'ACTIVE',
          created_at: now,
          updated_at: now
        };

        set((state) => ({
          invoicePayments: { ...state.invoicePayments, [payId]: newPayment }
        }));

        persistDiff({ invoicePayments: [newPayment as unknown as Record<string, unknown>] });

        get().logAudit('PAYMENT_CREATED', 'INVOICE_PAYMENT', payId, {
          invoiceId,
          invoiceNumber: invoice.invoice_number,
          amount: newPayment.amount,
          paymentMethod
        });

        return { success: true, paymentId: payId };
      },

      cancelInvoicePayment: (paymentId: string, reason: string) => {
        const payment = get().invoicePayments[paymentId];
        if (!payment) return { success: false, error: 'Payment not found.' };
        if (payment.status === 'CANCELLED') {
          return { success: false, error: 'Payment is already cancelled.' };
        }

        const now = new Date().toISOString();
        const updated: InvoicePayment = {
          ...payment,
          status: 'CANCELLED',
          notes: `${payment.notes ? payment.notes + ' | ' : ''}Reversed/Cancelled: ${reason}`,
          updated_at: now
        };

        set((state) => ({
          invoicePayments: { ...state.invoicePayments, [paymentId]: updated }
        }));

        persistDiff({ invoicePayments: [updated as unknown as Record<string, unknown>] });
        get().logAudit('PAYMENT_CANCELLED', 'INVOICE_PAYMENT', paymentId, {
          invoiceId: payment.invoice_id,
          amount: payment.amount,
          reason
        });

        return { success: true };
      },

      logAudit: (action, entityType, entityId, newData = null, oldData = null, metadata = null) => {
        const newLog: AuditLog = {
          id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          user_id: OWNER_ID,
          user_name: OWNER_NAME,
          action,
          entity_type: entityType,
          entity_id: entityId,
          new_data: newData,
          old_data: oldData,
          metadata,
          created_at: new Date().toISOString()
        };

        set((state) => ({
          auditLogs: [newLog, ...state.auditLogs]
        }));
        if (window.electronAPI && action !== 'APP_START') window.electronAPI.audit_logs.upsert(newLog);
      },

      resetToSeedData: () => {
        // Remove rows that exist in SQLite but not in the seed snapshot,
        // otherwise they would resurrect on the next launch. Audit logs are
        // intentionally append-only (compliance trail) and are not deleted.
        const before = get();
        const seedMaps: Array<[Record<string, unknown>, Record<string, unknown>, string]> = [
          [before.uoms as unknown as Record<string, unknown>, SEED_UOMS as unknown as Record<string, unknown>, 'uoms'],
          [before.customers as unknown as Record<string, unknown>, SEED_CUSTOMERS as unknown as Record<string, unknown>, 'customers'],
          [before.products as unknown as Record<string, unknown>, SEED_PRODUCTS as unknown as Record<string, unknown>, 'products'],
          [before.productUnits as unknown as Record<string, unknown>, SEED_PRODUCT_UNITS as unknown as Record<string, unknown>, 'productUnits'],
          [before.productPrices as unknown as Record<string, unknown>, SEED_PRODUCT_PRICES as unknown as Record<string, unknown>, 'productPrices'],
          [before.customerPrices as unknown as Record<string, unknown>, {} as Record<string, unknown>, 'customerPrices'],
          [before.customerPriceHistory as unknown as Record<string, unknown>, {} as Record<string, unknown>, 'customerPriceHistory'],
          [before.stockReceipts as unknown as Record<string, unknown>, SEED_STOCK_RECEIPTS as unknown as Record<string, unknown>, 'stockReceipts'],
          [before.stockReceiptItems as unknown as Record<string, unknown>, SEED_STOCK_RECEIPT_ITEMS as unknown as Record<string, unknown>, 'stockReceiptItems'],
          [before.inventoryMovements as unknown as Record<string, unknown>, SEED_INVENTORY_MOVEMENTS as unknown as Record<string, unknown>, 'inventoryMovements'],
          [before.customerInventoryMovements as unknown as Record<string, unknown>, SEED_CUSTOMER_INVENTORY_MOVEMENTS as unknown as Record<string, unknown>, 'customerInventoryMovements'],
          [before.dispatchDocuments as unknown as Record<string, unknown>, {} as Record<string, unknown>, 'dispatchDocuments'],
          [before.invoices as unknown as Record<string, unknown>, SEED_INVOICES as unknown as Record<string, unknown>, 'invoices'],
          [before.invoiceItems as unknown as Record<string, unknown>, SEED_INVOICE_ITEMS as unknown as Record<string, unknown>, 'invoiceItems'],
          [before.invoiceAllocations as unknown as Record<string, unknown>, SEED_INVOICE_ALLOCATIONS as unknown as Record<string, unknown>, 'invoiceAllocations'],
          [before.invoiceSeries as unknown as Record<string, unknown>, {} as Record<string, unknown>, 'invoiceSeries'],
          [before.invoicePayments as unknown as Record<string, unknown>, SEED_INVOICE_PAYMENTS as unknown as Record<string, unknown>, 'invoicePayments']
        ];
        for (const [currentMap, seedMap, entityType] of seedMaps) {
          for (const id of Object.keys(currentMap)) {
            if (!seedMap[id]) {
              try {
                window.electronAPI?.store.delete(entityType, id)?.catch(() => {});
              } catch {
                // IPC unavailable — memory state remains the source of truth.
              }
            }
          }
        }
        // Business settings is a single row: upsert covers it via persistDiff below.
        set({
          businessSettings: { ...SEED_BUSINESS_SETTINGS },
          uoms: { ...SEED_UOMS },
          customers: { ...SEED_CUSTOMERS },
          products: { ...SEED_PRODUCTS },
          productUnits: { ...SEED_PRODUCT_UNITS },
          productPrices: { ...SEED_PRODUCT_PRICES },
          customerPrices: {},
          customerPriceHistory: {},
          stockReceipts: { ...SEED_STOCK_RECEIPTS },
          stockReceiptItems: { ...SEED_STOCK_RECEIPT_ITEMS },
          inventoryMovements: { ...SEED_INVENTORY_MOVEMENTS },
          customerInventoryMovements: { ...SEED_CUSTOMER_INVENTORY_MOVEMENTS },
          dispatchDocuments: {},
          invoices: { ...SEED_INVOICES },
          invoiceItems: { ...SEED_INVOICE_ITEMS },
          invoiceAllocations: { ...SEED_INVOICE_ALLOCATIONS },
          invoiceSeries: {},
          invoicePayments: { ...SEED_INVOICE_PAYMENTS },
          auditLogs: [...SEED_AUDIT_LOGS]
        });
        // Reset must survive reload: overwrite SQLite with the seed snapshot.
        persistDiff({
          businessSettings: [SEED_BUSINESS_SETTINGS as unknown as Record<string, unknown>],
          uoms: Object.values(SEED_UOMS) as unknown as Record<string, unknown>[],
          customers: Object.values(SEED_CUSTOMERS) as unknown as Record<string, unknown>[],
          products: Object.values(SEED_PRODUCTS) as unknown as Record<string, unknown>[],
          productUnits: Object.values(SEED_PRODUCT_UNITS) as unknown as Record<string, unknown>[],
          productPrices: Object.values(SEED_PRODUCT_PRICES) as unknown as Record<string, unknown>[],
          stockReceipts: Object.values(SEED_STOCK_RECEIPTS) as unknown as Record<string, unknown>[],
          stockReceiptItems: Object.values(SEED_STOCK_RECEIPT_ITEMS) as unknown as Record<string, unknown>[],
          inventoryMovements: Object.values(SEED_INVENTORY_MOVEMENTS) as unknown as Record<string, unknown>[],
          customerInventoryMovements: Object.values(SEED_CUSTOMER_INVENTORY_MOVEMENTS) as unknown as Record<string, unknown>[],
          invoices: Object.values(SEED_INVOICES) as unknown as Record<string, unknown>[],
          invoiceItems: Object.values(SEED_INVOICE_ITEMS) as unknown as Record<string, unknown>[],
          invoiceAllocations: Object.values(SEED_INVOICE_ALLOCATIONS) as unknown as Record<string, unknown>[],
          invoicePayments: Object.values(SEED_INVOICE_PAYMENTS) as unknown as Record<string, unknown>[],
          auditLogs: [...SEED_AUDIT_LOGS] as unknown as Record<string, unknown>[]
        });
      }
    }),
    {
      name: 'acculedger_accounting_store_v1',
      storage: createJSONStorage(() => electronStorage),
      version: 4,
      migrate: (persistedState: any) => {
        if (!persistedState) return persistedState;
        // v3: single-owner — drop any legacy multi-user session payload.
        const { users: _legacyUsers, currentUser: _legacyCurrent, ...rest } = persistedState;
        // GST slab change: 18% total (9% CGST + 9% SGST) -> 5% total (2.5% + 2.5%).
        // Bump only known old app defaults (18, and the transient 10 from the
        // intermediate change); a deliberately custom rate is preserved.
        let businessSettings = persistedState.businessSettings;
        if (
          businessSettings &&
          (businessSettings.default_gst_rate === 18 || businessSettings.default_gst_rate === 10)
        ) {
          businessSettings = {
            ...businessSettings,
            default_gst_rate: 5,
            updated_at: new Date().toISOString()
          };
        }
        // v4: FY numbering — default the series start number and map for old payloads.
        if (
          businessSettings &&
          (typeof businessSettings.invoice_start_number !== 'number' ||
            !Number.isInteger(businessSettings.invoice_start_number) ||
            businessSettings.invoice_start_number < 1)
        ) {
          businessSettings = {
            ...businessSettings,
            invoice_start_number: 1,
            updated_at: new Date().toISOString()
          };
        }
        if (
          businessSettings &&
          (typeof businessSettings.customer_next_number !== 'number' ||
            !Number.isInteger(businessSettings.customer_next_number) ||
            businessSettings.customer_next_number < 1)
        ) {
          businessSettings = {
            ...businessSettings,
            customer_next_number: 1,
            updated_at: new Date().toISOString()
          };
        }
        if (
          businessSettings &&
          (typeof businessSettings.document_next_number !== 'number' ||
            !Number.isInteger(businessSettings.document_next_number) ||
            businessSettings.document_next_number < 1)
        ) {
          businessSettings = {
            ...businessSettings,
            document_next_number: 1,
            updated_at: new Date().toISOString()
          };
        }
        return {
          ...rest,
          invoiceSeries: (rest as { invoiceSeries?: unknown }).invoiceSeries ?? {},
          dispatchDocuments: (rest as { dispatchDocuments?: unknown }).dispatchDocuments ?? {},
          businessSettings: businessSettings ?? persistedState.businessSettings
        };
      },
      onRehydrateStorage: () => (state) => {
        // Mirror of the migrate() GST slab bump for payloads already at
        // the current version (e.g. web-mode localStorage). Idempotent.
        if (
          state?.businessSettings &&
          (state.businessSettings.default_gst_rate === 18 ||
            state.businessSettings.default_gst_rate === 10)
        ) {
          state.businessSettings = {
            ...state.businessSettings,
            default_gst_rate: 5,
            updated_at: new Date().toISOString()
          };
        }
        if (
          state?.businessSettings &&
          (typeof state.businessSettings.invoice_start_number !== 'number' ||
            !Number.isInteger(state.businessSettings.invoice_start_number) ||
            state.businessSettings.invoice_start_number < 1)
        ) {
          state.businessSettings = {
            ...state.businessSettings,
            invoice_start_number: 1,
            updated_at: new Date().toISOString()
          };
        }
        if (
          state?.businessSettings &&
          (typeof state.businessSettings.customer_next_number !== 'number' ||
            !Number.isInteger(state.businessSettings.customer_next_number) ||
            state.businessSettings.customer_next_number < 1)
        ) {
          state.businessSettings = {
            ...state.businessSettings,
            customer_next_number: 1,
            updated_at: new Date().toISOString()
          };
        }
        if (
          state?.businessSettings &&
          (typeof state.businessSettings.document_next_number !== 'number' ||
            !Number.isInteger(state.businessSettings.document_next_number) ||
            state.businessSettings.document_next_number < 1)
        ) {
          state.businessSettings = {
            ...state.businessSettings,
            document_next_number: 1,
            updated_at: new Date().toISOString()
          };
        }
        if (state && !state.invoiceSeries) {
          (state as unknown as Record<string, unknown>).invoiceSeries = {};
        }
        if (state && !state.dispatchDocuments) {
          (state as unknown as Record<string, unknown>).dispatchDocuments = {};
        }
        if (state && !(state as unknown as Record<string, unknown>).dispatchDocuments) {
          (state as unknown as Record<string, unknown>).dispatchDocuments = {};
        }
        // Strip legacy multi-user payload if present.
        if (state && 'users' in (state as unknown as object)) delete (state as unknown as Record<string, unknown>).users;
        if (state && 'currentUser' in (state as unknown as object)) delete (state as unknown as Record<string, unknown>).currentUser;
      }
    }
  )
);
