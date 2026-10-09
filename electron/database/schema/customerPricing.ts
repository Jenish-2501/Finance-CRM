import { sqliteTable, text, real } from 'drizzle-orm/sqlite-core';

// Per-customer selling-price overrides. The base price (product_prices) stays
// identical for every customer; when an active row exists here for
// (customer, product, unit) it wins at billing/challan time. No effective
// dating: the owner applies a rate and it takes effect immediately; every
// change is appended to customer_price_history (separate table).
export const customerProductPrices = sqliteTable('customer_product_prices', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull(),
  productId: text('product_id').notNull(),
  unitId: text('unit_id').notNull(),
  price: real('price').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const customerPriceHistory = sqliteTable('customer_price_history', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull(),
  productId: text('product_id').notNull(),
  unitId: text('unit_id').notNull(),
  oldPrice: real('old_price'), // null = first price ever set
  newPrice: real('new_price'), // null = override removed
  changedAt: text('changed_at').notNull(),
  changedBy: text('changed_by').notNull(),
});

export type CustomerProductPriceRow = typeof customerProductPrices.$inferSelect;
export type CustomerPriceHistoryRow = typeof customerPriceHistory.$inferSelect;
