/**
 * Service Abstraction Layer
 * Decouples UI components from store implementation for seamless future REST/GraphQL/Server Action migration.
 */

import { useAccountingStore } from '../store/accountingStore';
import { Customer, Product, InvoiceStatus, PaymentMethod } from '../types/database';
import { roundCurrency } from '../utils/calculations';

export const CustomerService = {
  getAll: () => Object.values(useAccountingStore.getState().customers),
  getById: (id: string) => useAccountingStore.getState().customers[id] || null,
  create: (data: Omit<Customer, 'id' | 'created_at' | 'updated_at'>) =>
    useAccountingStore.getState().createCustomer(data),
  update: (id: string, data: Partial<Customer>) =>
    useAccountingStore.getState().updateCustomer(id, data),
  delete: (id: string) => useAccountingStore.getState().deleteCustomer(id),
  getOutstanding: (id: string) => useAccountingStore.getState().getCustomerOutstanding(id),
  getInventorySummary: (id: string) => useAccountingStore.getState().getCustomerInventorySummary(id)
};

export const ProductService = {
  getAll: () => Object.values(useAccountingStore.getState().products),
  getById: (id: string) => useAccountingStore.getState().products[id] || null,
  getUnits: (productId: string) =>
    Object.values(useAccountingStore.getState().productUnits).filter((pu) => pu.product_id === productId),
  getPrices: (productId: string) =>
    Object.values(useAccountingStore.getState().productPrices).filter((pp) => pp.product_id === productId),
  getStock: (productId: string) => useAccountingStore.getState().getCurrentCompanyStock(productId),
  create: (
    productData: Omit<Product, 'id' | 'created_at' | 'updated_at'>,
    initialPrice: number,
    secondaryUnit?: { unitId: string; conversionToPrimary: number; price: number }
  ) => useAccountingStore.getState().createProduct(productData, initialPrice, secondaryUnit),
  update: (id: string, data: Partial<Product>) =>
    useAccountingStore.getState().updateProduct(id, data),
  addPrice: (productId: string, unitId: string, price: number) =>
    useAccountingStore.getState().createProductPrice({
      product_id: productId,
      unit_id: unitId,
      price,
      effective_from: new Date().toISOString(),
      effective_to: null
    })
};

export const InventoryService = {
  getCompanyStock: (productId: string) => useAccountingStore.getState().getCurrentCompanyStock(productId),
  getMovements: () => Object.values(useAccountingStore.getState().inventoryMovements),
  getReceipts: () => Object.values(useAccountingStore.getState().stockReceipts),
  getReceiptItems: (receiptId: string) =>
    Object.values(useAccountingStore.getState().stockReceiptItems).filter((i) => i.stock_receipt_id === receiptId),
  receiveStock: (
    receiptData: { supplierName: string; referenceNumber: string; receiptDate: string; notes: string },
    items: Array<{ productId: string; unitId: string; quantity: number; unitCost: number }>
  ) => useAccountingStore.getState().createStockReceipt(receiptData, items),
  adjustStock: (params: {
    productId: string;
    unitId: string;
    quantity: number;
    movementType: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';
    notes: string;
  }) => useAccountingStore.getState().createInventoryAdjustment(params)
};

export const CustomerInventoryService = {
  getMovements: (customerId?: string) => {
    const movements = Object.values(useAccountingStore.getState().customerInventoryMovements);
    if (!customerId) return movements;
    return movements.filter((m) => m.customer_id === customerId);
  },
  getProductBalance: (customerId: string, productId: string) =>
    useAccountingStore.getState().getCustomerProductInventory(customerId, productId),
  getSummary: (customerId: string) =>
    useAccountingStore.getState().getCustomerInventorySummary(customerId),
  dispatch: (params: {
    customerId: string;
    productId: string;
    unitId: string;
    quantity: number;
    referenceId: string;
    notes: string;
    movementDate?: string;
  }) => useAccountingStore.getState().dispatchInventoryToCustomer(params),
  returnStock: (params: {
    customerId: string;
    productId: string;
    unitId: string;
    quantity: number;
    referenceId: string;
    notes: string;
    movementDate?: string;
  }) => useAccountingStore.getState().createCustomerReturn(params)
};

export const BillingService = {
  getBillableMovements: (customerId: string) =>
    useAccountingStore.getState().getBillableMovementsForCustomer(customerId)
};

export const InvoiceService = {
  getAll: () => Object.values(useAccountingStore.getState().invoices),
  getById: (id: string) => useAccountingStore.getState().invoices[id] || null,
  getItems: (invoiceId: string) =>
    Object.values(useAccountingStore.getState().invoiceItems).filter((i) => i.invoice_id === invoiceId),
  getAllocations: (invoiceId: string) =>
    Object.values(useAccountingStore.getState().invoiceAllocations).filter((a) => a.invoice_id === invoiceId),
  getPayments: (invoiceId: string) =>
    Object.values(useAccountingStore.getState().invoicePayments).filter((p) => p.invoice_id === invoiceId),
  getOutstanding: (invoiceId: string) => useAccountingStore.getState().getInvoiceOutstanding(invoiceId),
  create: (params: {
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
  }) => useAccountingStore.getState().createInvoice(params),
  finalize: (id: string) => useAccountingStore.getState().finalizeInvoice(id),
  cancel: (id: string, reason: string) => useAccountingStore.getState().cancelInvoice(id, reason)
};

export const PaymentService = {
  getAll: () => Object.values(useAccountingStore.getState().invoicePayments),
  create: (params: {
    invoiceId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    referenceNumber: string;
    notes: string;
    paymentDate?: string;
  }) => useAccountingStore.getState().createInvoicePayment(params),
  cancel: (paymentId: string, reason: string) =>
    useAccountingStore.getState().cancelInvoicePayment(paymentId, reason)
};

export const LedgerService = {
  getStatement: (customerId: string) => useAccountingStore.getState().getCustomerLedger(customerId)
};

export const ReportService = {
  getSalesSummary: () => {
    const invoices = Object.values(useAccountingStore.getState().invoices);
    const finalizedInvoices = invoices.filter((i) => i.status === 'FINALIZED');
    const totalSales = finalizedInvoices.reduce((sum, i) => roundCurrency(sum + i.grand_total), 0);
    const totalTaxable = finalizedInvoices.reduce((sum, i) => roundCurrency(sum + i.taxable_amount), 0);
    const totalCGST = finalizedInvoices.reduce((sum, i) => roundCurrency(sum + i.cgst), 0);
    const totalSGST = finalizedInvoices.reduce((sum, i) => roundCurrency(sum + i.sgst), 0);
    const totalIGST = finalizedInvoices.reduce((sum, i) => roundCurrency(sum + i.igst), 0);

    const payments = Object.values(useAccountingStore.getState().invoicePayments).filter(
      (p) => p.status === 'ACTIVE'
    );
    const totalCollections = payments.reduce((sum, p) => roundCurrency(sum + p.amount), 0);
    const totalOutstanding = Math.max(0, roundCurrency(totalSales - totalCollections));

    return {
      totalSales,
      totalTaxable,
      totalCGST,
      totalSGST,
      totalIGST,
      totalTax: roundCurrency(totalCGST + totalSGST + totalIGST),
      totalCollections,
      totalOutstanding,
      invoiceCount: finalizedInvoices.length,
      paymentCount: payments.length
    };
  }
};
