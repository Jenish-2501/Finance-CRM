import { openDatabase, getSqlite, getDrizzle, getDatabaseFilePath, closeDatabase } from './client.js';
import { runMigrations, getMigrationStatus } from './migrate.js';
import { ensureSystemDefaults } from '../services/systemSeed.js';
import { ensureDefaultCredentials } from '../services/authService.js';
import { logger } from '../utils/logger.js';

export { getDrizzle, getSqlite, getDatabaseFilePath, closeDatabase };

export interface DatabaseStatus {
  connected: boolean;
  migrationStatus: 'OK' | 'PENDING';
  sqliteVersion: string;
  appliedMigrations: number[];
  pendingMigrations: number[];
}

/**
 * Full startup lifecycle. Must be called in the Electron main process
 * before IPC handlers are registered or windows are created.
 * Throws on failure — the caller must show a user-safe error and quit.
 */
export function initDatabase(userDataPath: string): void {
  openDatabase(userDataPath);
  const sqlite = getSqlite();
  runMigrations(sqlite);

  const status = getMigrationStatus(sqlite);
  if (status.pending.length > 0) {
    throw new Error(`Pending migrations after init: ${status.pending.join(', ')}`);
  }
  // Seed the app-lock credential row on first launch (idempotent).
  ensureDefaultCredentials();
  // Seed system-required rows (business settings + admin) on first launch.
  ensureSystemDefaults();
  logger.info('database.ready', { applied: status.applied });
}

/** Lightweight health check. Never exposes SQL to the renderer. */
export function checkDatabaseHealth(): DatabaseStatus {
  const sqlite = getSqlite();
  const row = sqlite.prepare('SELECT 1 AS ok').get() as { ok: number };
  const versionRow = sqlite.prepare('SELECT sqlite_version() AS v').get() as { v: string };
  const { applied, pending } = getMigrationStatus(sqlite);
  return {
    connected: row?.ok === 1,
    migrationStatus: pending.length === 0 ? 'OK' : 'PENDING',
    sqliteVersion: versionRow?.v ?? 'unknown',
    appliedMigrations: applied,
    pendingMigrations: pending,
  };
}

/**
 * Internal maintenance/diagnostic only. Expensive on large DBs —
 * do NOT run on every startup.
 */
export function checkDatabaseIntegrity(): { ok: boolean; detail: string } {
  const sqlite = getSqlite();
  const rows = sqlite.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
  const detail = rows.map((r) => r.integrity_check).join('; ');
  return { ok: detail.toLowerCase() === 'ok', detail: detail.slice(0, 500) };
}
