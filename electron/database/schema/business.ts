import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const businessSettings = sqliteTable('business_settings', {
  id: text('id').primaryKey(),
  businessName: text('business_name').notNull(),
  legalName: text('legal_name').notNull(),
  gstNumber: text('gst_number').notNull(),
  pan: text('pan').notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  state: text('state').notNull(),
  country: text('country').notNull(),
  postalCode: text('postal_code').notNull(),
  phone: text('phone').notNull(),
  email: text('email').notNull(),
  website: text('website').notNull(),
  bankName: text('bank_name').notNull(),
  bankAccountNumber: text('bank_account_number').notNull(),
  ifsc: text('ifsc').notNull(),
  branch: text('branch').notNull(),
  invoicePrefix: text('invoice_prefix').notNull(),
  invoiceNextNumber: integer('invoice_next_number').notNull(),
  currency: text('currency').notNull(),
  defaultGstRate: real('default_gst_rate').notNull(),
  stateCode: text('state_code').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const uoms = sqliteTable('uoms', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type BusinessSettingsRow = typeof businessSettings.$inferSelect;
export type UomRow = typeof uoms.$inferSelect;
