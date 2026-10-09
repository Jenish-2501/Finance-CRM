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
  notes: text('notes').notNull(),
  vehicleNumber: text('vehicle_number'),
  transporterName: text('transporter_name'),
  ewayBillNumber: text('eway_bill_number'),
  dispatchPurpose: text('dispatch_purpose'),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull(),
});

export type StockReceiptRow = typeof stockReceipts.$inferSelect;
export type InventoryMovementRow = typeof inventoryMovements.$inferSelect;
export type CustomerInventoryMovementRow = typeof customerInventoryMovements.$inferSelect;
