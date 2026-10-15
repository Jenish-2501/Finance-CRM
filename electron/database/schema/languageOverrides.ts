import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Admin-customized UI wording. One row per (locale, dictionary key); the id
// is `${locale}:${key}`. An empty value means "fall back to the bundled
// dictionary file" (this is how a row is reset, since rows are never deleted).
// Renderer merges these OVER the bundled gu.ts at boot.
export const languageOverrides = sqliteTable('language_overrides', {
  id: text('id').primaryKey(),
  locale: text('locale').notNull(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type LanguageOverrideRow = typeof languageOverrides.$inferSelect;
