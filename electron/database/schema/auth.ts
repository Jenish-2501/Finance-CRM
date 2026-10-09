import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Single-row app lock credentials (id = 'local').
// The passcode itself is NEVER stored — only a salted scrypt hash.
// Deliberately NOT exposed through the generic store:upsert/delete routes;
// only authService may read/write this table (see repositories/mappers.ts).
export const authSettings = sqliteTable('auth_settings', {
  id: text('id').primaryKey(),
  passwordHash: text('password_hash').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type AuthSettingsRow = typeof authSettings.$inferSelect;
