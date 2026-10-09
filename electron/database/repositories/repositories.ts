import { upsertRow, fetchAllRows } from './mappers.js';

// Explicit domain repositories. IPC handlers and services use these —
// never raw SQL, never direct Drizzle imports outside this layer.

function makeRepo(table: string) {
  return {
    findAll: (): Record<string, unknown>[] => fetchAllRows(table),
    upsert: (entity: Record<string, unknown>): void => upsertRow(table, entity),
  };
}

export const CustomerRepository = makeRepo('customers');
export const BusinessSettingsRepository = makeRepo('business_settings');
export const UomRepository = makeRepo('uoms');
export const ProductRepository = makeRepo('products');
export const ProductUnitRepository = makeRepo('product_units');
export const ProductPriceRepository = makeRepo('product_prices');
export const CustomerPriceRepository = makeRepo('customer_product_prices');
export const CustomerPriceHistoryRepository = makeRepo('customer_price_history');
export const StockReceiptRepository = makeRepo('stock_receipts');
export const StockReceiptItemRepository = makeRepo('stock_receipt_items');
export const InventoryMovementRepository = makeRepo('inventory_movements');
export const CustomerInventoryMovementRepository = makeRepo('customer_inventory_movements');
export const InvoiceRepository = makeRepo('invoices');
export const InvoiceItemRepository = makeRepo('invoice_items');
export const InvoiceAllocationRepository = makeRepo('invoice_allocations');
export const InvoicePaymentRepository = makeRepo('invoice_payments');
export const AuditLogRepository = makeRepo('audit_logs');

export const Repositories = {
  businessSettings: BusinessSettingsRepository,
  uoms: UomRepository,
  customers: CustomerRepository,
  products: ProductRepository,
  productUnits: ProductUnitRepository,
  productPrices: ProductPriceRepository,
  customerPrices: CustomerPriceRepository,
  customerPriceHistory: CustomerPriceHistoryRepository,
  stockReceipts: StockReceiptRepository,
  stockReceiptItems: StockReceiptItemRepository,
  inventoryMovements: InventoryMovementRepository,
  customerInventoryMovements: CustomerInventoryMovementRepository,
  invoices: InvoiceRepository,
  invoiceItems: InvoiceItemRepository,
  invoiceAllocations: InvoiceAllocationRepository,
  invoicePayments: InvoicePaymentRepository,
  auditLogs: AuditLogRepository,
};

export type RepositoryKey = keyof typeof Repositories;
