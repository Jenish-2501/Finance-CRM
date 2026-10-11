import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(),
  customerName: text('customer_name').notNull(),
  customerNumber: text('customer_number').notNull(), // searchable short code, unique
  pan: text('pan').notNull(),
  gstNumber: text('gst_number').notNull(),
  mobile: text('mobile').notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  state: text('state').notNull(),
  country: text('country').notNull(),
  postalCode: text('postal_code').notNull(),
  bankDetails: text('bank_details'), // JSON string | null
  creditLimit: real('credit_limit'), // nullable
  isActive: integer('is_active', { mode: 'boolean' }).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type CustomerRow = typeof customers.$inferSelect;
