import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const invoices = sqliteTable('invoices', {
  id: text('id').primaryKey(),
  invoiceNumber: text('invoice_number').notNull(),
  customerId: text('customer_id').notNull(),
  invoiceDate: text('invoice_date').notNull(),
  fy: text('fy').notNull(), // financial year of invoice_date, e.g. '2025-26'
  billingPeriodStart: text('billing_period_start').notNull(),
  billingPeriodEnd: text('billing_period_end').notNull(),
  status: text('status').notNull(),
  subtotal: real('subtotal').notNull(),
  discount: real('discount').notNull(),
  taxableAmount: real('taxable_amount').notNull(),
  cgst: real('cgst').notNull(),
  sgst: real('sgst').notNull(),
  igst: real('igst').notNull(),
  otherCharges: real('other_charges').notNull(),
  grandTotal: real('grand_total').notNull(),
  customerSnapshot: text('customer_snapshot').notNull(), // JSON
  businessSnapshot: text('business_snapshot').notNull(), // JSON
  bankSnapshot: text('bank_snapshot').notNull(), // JSON
  notes: text('notes').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const invoiceItems = sqliteTable('invoice_items', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id').notNull(),
  productId: text('product_id').notNull(),
  productNameSnapshot: text('product_name_snapshot').notNull(),
  skuSnapshot: text('sku_snapshot').notNull(),
  unitId: text('unit_id').notNull(),
  uomSnapshot: text('uom_snapshot').notNull(),
  quantity: real('quantity').notNull(),
  unitPrice: real('unit_price').notNull(),
  discount: real('discount').notNull(),
  taxableAmount: real('taxable_amount').notNull(),
  gstRate: real('gst_rate').notNull(),
  cgst: real('cgst').notNull(),
  sgst: real('sgst').notNull(),
  igst: real('igst').notNull(),
  extraCharges: real('extra_charges').notNull(),
  lineTotal: real('line_total').notNull(),
  createdAt: text('created_at').notNull(),
});

export const invoiceAllocations = sqliteTable('invoice_allocations', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id').notNull(),
  customerInventoryMovementId: text('customer_inventory_movement_id').notNull(),
  allocatedQuantity: real('allocated_quantity').notNull(),
  createdAt: text('created_at').notNull(),
});

export const invoicePayments = sqliteTable('invoice_payments', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id').notNull(),
  paymentDate: text('payment_date').notNull(),
  amount: real('amount').notNull(),
  paymentMethod: text('payment_method').notNull(),
  referenceNumber: text('reference_number').notNull(),
  notes: text('notes').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type InvoiceRow = typeof invoices.$inferSelect;
export type InvoicePaymentRow = typeof invoicePayments.$inferSelect;

// Per-financial-year invoice numbering series. Plain numbers restart at
// start_number every FY (no prefix, no padding); fy is UNIQUE.
export const invoiceSeries = sqliteTable('invoice_series', {
  id: text('id').primaryKey(),
  fy: text('fy').notNull(),
  nextNumber: integer('next_number').notNull(),
  startNumber: integer('start_number').notNull(),
  createdAt: text('created_at').notNull(),
});

export type InvoiceSeriesRow = typeof invoiceSeries.$inferSelect;
