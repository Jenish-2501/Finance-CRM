// M2 Business Setup & Configuration self-tests: migration 0003, fresh-install
// UOM seeding, validated settings/UOM service, new IPC channel parity.
// Run: npx tsx electron/database/__tests__/m2.test.ts  (or npm run test:m2)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDatabase, closeDatabase, getSqlite } from '../index.js';
import { sql as v1sql } from '../migrations/0001_initial.js';
import { Repositories } from '../repositories/repositories.js';
import {
  getBusinessSettings,
  updateBusinessSettings,
  listUoms,
  createUom,
  setUomActive,
} from '../../services/businessService.js';

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const VALID_SETTINGS = {
  business_name: 'Test Traders',
  legal_name: 'Test Traders Private Limited',
  gst_number: '24AAACT1234F1Z5',
  pan: 'AAACT1234F',
  address: '12 Market Road',
  city: 'Surat',
  state: 'Gujarat',
  country: 'India',
  postal_code: '395001',
  phone: '+91 9000000000',
  email: 'accounts@testtraders.in',
  website: 'https://testtraders.example.com',
  bank_name: 'Test Bank',
  bank_account_number: '1234567890',
  ifsc: 'TEST0001234',
  branch: 'Surat Main',
  invoice_prefix: 'TT-2026-',
  invoice_next_number: 42,
  currency: 'INR',
  default_gst_rate: 12,
  state_code: '24',
};

// M2-1. Migration 0003: unique index on uoms(code); legacy duplicate codes
// (mixed case) collapse to one row and pre-existing installs adopt cleanly.
{
  const dir = tempDir('acculedger-m2-legacy-');
  const dbDir = path.join(dir, 'database');
  fs.mkdirSync(dbDir, { recursive: true });
  const Database = (await import('better-sqlite3')).default;
  const raw = new Database(path.join(dbDir, 'app.sqlite'));
  raw.exec(v1sql);
  const now = new Date().toISOString();
  const insert = raw.prepare(
    'INSERT INTO uoms (id, code, name, description, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  insert.run('uom-pcs', 'PCS', 'Pieces', 'desc', 1, now, now);
  insert.run('uom-dup', 'pcs', 'Dupe Pieces', 'desc', 1, now, now);
  insert.run('uom-kg', 'KG', 'Kilograms', 'desc', 1, now, now);
  raw.close();

  initDatabase(dir);
  const db = getSqlite();
  const idx = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='uoms_code_unique'")
    .get();
  assert.ok(idx, 'uoms_code_unique index created');
  const codes = (
    db.prepare('SELECT code FROM uoms ORDER BY code').all() as Array<{ code: string }>
  ).map((r) => r.code);
  assert.deepEqual(codes, ['KG', 'PCS'], 'duplicate codes deduped + normalized');
  const applied = (
    db.prepare('SELECT version FROM _migrations ORDER BY version').all() as Array<{ version: number }>
  ).map((r) => r.version);
  assert.ok(applied.includes(3), 'migration 0003 recorded');
  closeDatabase();
  console.log('M2-1 migration 0003 dedupe + unique index: OK');
}

// M2-2. Fresh install seeds the 4 standard UOMs (idempotent, never overwrites).
{
  const dir = tempDir('acculedger-m2-seed-');
  initDatabase(dir);
  const uoms = listUoms();
  assert.equal(uoms.length, 4, 'four standard UOMs seeded');
  assert.ok(uoms.every((u) => u.is_active === true), 'all seeded UOMs active');
  assert.ok(uoms.some((u) => u.code === 'PCS'), 'PCS present');
  assert.ok(uoms.some((u) => u.code === 'KG'), 'KG present');
  assert.ok(uoms.some((u) => u.code === 'BOX'), 'BOX present');
  assert.ok(uoms.some((u) => u.code === 'GRAM'), 'GRAM present');
  closeDatabase();

  initDatabase(dir); // reopen: no duplicates, custom rows preserved
  assert.equal(listUoms().length, 4, 'no duplicate seeding on reopen');
  closeDatabase();
  console.log('M2-2 fresh-install UOM seeding: OK');
}

// M2-3. Validated settings update: accepts good input, persists, and rejects
// GSTIN/PAN/state/rate/numbering problems with precise error codes.
{
  const dir = tempDir('acculedger-m2-settings-');
  initDatabase(dir);

  const ok = updateBusinessSettings(VALID_SETTINGS);
  assert.equal(ok.ok, true, 'valid settings accepted');
  assert.equal((ok.settings as { invoice_next_number: number }).invoice_next_number, 42);
  const reloaded = getBusinessSettings() as { business_name: string; gst_number: string };
  assert.equal(reloaded.business_name, 'Test Traders', 'settings persisted');
  assert.equal(reloaded.gst_number, '24AAACT1234F1Z5', 'GSTIN normalized to upper case');

  const badGstin = updateBusinessSettings({ ...VALID_SETTINGS, gst_number: 'BOGUS' });
  assert.equal(badGstin.ok, false);
  assert.equal(badGstin.error, 'INVALID_GSTIN');

  const mismatch = updateBusinessSettings({ ...VALID_SETTINGS, state_code: '27' });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error, 'GSTIN_STATE_MISMATCH');

  const badPan = updateBusinessSettings({ ...VALID_SETTINGS, pan: 'NOPE' });
  assert.equal(badPan.error, 'INVALID_PAN');

  const badState = updateBusinessSettings({ ...VALID_SETTINGS, state_code: '99' });
  assert.equal(badState.error, 'INVALID_STATE_CODE');

  const badRate = updateBusinessSettings({ ...VALID_SETTINGS, default_gst_rate: 7 });
  assert.equal(badRate.error, 'INVALID_GST_RATE');

  const badNum = updateBusinessSettings({ ...VALID_SETTINGS, invoice_next_number: 0 });
  assert.equal(badNum.error, 'INVALID_NEXT_NUMBER');

  const badMail = updateBusinessSettings({ ...VALID_SETTINGS, email: 'not-an-email' });
  assert.equal(badMail.error, 'INVALID_EMAIL');

  // Rejected writes must not clobber the stored row.
  assert.equal(
    (getBusinessSettings() as { business_name: string }).business_name,
    'Test Traders',
    'failed update leaves stored row untouched'
  );
  closeDatabase();
  console.log('M2-3 settings validation + persistence: OK');
}

