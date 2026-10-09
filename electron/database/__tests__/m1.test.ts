// M1 Platform Foundation self-tests: SQLite + IPC + localStorage->SQLite.
// Run: npx tsx electron/database/__tests__/m1.test.ts  (or npm run test:m1)
// Covers: DDL<->Drizzle parity, migration coverage, IPC parity, auth
// isolation, fresh-install seeding, legacy migration completeness,
// backup helpers, VACUUM INTO mechanics.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getTableColumns } from 'drizzle-orm';
import { initDatabase, closeDatabase, getSqlite } from '../index.js';
import { tableMap } from '../repositories/mappers.js';
import { Repositories } from '../repositories/repositories.js';
import { loadFullState } from '../../services/transactionService.js';
import {
  migrateLocalStorageToSqlite,
  hasMigratedLocalStorage,
} from '../../services/migrationService.js';
import { nextBackupPath, pruneBackups, MAX_BACKUPS } from '../../utils/backupPaths.js';
import { assertEntityType } from '../../utils/validate.js';

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const camelToSnake = (s: string): string => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

// M1-1. DDL <-> Drizzle parity: every migrated column exists in Drizzle.
{
  const dir = tempDir('acculedger-m1-parity-');
  initDatabase(dir);
  const db = getSqlite();
  for (const [table, drizzleTable] of Object.entries(tableMap)) {
    const pragmaRows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    const ddlCols = new Set(pragmaRows.map((r) => r.name));
    const drizzleCols = new Set(
      Object.keys(getTableColumns(drizzleTable as never)).map(camelToSnake)
    );
    assert.deepEqual(
      [...ddlCols].sort(),
      [...drizzleCols].sort(),
      `column mismatch on ${table}`
    );
  }
  closeDatabase();
  console.log('M1-1 DDL<->Drizzle parity: OK');
}

// M1-2. Migration coverage: all 15 domain tables + auth_settings exist.
{
  const dir = tempDir('acculedger-m1-coverage-');
  initDatabase(dir);
  const db = getSqlite();
  const names = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(
      (r) => r.name
    )
  );
  for (const table of [...Object.keys(tableMap), 'auth_settings', '_migrations']) {
    assert.ok(names.has(table), `missing table ${table}`);
  }
  closeDatabase();
  console.log('M1-2 migration table coverage: OK');
}

