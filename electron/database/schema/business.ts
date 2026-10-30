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
  invoiceStartNumber: integer('invoice_start_number').notNull(), // first number of each FY series
  customerNextNumber: integer('customer_next_number').notNull(), // floor for auto customer numbers
  documentNextNumber: integer('document_next_number').notNull(), // floor for auto dispatch-document numbers
  currency: text('currency').notNull(),
  defaultGstRate: real('default_gst_rate').notNull(),
  stateCode: text('state_code').notNull(),
  logoData: text('logo_data'), // optional PNG/JPEG data URL for PDF watermark (v17), null = none
  gujaratiName: text('gujarati_name'), // optional Gujarati business name — challan PDF header title (v19), null = use English name
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
