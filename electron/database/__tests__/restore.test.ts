// Restore-with-override cycle tests: validate, replace, reopen, rollback safety.
// Run: npm run test:restore (tsx, isolated temp userData — never the real DB).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDatabase, closeDatabase, getSqlite } from '../index.js';
import { Repositories } from '../repositories/repositories.js';
import {
  validateBackupFile,
  restoreDatabaseFromFile,
} from '../../services/backupService.js';

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const now = () => new Date().toISOString();

const marker = (name: string) => ({
  id: 'cust-restore-1',
  customer_name: name,
  customer_number: 'C-R1',
  pan: 'ABCDE1234F',
  gst_number: '24ABCDE1234F1Z5',
  mobile: '9999999999',
  address: 'Addr',
  city: 'Surat',
  state: 'Gujarat',
  country: 'India',
  postal_code: '395001',
  bank_details: null,
  credit_limit: null,
  is_active: true,
  created_at: now(),
  updated_at: now(),
});

function markerName(): string | undefined {
  const all = Repositories.customers.findAll() as Array<Record<string, unknown>>;
  return all.find((c) => c.id === 'cust-restore-1')?.customer_name as string | undefined;
}

function activeFile(dir: string): string {
  return path.join(dir, 'database', 'app.sqlite');
}

// 1. Full cycle: tampered live data is overridden by the backup; safety copy kept.
{
  const dir = tempDir('acculedger-restore-cycle-');
  initDatabase(dir);
  Repositories.customers.upsert(marker('Restore Marker'));
  closeDatabase();

  const source = path.join(dir, 'source-backup.sqlite');
  fs.copyFileSync(activeFile(dir), source);

  initDatabase(dir);
  Repositories.customers.upsert(marker('Tampered After Backup'));
  assert.equal(markerName(), 'Tampered After Backup');

  const result = restoreDatabaseFromFile(source, dir);
  assert.equal(result.ok, true);
  assert.ok(result.safetyFile && fs.existsSync(result.safetyFile), 'safety backup kept');
  assert.equal(markerName(), 'Restore Marker', 'live data overridden by backup');
  closeDatabase();
  console.log('R-1 restore cycle with safety backup: OK');
}

// 2. Invalid files are rejected before touching the live database.
{
  const dir = tempDir('acculedger-restore-invalid-');
  initDatabase(dir);
  Repositories.customers.upsert(marker('Untouched'));
  const junk = path.join(dir, 'junk.txt');
  fs.writeFileSync(junk, 'not a database');

  assert.deepEqual(validateBackupFile(junk), { ok: false, error: 'INVALID_BACKUP' });
  // Valid SQLite but wrong schema is also rejected.
  const other = path.join(dir, 'other.sqlite');
  {
    const Database = (await import('better-sqlite3')).default;
    const odd = new Database(other);
    odd.exec('CREATE TABLE notes (id TEXT PRIMARY KEY)');
    odd.close();
  }
  assert.deepEqual(validateBackupFile(other), { ok: false, error: 'INVALID_BACKUP' });

  const before = markerName();
  assert.deepEqual(restoreDatabaseFromFile(junk, dir), { ok: false, error: 'INVALID_BACKUP' });
  assert.equal(markerName(), before, 'live data untouched after rejection');
  assert.ok(getSqlite(), 'live handle still usable');
  closeDatabase();
  console.log('R-2 invalid backup rejection: OK');
}

// 3. Restoring the active file itself is a safe no-op.
{
  const dir = tempDir('acculedger-restore-same-');
  initDatabase(dir);
  assert.deepEqual(restoreDatabaseFromFile(activeFile(dir), dir), { ok: true });
  closeDatabase();
  console.log('R-3 same-file no-op: OK');
}

console.log('restore.test: all assertions passed');