// M1-3. IPC parity: every preload invoke() channel has a main handler and vice versa.
{
  const preloadSrc = fs.readFileSync('electron/preload.ts', 'utf8');
  const handlersSrc = fs.readFileSync('electron/ipc/handlers.ts', 'utf8');
  const invoked = new Set(
    [...preloadSrc.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map((m) => m[1])
  );
  const handled = new Set([
    ...[...handlersSrc.matchAll(/safeHandler\('([^']+)'/g)].map((m) => m[1]),
    // Domain upserts are registered via the domainUpserts table, not direct calls.
    ...[...handlersSrc.matchAll(/\['([a-z_]+:[a-zA-Z]+)',/g)].map((m) => m[1]),
  ]);
  assert.ok(invoked.size > 0 && handled.size > 0, 'channel extraction failed');
  for (const ch of invoked) assert.ok(handled.has(ch), `preload calls '${ch}' with no main handler`);
  for (const ch of handled) assert.ok(invoked.has(ch), `main handles '${ch}' with no preload API`);
  console.log(`M1-3 IPC parity: OK (${invoked.size} channels)`);
}

// M1-4. Auth isolation: credentials table unreachable via generic routes.
{
  assert.ok(!('auth_settings' in Repositories), 'auth_settings must not be a repository');
  assert.throws(() => assertEntityType('auth_settings'), /VALIDATION_FAILED/);
  assert.throws(() => assertEntityType('auth_settings; DROP TABLE customers;'), /VALIDATION_FAILED/);
  console.log('M1-4 auth_settings isolation: OK');
}

// M1-5. Fresh install boots functional: business settings + UOMs seeded,
// users table absent (single-owner app), idempotent.
{
  const dir = tempDir('acculedger-m1-seed-');
  initDatabase(dir);
  const state = loadFullState() as Record<string, unknown>;
  const biz = state.businessSettings as Record<string, unknown>;
  assert.equal((biz as { id: string }).id, 'biz-1', 'business settings seeded');
  assert.ok((biz as { invoice_prefix: string }).invoice_prefix, 'numbering defaults present');
  assert.ok(Object.keys(state.uoms as object).length > 0, 'UOMs seeded');
  assert.ok(!('users' in state), 'no users entity in single-owner state');
  const db = getSqlite();
  const names = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(
      (r) => r.name
    )
  );
  assert.ok(!names.has('users'), 'users table dropped');
  closeDatabase();

  initDatabase(dir); // reopen: no duplicates, no overwrite
  const state2 = loadFullState() as Record<string, unknown>;
  assert.deepEqual(state2.businessSettings, biz);
  closeDatabase();
  console.log('M1-5 fresh-install seeding: OK');
}

// M1-6. Legacy localStorage migration carries every entity (seed-shaped payload).
{
  const dir = tempDir('acculedger-m1-legacy-');
  initDatabase(dir);
  closeDatabase(); // migrate against a closed-then-reopened DB like the app does
  initDatabase(dir);
  const seed = await import('../../../src/data/seedData.js');
  const payload = {
    state: {
      businessSettings: seed.SEED_BUSINESS_SETTINGS,
      uoms: seed.SEED_UOMS,
      customers: seed.SEED_CUSTOMERS,
      products: seed.SEED_PRODUCTS,
      productUnits: seed.SEED_PRODUCT_UNITS,
      productPrices: seed.SEED_PRODUCT_PRICES,
      stockReceipts: seed.SEED_STOCK_RECEIPTS,
      stockReceiptItems: seed.SEED_STOCK_RECEIPT_ITEMS,
      inventoryMovements: seed.SEED_INVENTORY_MOVEMENTS,
      customerInventoryMovements: seed.SEED_CUSTOMER_INVENTORY_MOVEMENTS,
      invoices: seed.SEED_INVOICES,
      invoiceItems: seed.SEED_INVOICE_ITEMS,
      invoiceAllocations: seed.SEED_INVOICE_ALLOCATIONS,
      invoicePayments: seed.SEED_INVOICE_PAYMENTS,
      auditLogs: seed.SEED_AUDIT_LOGS,
    },
  };
  const markerDir = path.join(dir, 'database');
  assert.equal(hasMigratedLocalStorage({ markerDir }), false);
  assert.equal(migrateLocalStorageToSqlite(payload, { markerDir }), true);
  assert.equal(hasMigratedLocalStorage({ markerDir }), true);
  assert.equal(migrateLocalStorageToSqlite(payload, { markerDir }), false, 'second run is a no-op');

  const state = loadFullState() as Record<string, Record<string, unknown> | unknown[]>;
  const countOf = (v: unknown): number => (Array.isArray(v) ? v.length : Object.keys(v as object).length);
  assert.equal(countOf(state.customers), Object.keys(seed.SEED_CUSTOMERS).length, 'customers');
  assert.equal(countOf(state.products), Object.keys(seed.SEED_PRODUCTS).length, 'products');
  assert.equal(countOf(state.invoices), Object.keys(seed.SEED_INVOICES).length, 'invoices');
  assert.equal(countOf(state.invoiceItems), Object.keys(seed.SEED_INVOICE_ITEMS).length, 'invoiceItems');
  assert.equal(
    countOf(state.invoiceAllocations),
    Object.keys(seed.SEED_INVOICE_ALLOCATIONS).length,
    'invoiceAllocations'
  );
  assert.equal(
    countOf(state.invoicePayments),
    Object.keys(seed.SEED_INVOICE_PAYMENTS).length,
    'invoicePayments'
  );
  assert.equal(
    countOf(state.customerInventoryMovements),
    Object.keys(seed.SEED_CUSTOMER_INVENTORY_MOVEMENTS).length,
    'customerInventoryMovements'
  );
  assert.equal(
    countOf(state.inventoryMovements),
    Object.keys(seed.SEED_INVENTORY_MOVEMENTS).length,
    'inventoryMovements'
  );
  assert.equal(
    (state.businessSettings as unknown as { id: string }).id,
    seed.SEED_BUSINESS_SETTINGS.id,
    'businessSettings'
  );
  // Spot-check relational fidelity: snapshot JSON round-trips as objects.
  const firstInvId = Object.keys(seed.SEED_INVOICES)[0];
  const loadedInv = (state.invoices as Record<string, Record<string, unknown>>)[firstInvId];
  assert.ok(loadedInv && typeof loadedInv.customer_snapshot === 'object', 'invoice snapshot parsed');
  closeDatabase();
  console.log('M1-6 legacy migration completeness: OK');
}

// M1-7. Backup helpers: same-second uniqueness + retention.
{
  const dir = tempDir('acculedger-m1-backup-');
  const fixed = new Date('2026-10-08T10:00:00.000Z');
  const first = nextBackupPath(dir, fixed);
  fs.writeFileSync(first, 'x');
  const second = nextBackupPath(dir, fixed);
  assert.notEqual(second, first, 'same-second collision avoided');
  assert.ok(second.endsWith('-1.sqlite'), 'suffixed name');
  for (let i = 0; i < 10; i++) fs.writeFileSync(path.join(dir, `app-2026-01-0${i}-10-00-00.sqlite`), 'x');
  pruneBackups(dir);
  const remaining = fs.readdirSync(dir).filter((f) => f.endsWith('.sqlite'));
  assert.equal(remaining.length, MAX_BACKUPS, 'retention keeps 7');
  console.log('M1-7 backup helpers: OK');
}

// M1-8. VACUUM INTO mechanics: live DB snapshots to an independent file.
{
  const dir = tempDir('acculedger-m1-vacuum-');
  initDatabase(dir);
  const before = (getSqlite().prepare('SELECT COUNT(*) AS c FROM customers').get() as { c: number }).c;
  const target = path.join(dir, 'snap.sqlite');
  getSqlite().prepare('VACUUM INTO ?').run(target);
  assert.ok(fs.existsSync(target), 'snapshot file created');
  const Database = (await import('better-sqlite3')).default;
  const snap = new Database(target, { readonly: true });
  const after = (snap.prepare('SELECT COUNT(*) AS c FROM customers').get() as { c: number }).c;
  snap.close();
  assert.equal(after, before, 'snapshot carries data');
  closeDatabase();
  console.log('M1-8 VACUUM INTO snapshot: OK');
}

console.log('m1.test: all assertions passed');
