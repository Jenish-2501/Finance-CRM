import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import * as m0001 from './migrations/0001_initial.js';
import * as m0002 from './migrations/0002_auth.js';
import * as m0003 from './migrations/0003_business_config.js';
import * as m0004 from './migrations/0004_single_owner.js';
import * as m0005 from './migrations/0005_customer_number.js';
import * as m0006 from './migrations/0006_customer_pricing.js';
import * as m0007 from './migrations/0007_fy_numbering.js';
import * as m0008 from './migrations/0008_customer_counter_and_invoice_identity.js';
import * as m0009 from './migrations/0009_dispatch_documents.js';
import * as m0010 from './migrations/0010_remove_hsn.js';
import * as m0011 from './migrations/0011_remove_customer_email_state_code.js';
import * as m0012 from './migrations/0012_remove_secondary_packaging.js';
import * as m0013 from './migrations/0013_retire_nonstandard_units.js';
import * as m0014 from './migrations/0014_language_overrides.js';
import * as m0015 from './migrations/0015_remove_dispatch_logistics.js';
import * as m0016 from './migrations/0016_customer_gujarati_name.js';
import * as m0017 from './migrations/0017_business_logo.js';
import * as m0018 from './migrations/0018_product_gujarati_name.js';

interface Migration {
  version: number;
  name: string;
  sql: string;
  // Optional schema-adaptive step. Most migrations are plain SQL, but DDL that
  // must converge databases coming from DIFFERENT released chains (e.g. a
  // version renumber that re-runs an already-applied DROP COLUMN) cannot be
  // expressed as static SQL — SQLite has no DROP COLUMN IF EXISTS. When
  // present, the runner calls migrate(db) INSTEAD of exec(sql), inside the
  // same per-migration transaction.
  migrate?: (db: Database.Database) => void;
}

// Ordered. Append new migrations here; never reorder or edit applied ones.
const MIGRATIONS: Migration[] = [
  { version: m0001.version, name: m0001.name, sql: m0001.sql },
  { version: m0002.version, name: m0002.name, sql: m0002.sql },
  { version: m0003.version, name: m0003.name, sql: m0003.sql },
  { version: m0004.version, name: m0004.name, sql: m0004.sql },
  { version: m0005.version, name: m0005.name, sql: m0005.sql },
  { version: m0006.version, name: m0006.name, sql: m0006.sql },
  { version: m0007.version, name: m0007.name, sql: m0007.sql },
  { version: m0008.version, name: m0008.name, sql: m0008.sql },
  { version: m0009.version, name: m0009.name, sql: m0009.sql },
  { version: m0010.version, name: m0010.name, sql: m0010.sql },
  { version: m0011.version, name: m0011.name, sql: m0011.sql },
  { version: m0012.version, name: m0012.name, sql: m0012.sql },
  { version: m0013.version, name: m0013.name, sql: m0013.sql },
  { version: m0014.version, name: m0014.name, sql: m0014.sql },
  { version: m0015.version, name: m0015.name, sql: m0015.sql, migrate: m0015.migrate },
  { version: m0016.version, name: m0016.name, sql: m0016.sql },
  { version: m0017.version, name: m0017.name, sql: m0017.sql },
  { version: m0018.version, name: m0018.name, sql: m0018.sql },
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

export interface RunMigrationsOptions {
  /**
   * Directory for the automatic pre-migration safety snapshot. When set and
   * the database has pending migrations, a `VACUUM INTO` snapshot
   * (`pre-migrate-<stamp>.sqlite`) is taken BEFORE any write, so a failed
   * or half-applied update can always be restored. Omitted in tests that
   * don't need snapshot coverage.
   */
  backupsDir?: string;
}

export interface RunMigrationsResult {
  applied: number[];
  /** Absolute path of the pre-migration snapshot, or null when none taken. */
  preMigrateBackup: string | null;
}

// Safety snapshots are separate from manual `app-*` backups (different
// prefix, so pruneBackups never evicts them) and retention-capped.
export const MAX_PRE_MIGRATE_BACKUPS = 5;

/**
 * Transaction-aware snapshot of the live DB, taken before migrations run.
 * Returns the snapshot path, or null when there is nothing to protect
 * (brand-new database) or the snapshot itself fails (logged loudly — the
 * caller still proceeds, because every migration is atomic and a snapshot
 * failure must never brick startup).
 */
export function snapshotBeforeMigrate(
  db: Database.Database,
  backupsDir: string
): string | null {
  try {
    fs.mkdirSync(backupsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    let file = path.join(backupsDir, `pre-migrate-${stamp}.sqlite`);
    let n = 1;
    while (fs.existsSync(file)) {
      file = path.join(backupsDir, `pre-migrate-${stamp}-${n}.sqlite`);
      n += 1;
    }
    // Atomic and safe against concurrent readers; must run outside any
    // transaction (callers snapshot before the per-migration tx loop).
    db.prepare('VACUUM INTO ?').run(file);
    prunePreMigrateBackups(backupsDir);
    return file;
  } catch (err) {
    logger.error('database.pre_migrate_backup_failed', {});
    return null;
  }
}

/** Keeps the newest MAX_PRE_MIGRATE_BACKUPS safety snapshots. */
export function prunePreMigrateBackups(backupsDir: string): void {
  let files: string[];
  try {
    files = fs
      .readdirSync(backupsDir)
      .filter((f) => f.startsWith('pre-migrate-') && f.endsWith('.sqlite'))
      .map((f) => path.join(backupsDir, f))
      .sort();
  } catch {
    return;
  }
  while (files.length > MAX_PRE_MIGRATE_BACKUPS) {
    const oldest = files.shift();
    if (!oldest) break;
    try {
      fs.unlinkSync(oldest);
    } catch {
      break;
    }
  }
}

/**
 * Applies pending migrations in order, inside per-migration transactions.
 * Update-safe: existing DBs created by the pre-Drizzle code (tables exist,
 * no _migrations rows) adopt the baseline without re-running DDL.
 */
export function runMigrations(
  db: Database.Database,
  opts: RunMigrationsOptions = {}
): RunMigrationsResult {
  db.exec(MIGRATIONS_TABLE_SQL);
  const applied = new Set<number>(getAppliedVersions(db));
  const newlyApplied: number[] = [];

  const isFreshInstall =
    applied.size === 0 && !V1_TABLES.every((t) => tableExists(db, t));
  const hasPending = MIGRATIONS.some((m) => !applied.has(m.version));
  let preMigrateBackup: string | null = null;
  if (!isFreshInstall && hasPending && opts.backupsDir) {
    preMigrateBackup = snapshotBeforeMigrate(db, opts.backupsDir);
    logger.info('database.pre_migrate_backup', {
      file: preMigrateBackup,
      pending: MIGRATIONS.filter((m) => !applied.has(m.version)).map((m) => m.version),
    });
  }

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
      if (m.migrate) {
        m.migrate(db);
      } else {
        db.exec(m.sql);
      }
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

  return { applied: newlyApplied, preMigrateBackup };
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
