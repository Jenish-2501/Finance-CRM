import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  productName: text('product_name').notNull(),
  gujaratiName: text('gujarati_name'), // optional Gujarati display name (v18), null = none
  sku: text('sku').notNull(),
  description: text('description').notNull(),
  image: text('image'),
  primaryUnitId: text('primary_unit_id').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const productUnits = sqliteTable('product_units', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull(),
  unitId: text('unit_id').notNull(),
  conversionToPrimary: real('conversion_to_primary').notNull(),
  isStockUnit: integer('is_stock_unit', { mode: 'boolean' }).notNull(),
  isBillingUnit: integer('is_billing_unit', { mode: 'boolean' }).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const productPrices = sqliteTable('product_prices', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull(),
  unitId: text('unit_id').notNull(),
  price: real('price').notNull(),
  effectiveFrom: text('effective_from').notNull(),
  effectiveTo: text('effective_to'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type ProductRow = typeof products.$inferSelect;
export type ProductUnitRow = typeof productUnits.$inferSelect;
export type ProductPriceRow = typeof productPrices.$inferSelect;
