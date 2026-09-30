import { upsertRow, fetchAllRows } from './baseRepository.js';

// Since the user requested explicit repositories for important entities, we define them here.
// To avoid 16 files of boilerplate, we group them into an explicit repository pattern file.
// The domain is fully transparent.

export const UserRepository = {
  findAll: () => fetchAllRows('users'),
  upsert: (user: any) => upsertRow('users', user),
};

export const CustomerRepository = {
  findAll: () => fetchAllRows('customers'),
  upsert: (customer: any) => upsertRow('customers', customer),
};

export const BusinessSettingsRepository = {
  findAll: () => fetchAllRows('business_settings'),
  upsert: (settings: any) => upsertRow('business_settings', settings),
};

export const UomRepository = {
  findAll: () => fetchAllRows('uoms'),
  upsert: (uom: any) => upsertRow('uoms', uom),
};

export const ProductRepository = {
  findAll: () => fetchAllRows('products'),
  upsert: (product: any) => upsertRow('products', product),
};

export const ProductUnitRepository = {
  findAll: () => fetchAllRows('product_units'),
  upsert: (unit: any) => upsertRow('product_units', unit),
};

export const ProductPriceRepository = {
  findAll: () => fetchAllRows('product_prices'),
  upsert: (price: any) => upsertRow('product_prices', price),
};

export const StockReceiptRepository = {
  findAll: () => fetchAllRows('stock_receipts'),
  upsert: (receipt: any) => upsertRow('stock_receipts', receipt),
};

export const StockReceiptItemRepository = {
  findAll: () => fetchAllRows('stock_receipt_items'),
  upsert: (item: any) => upsertRow('stock_receipt_items', item),
};

export const InventoryMovementRepository = {
  findAll: () => fetchAllRows('inventory_movements'),
  upsert: (movement: any) => upsertRow('inventory_movements', movement),
};

export const CustomerInventoryMovementRepository = {
  findAll: () => fetchAllRows('customer_inventory_movements'),
  upsert: (movement: any) => upsertRow('customer_inventory_movements', movement),
};

export const InvoiceRepository = {
  findAll: () => fetchAllRows('invoices'),
  upsert: (invoice: any) => upsertRow('invoices', invoice),
};

export const InvoiceItemRepository = {
  findAll: () => fetchAllRows('invoice_items'),
  upsert: (item: any) => upsertRow('invoice_items', item),
};

export const InvoiceAllocationRepository = {
  findAll: () => fetchAllRows('invoice_allocations'),
  upsert: (allocation: any) => upsertRow('invoice_allocations', allocation),
};

export const InvoicePaymentRepository = {
  findAll: () => fetchAllRows('invoice_payments'),
  upsert: (payment: any) => upsertRow('invoice_payments', payment),
};

export const AuditLogRepository = {
  findAll: () => fetchAllRows('audit_logs'),
  upsert: (log: any) => upsertRow('audit_logs', log),
};

export const Repositories = {
  users: UserRepository,
  businessSettings: BusinessSettingsRepository,
  uoms: UomRepository,
  customers: CustomerRepository,
  products: ProductRepository,
  productUnits: ProductUnitRepository,
  productPrices: ProductPriceRepository,
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