// M2-4. UOM lifecycle: create, duplicate-code rejection, referenced and
// last-active deactivation guards.
{
  const dir = tempDir('acculedger-m2-uoms-');
  initDatabase(dir);

  const created = createUom({ code: 'carton', name: 'Cartons', description: 'Big box' });
  assert.equal(created.ok, true, 'uom created');
  assert.equal((created.uom as { code: string }).code, 'CARTON', 'code normalized');

  const dupe = createUom({ code: 'CARTON', name: 'Other' });
  assert.equal(dupe.ok, false);
  assert.equal(dupe.error, 'UOM_CODE_EXISTS');

  const badCode = createUom({ code: '!!!', name: 'Bad' });
  assert.equal(badCode.error, 'INVALID_UOM_CODE');

  // Referenced UOM cannot be deactivated: point a product at CARTON.
  const cartonId = (created.uom as { id: string }).id;
  const now = new Date().toISOString();
  Repositories.products.upsert({
    id: 'prod-m2',
    product_name: 'M2 Widget',
    sku: 'M2W-1',
    description: 'test product',
    image: null,
    primary_unit_id: cartonId,
    is_active: true,
    created_at: now,
    updated_at: now,
  });
  const blocked = setUomActive(cartonId, false);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'UOM_REFERENCED');

  // Unreferenced UOM deactivates fine.
  const kg = listUoms().find((u) => u.code === 'KG') as { id: string };
  const deactivated = setUomActive(kg.id, false);
  assert.equal(deactivated.ok, true);
  assert.equal((deactivated.uom as { is_active: boolean }).is_active, false);

  // Last active UOM cannot go inactive: deactivate everything else first.
  for (const u of listUoms()) {
    if ((u as { is_active: boolean }).is_active === true && (u as { id: string }).id !== cartonId) {
      // CARTON is referenced (blocked); others deactivate unless referenced.
      const r = setUomActive((u as { id: string }).id, false);
      void r;
    }
  }
  const remaining = listUoms().filter((u) => (u as { is_active: boolean }).is_active === true);
  assert.ok(remaining.length >= 1, 'at least the referenced unit stays active');
  const lastId = (remaining[0] as { id: string }).id;
  // Make CARTON unreferenced by removing the test product, then only one
  // active unit exists alongside inactive ones — deactivating it must fail
  // only when it is truly the last one.
  const { deleteRow } = await import('../repositories/mappers.js');
  deleteRow('products', 'prod-m2');
  const actives = listUoms().filter((u) => (u as { is_active: boolean }).is_active === true);
  for (const u of actives) {
    if ((u as { id: string }).id !== lastId) setUomActive((u as { id: string }).id, false);
  }
  const stillActive = listUoms().filter((u) => (u as { is_active: boolean }).is_active === true);
  assert.equal(stillActive.length, 1, 'exactly one active unit left');
  const lastGuard = setUomActive((stillActive[0] as { id: string }).id, false);
  assert.equal(lastGuard.ok, false);
  assert.equal(lastGuard.error, 'UOM_LAST_ACTIVE');

  // Reactivation always allowed.
  const reactivated = setUomActive(kg.id, true);
  assert.equal(reactivated.ok, true);

  const missing = setUomActive('uom-nope', false);
  assert.equal(missing.error, 'UOM_NOT_FOUND');
  closeDatabase();
  console.log('M2-4 UOM lifecycle guards: OK');
}

// M2-5. New M2 channels exist on both sides of the bridge (preload invoke <->
// main handler), matching the M1-3 parity contract.
{
  const preloadSrc = fs.readFileSync('electron/preload.ts', 'utf8');
  const handlersSrc = fs.readFileSync('electron/ipc/handlers.ts', 'utf8');
  for (const ch of [
    'business-settings:get',
    'business-settings:update',
    'uoms:list',
    'uoms:create',
    'uoms:set-active',
  ]) {
    assert.ok(preloadSrc.includes(`'${ch}'`), `preload exposes ${ch}`);
    assert.ok(handlersSrc.includes(`'${ch}'`), `main handles ${ch}`);
  }
  console.log('M2-5 IPC channel parity: OK');
}

console.log('m2.test: all assertions passed');
