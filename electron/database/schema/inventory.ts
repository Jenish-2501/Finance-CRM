import { sqliteTable, text, real } from 'drizzle-orm/sqlite-core';

export const stockReceipts = sqliteTable('stock_receipts', {
  id: text('id').primaryKey(),
  receiptNumber: text('receipt_number').notNull(),
  receiptDate: text('receipt_date').notNull(),
  supplierName: text('supplier_name').notNull(),
  referenceNumber: text('reference_number').notNull(),
  notes: text('notes').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const stockReceiptItems = sqliteTable('stock_receipt_items', {
  id: text('id').primaryKey(),
  stockReceiptId: text('stock_receipt_id').notNull(),
  productId: text('product_id').notNull(),
  unitId: text('unit_id').notNull(),
  quantity: real('quantity').notNull(),
  unitCost: real('unit_cost').notNull(),
  totalCost: real('total_cost').notNull(),
  createdAt: text('created_at').notNull(),
});

export const inventoryMovements = sqliteTable('inventory_movements', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull(),
  unitId: text('unit_id').notNull(),
  quantity: real('quantity').notNull(),
  movementType: text('movement_type').notNull(),
  movementDate: text('movement_date').notNull(),
  referenceType: text('reference_type').notNull(),
  referenceId: text('reference_id').notNull(),
  notes: text('notes').notNull(),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull(),
});

export const customerInventoryMovements = sqliteTable('customer_inventory_movements', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull(),
  productId: text('product_id').notNull(),
  unitId: text('unit_id').notNull(),
  quantity: real('quantity').notNull(),
  movementType: text('movement_type').notNull(),
  movementDate: text('movement_date').notNull(),
  referenceType: text('reference_type').notNull(),
  referenceId: text('reference_id').notNull(),
  documentId: text('document_id'), // FK → dispatch_documents.id (backfilled by v9)
  // v20: RETURN rows carry the taken-back unit rate (rate × quantity = the
  // customer's return credit) and how much of that credit invoices already
  // consumed (manual apply, oldest returns first). Dispatch rows leave both.
  rate: real('rate'),
  creditAppliedAmount: real('credit_applied_amount').notNull().default(0),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull(),
});

export type StockReceiptRow = typeof stockReceipts.$inferSelect;
export type InventoryMovementRow = typeof inventoryMovements.$inferSelect;
export type CustomerInventoryMovementRow = typeof customerInventoryMovements.$inferSelect;

// One row per dispatch challan / return slip. The document number lives ONCE
// here (UNIQUE per customer + type) instead of free text on every movement row.
export const dispatchDocuments = sqliteTable('dispatch_documents', {
  id: text('id').primaryKey(),
  documentNumber: text('document_number').notNull(),
  customerId: text('customer_id').notNull(),
  documentType: text('document_type').notNull(), // DISPATCH | RETURN
  documentDate: text('document_date').notNull(),
  createdAt: text('created_at').notNull(),
});

export type DispatchDocumentRow = typeof dispatchDocuments.$inferSelect;
