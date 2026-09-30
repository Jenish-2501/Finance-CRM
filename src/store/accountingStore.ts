import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  AppUser,
  BusinessSettings,
  UnitOfMeasure,
  Customer,
  Product,
  ProductUnit,
  ProductPrice,
  StockReceipt,
  StockReceiptItem,
  InventoryMovement,
  CustomerInventoryMovement,
  Invoice,
  InvoiceItem,
  InvoiceCustomerInventoryAllocation,
  InvoicePayment,
  AuditLog,
  InvoiceStatus,
  PaymentMethod
} from '../types/database';
import {
  SEED_USERS,
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
  calculateTax,
  calculateLineItemFinancials,
  calculateInvoiceTotals,
  calculateInvoiceOutstanding
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
  // Relational Entities
  users: Record<string, AppUser>;
  currentUser: AppUser | null;
  businessSettings: BusinessSettings;
  uoms: Record<string, UnitOfMeasure>;
  customers: Record<string, Customer>;
  products: Record<string, Product>;
  productUnits: Record<string, ProductUnit>;
  productPrices: Record<string, ProductPrice>;
  stockReceipts: Record<string, StockReceipt>;
  stockReceiptItems: Record<string, StockReceiptItem>;
  inventoryMovements: Record<string, InventoryMovement>;
  customerInventoryMovements: Record<string, CustomerInventoryMovement>;
  invoices: Record<string, Invoice>;
  invoiceItems: Record<string, InvoiceItem>;
  invoiceAllocations: Record<string, InvoiceCustomerInventoryAllocation>;
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

  // Actions
  setCurrentUser: (userId: string) => void;
  updateBusinessSettings: (data: Partial<BusinessSettings>) => void;
  createUOM: (data: Omit<UnitOfMeasure, 'id' | 'created_at' | 'updated_at'>) => UnitOfMeasure;
  createCustomer: (data: Omit<Customer, 'id' | 'created_at' | 'updated_at'>) => Customer;
  updateCustomer: (id: string, data: Partial<Customer>) => void;
  deleteCustomer: (id: string) => { success: boolean; message?: string };

  createProduct: (
    productData: Omit<Product, 'id' | 'created_at' | 'updated_at'>,
    initialPrice: number,
    secondaryUnitConfig?: { unitId: string; conversionToPrimary: number; price: number }
  ) => Product;
  updateProduct: (id: string, data: Partial<Product>) => void;
  configureProductUnit: (data: Omit<ProductUnit, 'id' | 'created_at' | 'updated_at'>) => ProductUnit;
  createProductPrice: (data: Omit<ProductPrice, 'id' | 'created_at' | 'updated_at'>) => ProductPrice;

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
    notes: string;
    movementDate?: string;
  }) => { success: boolean; error?: string };

  createCustomerReturn: (params: {
    customerId: string;
    productId: string;
    unitId: string;
    quantity: number;
    referenceId: string;
    notes: string;
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

export const useAccountingStore = create<AccountingState>()(
  persist(
    (set, get) => ({
      users: { ...SEED_USERS },
      currentUser: SEED_USERS['usr-1'],
      businessSettings: { ...SEED_BUSINESS_SETTINGS },
      uoms: { ...SEED_UOMS },
      customers: { ...SEED_CUSTOMERS },
      products: { ...SEED_PRODUCTS },
      productUnits: { ...SEED_PRODUCT_UNITS },
      productPrices: { ...SEED_PRODUCT_PRICES },
      stockReceipts: { ...SEED_STOCK_RECEIPTS },
      stockReceiptItems: { ...SEED_STOCK_RECEIPT_ITEMS },
      inventoryMovements: { ...SEED_INVENTORY_MOVEMENTS },
      customerInventoryMovements: { ...SEED_CUSTOMER_INVENTORY_MOVEMENTS },
      invoices: { ...SEED_INVOICES },
      invoiceItems: { ...SEED_INVOICE_ITEMS },
      invoiceAllocations: { ...SEED_INVOICE_ALLOCATIONS },
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
          uoms,
          productPrices
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

          // Find active price for this product and unit
          const activePrice =
            Object.values(productPrices).find(
              (pp) => pp.product_id === prod.id && pp.unit_id === mov.unit_id && !pp.effective_to
            )?.price || 0;

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
              applicablePrice: activePrice
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
      setCurrentUser: (userId: string) => {
        const { users } = get();
        if (users[userId]) {
          set({ currentUser: users[userId] });
        }
      },

      updateBusinessSettings: (data: Partial<BusinessSettings>) => {
        const current = get().businessSettings;
        const updated: BusinessSettings = {
          ...current,
          ...data,
          updated_at: new Date().toISOString()
        };
        set({ businessSettings: updated });
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
        get().logAudit('UOM_CREATED', 'UNIT_OF_MEASURE', id, newUOM as unknown as Record<string, unknown>);
        return newUOM;
      },

      createCustomer: (data) => {
        const id = `cust-${Date.now()}`;
        const newCust: Customer = {
          ...data,
          id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        set((state) => ({
          customers: { ...state.customers, [id]: newCust }
        }));
        get().logAudit('CUSTOMER_CREATED', 'CUSTOMER', id, newCust as unknown as Record<string, unknown>);
        return newCust;
      },

      updateCustomer: (id: string, data: Partial<Customer>) => {
        const oldCust = get().customers[id];
        if (!oldCust) return;
        const updatedCust: Customer = {
          ...oldCust,
          ...data,
          updated_at: new Date().toISOString()
        };
        set((state) => ({
          customers: { ...state.customers, [id]: updatedCust }
        }));
        get().logAudit(
          'CUSTOMER_UPDATED',
          'CUSTOMER',
          id,
          updatedCust as unknown as Record<string, unknown>,
          oldCust as unknown as Record<string, unknown>
        );
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
        get().logAudit('CUSTOMER_DELETED', 'CUSTOMER', id);
        return { success: true };
      },

      createProduct: (productData, initialPrice, secondaryUnitConfig) => {
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

        if (secondaryUnitConfig) {
          const secPuId = `pu-${id}-sec`;
          newUnits[secPuId] = {
            id: secPuId,
            product_id: id,
            unit_id: secondaryUnitConfig.unitId,
            conversion_to_primary: secondaryUnitConfig.conversionToPrimary,
            is_stock_unit: true,
            is_billing_unit: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          const secPriceId = `pp-${id}-sec`;
          newPrices[secPriceId] = {
            id: secPriceId,
            product_id: id,
            unit_id: secondaryUnitConfig.unitId,
            price: secondaryUnitConfig.price,
            effective_from: new Date().toISOString(),
            effective_to: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
        }

        set((state) => ({
          products: { ...state.products, [id]: newProd },
          productUnits: { ...state.productUnits, ...newUnits },
          productPrices: { ...state.productPrices, ...newPrices }
        }));

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
        get().logAudit('PRODUCT_UNIT_CONFIGURED', 'PRODUCT_UNIT', id, newPU as unknown as Record<string, unknown>);
        return newPU;
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
          }
        }
        updatedPrices[id] = newPrice;

        set({ productPrices: updatedPrices });
        get().logAudit('PRODUCT_PRICE_UPDATED', 'PRODUCT_PRICE', id, newPrice as unknown as Record<string, unknown>);
        return newPrice;
      },

      createStockReceipt: (receiptData, items) => {
        const receiptId = `sr-${Date.now()}`;
        const now = new Date().toISOString();
        const user = get().currentUser;

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
            created_by: user?.id || 'usr-admin'
          };
        });

        set((state) => ({
          stockReceipts: { ...state.stockReceipts, [receiptId]: newReceipt },
          stockReceiptItems: { ...state.stockReceiptItems, ...newItems },
          inventoryMovements: { ...state.inventoryMovements, ...newMovements }
        }));

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

      dispatchInventoryToCustomer: ({ customerId, productId, unitId, quantity, referenceId, notes, movementDate }) => {
        if (quantity <= 0) {
          return { success: false, error: 'Dispatch quantity must be greater than zero.' };
        }

        const { products, productUnits, customers, getCurrentCompanyStock, currentUser } = get();
        const product = products[productId];
        const customer = customers[customerId];

        if (!product) return { success: false, error: 'Product not found.' };
        if (!customer) return { success: false, error: 'Customer not found.' };

        // Convert requested quantity to primary units to check company stock
        const pUnits = Object.values(productUnits).filter((pu) => pu.product_id === productId);
        const qtyInPrimary = convertQuantity(quantity, unitId, product.primary_unit_id, pUnits);
        const currentStock = getCurrentCompanyStock(productId);

        if (currentStock < qtyInPrimary) {
          return {
            success: false,
            error: `Insufficient company stock. Available: ${currentStock}, Requested: ${qtyInPrimary} (Primary Units)`
          };
        }

        const now = new Date().toISOString();
        const date = movementDate || now;
        const cimId = `cim-${Date.now()}`;
        const imId = `im-${Date.now()}`;

        // ATOMIC MUTATION: Customer movement and Company movement together
        const newCustomerMov: CustomerInventoryMovement = {
          id: cimId,
          customer_id: customerId,
          product_id: productId,
          unit_id: unitId,
          quantity,
          movement_type: 'DISPATCH',
          movement_date: date,
          reference_type: 'DISPATCH',
          reference_id: referenceId || `CH-${Math.floor(1000 + Math.random() * 9000)}`,
          notes: notes || `Direct site dispatch to ${customer.customer_name}`,
          created_at: now,
          created_by: currentUser?.id || 'usr-admin'
        };

        const newCompanyMov: InventoryMovement = {
          id: imId,
          product_id: productId,
          unit_id: unitId,
          quantity,
          movement_type: 'CUSTOMER_DISPATCH',
          movement_date: date,
          reference_type: 'CUSTOMER_DISPATCH',
          reference_id: cimId,
          notes: `Dispatched to ${customer.customer_name} (Ref: ${newCustomerMov.reference_id})`,
          created_at: now,
          created_by: currentUser?.id || 'usr-admin'
        };

        set((state) => ({
          customerInventoryMovements: {
            ...state.customerInventoryMovements,
            [cimId]: newCustomerMov
          },
          inventoryMovements: {
            ...state.inventoryMovements,
            [imId]: newCompanyMov
          }
        }));

        get().logAudit('CUSTOMER_DISPATCH', 'CUSTOMER_INVENTORY_MOVEMENT', cimId, {
          customerId,
          customerName: customer.customer_name,
          productId,
          productName: product.product_name,
          quantity,
          referenceId: newCustomerMov.reference_id
        });

        return { success: true };
      },

      createCustomerReturn: ({ customerId, productId, unitId, quantity, referenceId, notes, movementDate }) => {
        if (quantity <= 0) {
          return { success: false, error: 'Return quantity must be greater than zero.' };
        }

        const { products, productUnits, customers, getCustomerProductInventory, currentUser } = get();
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

        const now = new Date().toISOString();
        const date = movementDate || now;
        const cimId = `cim-${Date.now()}`;
        const imId = `im-${Date.now()}`;

        // ATOMIC MUTATION: Customer movement (RETURN) and Company movement (CUSTOMER_RETURN)
        const newCustomerMov: CustomerInventoryMovement = {
          id: cimId,
          customer_id: customerId,
          product_id: productId,
          unit_id: unitId,
          quantity,
          movement_type: 'RETURN',
          movement_date: date,
          reference_type: 'RETURN',
          reference_id: referenceId || `RET-${Math.floor(100 + Math.random() * 900)}`,
          notes: notes || `Return from ${customer.customer_name}`,
          created_at: now,
          created_by: currentUser?.id || 'usr-admin'
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
          created_by: currentUser?.id || 'usr-admin'
        };

        set((state) => ({
          customerInventoryMovements: {
            ...state.customerInventoryMovements,
            [cimId]: newCustomerMov
          },
          inventoryMovements: {
            ...state.inventoryMovements,
            [imId]: newCompanyMov
          }
        }));

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
        const { products, productUnits, getCurrentCompanyStock, currentUser } = get();
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
          created_by: currentUser?.id || 'usr-admin'
        };

        set((state) => ({
          inventoryMovements: { ...state.inventoryMovements, [imId]: newMov }
        }));

        get().logAudit('INVENTORY_ADJUSTED', 'INVENTORY_MOVEMENT', imId, {
          productId,
          movementType,
          quantity,
          notes
        });

        return { success: true };
      },

      createInvoice: ({ customerId, billingPeriodStart, billingPeriodEnd, items, otherCharges = 0, notes = '', status = 'DRAFT' }) => {
        const { customers, products, uoms, businessSettings } = get();
        const customer = customers[customerId];
        if (!customer) return { success: false, error: 'Customer not found.' };
        if (!items || items.length === 0) return { success: false, error: 'Invoice must contain at least one line item.' };

        const now = new Date().toISOString();
        const invoiceId = `inv-${Date.now()}`;
        const invoiceNumber = `${businessSettings.invoice_prefix}${businessSettings.invoice_next_number}`;

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
            customer.state_code
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
          invoice_date: now,
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
            email: customer.email,
            mobile: customer.mobile,
            address: customer.address,
            city: customer.city,
            state: customer.state,
            country: customer.country,
            postal_code: customer.postal_code,
            state_code: customer.state_code
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
          businessSettings: {
            ...state.businessSettings,
            invoice_next_number: state.businessSettings.invoice_next_number + 1
          }
        }));

        get().logAudit(
          status === 'FINALIZED' ? 'INVOICE_FINALIZED' : 'INVOICE_CREATED',
          'INVOICE',
          invoiceId,
          {
            invoiceNumber,
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

        get().logAudit('PAYMENT_CANCELLED', 'INVOICE_PAYMENT', paymentId, {
          invoiceId: payment.invoice_id,
          amount: payment.amount,
          reason
        });

        return { success: true };
      },

      logAudit: (action, entityType, entityId, newData = null, oldData = null, metadata = null) => {
        const user = get().currentUser;
        const newLog: AuditLog = {
          id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          user_id: user?.id || 'usr-system',
          user_name: user?.name || 'System Administrator',
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
      },

      resetToSeedData: () => {
        set({
          users: { ...SEED_USERS },
          currentUser: SEED_USERS['usr-1'],
          businessSettings: { ...SEED_BUSINESS_SETTINGS },
          uoms: { ...SEED_UOMS },
          customers: { ...SEED_CUSTOMERS },
          products: { ...SEED_PRODUCTS },
          productUnits: { ...SEED_PRODUCT_UNITS },
          productPrices: { ...SEED_PRODUCT_PRICES },
          stockReceipts: { ...SEED_STOCK_RECEIPTS },
          stockReceiptItems: { ...SEED_STOCK_RECEIPT_ITEMS },
          inventoryMovements: { ...SEED_INVENTORY_MOVEMENTS },
          customerInventoryMovements: { ...SEED_CUSTOMER_INVENTORY_MOVEMENTS },
          invoices: { ...SEED_INVOICES },
          invoiceItems: { ...SEED_INVOICE_ITEMS },
          invoiceAllocations: { ...SEED_INVOICE_ALLOCATIONS },
          invoicePayments: { ...SEED_INVOICE_PAYMENTS },
          auditLogs: [...SEED_AUDIT_LOGS]
        });
      }
    }),
    {
      name: 'acculedger_accounting_store_v1',
      version: 2,
      migrate: (persistedState: any) => {
        if (!persistedState) return persistedState;
        const adminOnly: Record<string, AppUser> = {};
        if (persistedState.users) {
          for (const [k, u] of Object.entries<any>(persistedState.users)) {
            if (u.role === 'ADMIN') {
              adminOnly[k] = u;
            }
          }
        }
        if (Object.keys(adminOnly).length === 0) {
          adminOnly['usr-1'] = SEED_USERS['usr-1'];
        }
        return {
          ...persistedState,
          users: adminOnly,
          currentUser: adminOnly['usr-1'] || Object.values(adminOnly)[0]
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state && state.users) {
          const adminOnly: Record<string, AppUser> = {};
          for (const [k, u] of Object.entries(state.users)) {
            if (u.role === 'ADMIN') {
              adminOnly[k] = u;
            }
          }
          if (Object.keys(adminOnly).length === 0) {
            adminOnly['usr-1'] = SEED_USERS['usr-1'];
          }
          state.users = adminOnly;
          if (!state.currentUser || state.currentUser.role !== 'ADMIN') {
            state.currentUser = adminOnly['usr-1'] || Object.values(adminOnly)[0];
          }
        }
      }
    }
  )
);
