import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  userName: text('user_name').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  oldData: text('old_data'), // JSON | null
  newData: text('new_data'), // JSON | null
  metadata: text('metadata'), // JSON | null
  createdAt: text('created_at').notNull(),
});

export type AuditLogRow = typeof auditLogs.$inferSelect;
