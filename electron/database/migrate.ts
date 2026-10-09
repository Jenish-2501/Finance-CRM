import type Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import * as m0001 from './migrations/0001_initial.js';
import * as m0002 from './migrations/0002_auth.js';
import * as m0003 from './migrations/0003_business_config.js';
import * as m0004 from './migrations/0004_single_owner.js';
import * as m0005 from './migrations/0005_customer_number.js';
import * as m0006 from './migrations/0006_customer_pricing.js';

interface Migration {
  version: number;
  name: string;
  sql: string;
}

// Ordered. Append new migrations here; never reorder or edit applied ones.
const MIGRATIONS: Migration[] = [
  { version: m0001.version, name: m0001.name, sql: m0001.sql },
  { version: m0002.version, name: m0002.name, sql: m0002.sql },
  { version: m0003.version, name: m0003.name, sql: m0003.sql },
  { version: m0004.version, name: m0004.name, sql: m0004.sql },
  { version: m0005.version, name: m0005.name, sql: m0005.sql },
  { version: m0006.version, name: m0006.name, sql: m0006.sql },
];

const MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS _migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);`;

function tableExists(db: Database.Database, table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(table) as { name?: string } | undefined;
  return Boolean(row?.name);
}

// Every table created by the v1 baseline. Adoption requires ALL of them;
// a partial schema (crash mid-first-run) must run the DDL normally —
// CREATE TABLE IF NOT EXISTS backfills gaps without touching live data.
// NOTE: 'users' stays listed even though v4 drops it — pre-RBAC installs
// still carry it, and adoption detection must recognize them.
const V1_TABLES = [
  'users',
  'business_settings',
  'uoms',
  'customers',
  'products',
  'product_units',
  'product_prices',
  'stock_receipts',
  'stock_receipt_items',
  'inventory_movements',
  'customer_inventory_movements',
  'invoices',
  'invoice_items',
  'invoice_allocations',
  'invoice_payments',
  'audit_logs',
];

export function getAppliedVersions(db: Database.Database): number[] {
  db.exec(MIGRATIONS_TABLE_SQL);
  const rows = db.prepare('SELECT version FROM _migrations ORDER BY version').all() as Array<{
    version: number;
  }>;
  return rows.map((r) => r.version);
}

/**
 * Applies pending migrations in order, inside per-migration transactions.
 * Update-safe: existing DBs created by the pre-Drizzle code (tables exist,
 * no _migrations rows) adopt the baseline without re-running DDL.
 */
export function runMigrations(db: Database.Database): { applied: number[] } {
  db.exec(MIGRATIONS_TABLE_SQL);
  const applied = new Set<number>(getAppliedVersions(db));
  const newlyApplied: number[] = [];

  if (applied.size === 0 && V1_TABLES.every((t) => tableExists(db, t))) {
    // Pre-existing installation: baseline schema already present.
    // Adopt v1, then fall through so later migrations (v2+) still apply.
    db.prepare('INSERT OR IGNORE INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
      MIGRATIONS[0].version,
      MIGRATIONS[0].name,
      new Date().toISOString()
    );
    applied.add(MIGRATIONS[0].version);
    logger.info('database.migration_baseline_adopted', { version: MIGRATIONS[0].version });
  }

  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    const tx = db.transaction(() => {
      db.exec(m.sql);
      db.prepare('INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        m.version,
        m.name,
        new Date().toISOString()
      );
    });
    tx();
    newlyApplied.push(m.version);
    logger.info('database.migration_applied', { version: m.version, name: m.name });
  }

  return { applied: newlyApplied };
}

export function getMigrationStatus(db: Database.Database): {
  applied: number[];
  pending: number[];
} {
  const applied = getAppliedVersions(db);
  const appliedSet = new Set(applied);
  const pending = MIGRATIONS.filter((m) => !appliedSet.has(m.version)).map((m) => m.version);
  return { applied, pending };
}
