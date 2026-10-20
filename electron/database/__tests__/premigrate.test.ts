// Pre-migration safety snapshots: every app update that carries pending
// migrations must snapshot the live DB (VACUUM INTO) BEFORE writing anything.
// Run: npx tsx electron/database/__tests__/premigrate.test.ts
// Covers: snapshot-before-write on upgrade, no snapshot on fresh install,
// snapshot failure never blocks migration, snapshot retention cap.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { initDatabase, closeDatabase, getSqlite } from '../index.js';
import {
  runMigrations,
  prunePreMigrateBackups,
  MAX_PRE_MIGRATE_BACKUPS,
} from '../migrate.js';

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function backupsOf(dir: string): string[] {
  const bdir = path.join(dir, 'backups');
  if (!fs.existsSync(bdir)) return [];
  return fs
    .readdirSync(bdir)
    .filter((f) => f.startsWith('pre-migrate-') && f.endsWith('.sqlite'))
    .sort();
}

function columns(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (r) => r.name
  );
}

// P-1. Upgrade takes a snapshot BEFORE any migration write: the snapshot
// lacks the new column while the live DB gains it, and user data survives.
{
  const dir = tempDir('acculedger-premigrate-upgrade-');
  initDatabase(dir);
  closeDatabase();

  // Simulate a 1-year-old database: v17 never applied.
  const reopened = new Database(path.join(dir, 'database', 'app.sqlite'));
  reopened.exec('ALTER TABLE business_settings DROP COLUMN logo_data');
  reopened.exec('DELETE FROM _migrations WHERE version = 17');
  reopened.close();

  initDatabase(dir);
  const snaps = backupsOf(dir);
  assert.equal(snaps.length, 1, 'exactly one pre-migrate snapshot');
  const snapDb = new Database(path.join(dir, 'backups', snaps[0]), { readonly: true });
  assert.ok(
    !columns(snapDb, 'business_settings').includes('logo_data'),
    'snapshot predates the migration'
  );
  const bizName = (
    snapDb.prepare('SELECT business_name AS v FROM business_settings').get() as { v: string }
  ).v;
  snapDb.close();

  const db = getSqlite();
  assert.ok(columns(db, 'business_settings').includes('logo_data'), 'live DB migrated');
  assert.ok(
    (db.prepare('SELECT version AS v FROM _migrations').all() as Array<{ v: number }>).some(
      (r) => r.v === 17
    ),
    'v17 recorded applied'
  );
  assert.equal(
    (db.prepare('SELECT business_name AS v FROM business_settings').get() as { v: string }).v,
    bizName,
    'user data preserved across the update'
  );
  closeDatabase();
  console.log('P-1 upgrade snapshot-before-write: OK');
}

// P-2. Fresh install takes no snapshot (nothing to protect).
{
  const dir = tempDir('acculedger-premigrate-fresh-');
  initDatabase(dir);
  closeDatabase();
  assert.deepEqual(backupsOf(dir), [], 'no snapshot on fresh install');
  console.log('P-2 fresh install takes no snapshot: OK');
}

// P-3. A snapshot failure (unwritable backups dir) never blocks migration.
{
  const dir = tempDir('acculedger-premigrate-nobackup-');
  const blocker = path.join(dir, 'backups');
  fs.writeFileSync(blocker, 'not-a-directory');
  const dbFile = path.join(dir, 'stuck.sqlite');
  const seed = new Database(dbFile);
  const first = runMigrations(seed);
  assert.ok(first.applied.length > 0, 'baseline migrations apply');
  seed.exec('ALTER TABLE business_settings DROP COLUMN logo_data');
  seed.exec('DELETE FROM _migrations WHERE version = 17');
  const second = runMigrations(seed, { backupsDir: blocker });
  assert.deepEqual(second.applied, [17], 'pending migration still applies');
  assert.equal(second.preMigrateBackup, null, 'no snapshot recorded on failure');
  assert.ok(
    columns(seed, 'business_settings').includes('logo_data'),
    'schema converges despite backup failure'
  );
  seed.close();
  console.log('P-3 snapshot failure never blocks migration: OK');
}

// P-4. Snapshot retention is capped; manual app-* backups are never touched.
{
  const dir = tempDir('acculedger-premigrate-prune-');
  const bdir = path.join(dir, 'backups');
  fs.mkdirSync(bdir, { recursive: true });
  for (let i = 0; i < MAX_PRE_MIGRATE_BACKUPS + 3; i++) {
    fs.writeFileSync(path.join(bdir, `pre-migrate-2025-01-0${i}-000000.sqlite`), 'x');
  }
  fs.writeFileSync(path.join(bdir, 'app-2025-01-01-000000.sqlite'), 'x');
  prunePreMigrateBackups(bdir);
  const remaining = fs.readdirSync(bdir);
  assert.equal(
    remaining.filter((f) => f.startsWith('pre-migrate-')).length,
    MAX_PRE_MIGRATE_BACKUPS,
    'snapshots capped'
  );
  assert.ok(remaining.includes('app-2025-01-01-000000.sqlite'), 'manual backup untouched');
  console.log('P-4 snapshot retention cap: OK');
}

console.log('premigrate.test: all assertions passed');
