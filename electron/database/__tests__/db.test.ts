// Database layer tests: init, CRUD, constraints, transactions,
// migration idempotency, restart persistence, health/integrity.
// Run: npm run test:db
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDatabase, checkDatabaseHealth, checkDatabaseIntegrity, closeDatabase, getSqlite } from '../index.js';
import { Repositories } from '../repositories/repositories.js';
import { saveDiffTransaction } from '../../services/transactionService.js';
import { toAppError } from '../../utils/errors.js';

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const now = () => new Date().toISOString();

// 1. Fresh install: create + migrate
{
  const dir = tempDir('acculedger-db-fresh-');
  initDatabase(dir);
  assert.ok(fs.existsSync(path.join(dir, 'database', 'app.sqlite')), 'database file created');
  const applied = getSqlite().prepare('SELECT version FROM _migrations ORDER BY version').all();
  assert.deepEqual(applied, [{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }, { version: 6 }, { version: 7 }, { version: 8 }, { version: 9 }, { version: 10 }, { version: 11 }, { version: 12 }, { version: 13 }, { version: 14 }, { version: 15 }, { version: 16 }, { version: 17 }]);
  const health = checkDatabaseHealth();
  assert.equal(health.connected, true);
  assert.equal(health.migrationStatus, 'OK');
  assert.ok(health.sqliteVersion.length > 0);
  const integrity = checkDatabaseIntegrity();
  assert.equal(integrity.ok, true);
  closeDatabase();

  // 2. Existing install: reopen detects no pending migrations
  initDatabase(dir);
  const health2 = checkDatabaseHealth();
  assert.equal(health2.migrationStatus, 'OK');
  assert.deepEqual(health2.appliedMigrations, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  closeDatabase();
}

// 3. CRUD + restart persistence
{
  const dir = tempDir('acculedger-db-crud-');
  initDatabase(dir);

  const customer = {
    id: 'cust-test-1',
    customer_name: 'Test Customer',
    customer_number: 'C-9001',
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
  };
  Repositories.customers.upsert(customer);
  let all = Repositories.customers.findAll() as Array<Record<string, unknown>>;
  assert.ok(all.some((c) => c.id === 'cust-test-1'));
  assert.equal(all.find((c) => c.id === 'cust-test-1')?.customer_name, 'Test Customer');

  // Update via upsert
  Repositories.customers.upsert({ ...customer, customer_name: 'Renamed' });
  all = Repositories.customers.findAll() as Array<Record<string, unknown>>;
  assert.equal(all.find((c) => c.id === 'cust-test-1')?.customer_name, 'Renamed');

  closeDatabase();

  // Reopen — data survives restart
  initDatabase(dir);
  const after = Repositories.customers.findAll() as Array<Record<string, unknown>>;
  assert.equal(after.find((c) => c.id === 'cust-test-1')?.customer_name, 'Renamed');
  closeDatabase();
}

// 4. Constraints map to safe errors (no raw SQL leak)
{
  const dir = tempDir('acculedger-db-constraints-');
  initDatabase(dir);
  let code = '';
  try {
    Repositories.productUnits.upsert({
      id: 'pu-bad-1',
      product_id: 'prod-missing',
      unit_id: 'uom-missing',
      conversion_to_primary: 1,
      is_stock_unit: true,
      is_billing_unit: true,
      created_at: now(),
      updated_at: now(),
    });
  } catch (err) {
    code = toAppError(err).code;
  }
  assert.equal(code, 'FOREIGN_KEY_VIOLATION');
  closeDatabase();
}

// 5. Failed multi-entity transaction rolls back completely
{
  const dir = tempDir('acculedger-db-tx-');
  initDatabase(dir);

  const goodCustomer = {
    id: 'cust-tx-1',
    customer_name: 'Tx Customer',
    customer_number: 'C-9002',
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
  };
  const badUnit = {
    id: 'pu-tx-bad',
    product_id: 'prod-missing',
    unit_id: 'uom-missing',
    conversion_to_primary: 1,
    is_stock_unit: true,
    is_billing_unit: true,
    created_at: now(),
    updated_at: now(),
  };

  let threw = false;
  try {
    saveDiffTransaction({ customers: [goodCustomer], productUnits: [badUnit] });
  } catch {
    threw = true;
  }
  assert.equal(threw, true, 'transaction must fail');
  const customers = Repositories.customers.findAll() as Array<Record<string, unknown>>;
  assert.equal(customers.some((c) => c.id === 'cust-tx-1'), false, 'rolled back, no partial write');
  closeDatabase();
}

// 6. Auth: default passcode seeded, verified from DB, changeable, lockout
{
  const dir = tempDir('acculedger-db-auth-');
  initDatabase(dir);
  const { verifyPasscode, changePasscode, resetAuthThrottle } = await import(
    '../../services/authService.js'
  );

  // Migrations v2+v3 applied on fresh install
  const applied = getSqlite().prepare('SELECT version FROM _migrations ORDER BY version').all();
  assert.deepEqual(applied, [{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }, { version: 6 }, { version: 7 }, { version: 8 }, { version: 9 }, { version: 10 }, { version: 11 }, { version: 12 }, { version: 13 }, { version: 14 }, { version: 15 }, { version: 16 }, { version: 17 }]);

  // Default 1234 works; only a hash is stored, never plaintext
  assert.deepEqual(verifyPasscode('1234'), { ok: true });
  assert.deepEqual(verifyPasscode('0000'), { ok: false, error: 'INCORRECT' });
  const row = getSqlite().prepare('SELECT password_hash FROM auth_settings WHERE id = ?').get('local') as {
    password_hash: string;
  };
  assert.ok(row.password_hash.startsWith('scrypt$'), 'salted scrypt hash stored');
  assert.ok(!row.password_hash.includes('1234'), 'no plaintext in database');

  // Change passcode: new works, old stops
  assert.deepEqual(changePasscode('1234', '5678'), { ok: true });
  assert.deepEqual(verifyPasscode('5678'), { ok: true });
  assert.deepEqual(verifyPasscode('1234'), { ok: false, error: 'INCORRECT' });

  // Wrong current rejected; malformed rejected
  assert.deepEqual(changePasscode('wrong', '9999'), { ok: false, error: 'INCORRECT_CURRENT' });
  assert.deepEqual(changePasscode('5678', 'ab'), { ok: false, error: 'INVALID' });

  // Brute-force throttle: 5 failures -> locked
  resetAuthThrottle();
  for (let i = 0; i < 5; i++) verifyPasscode('nope-wrong');
  assert.deepEqual(verifyPasscode('5678'), { ok: false, error: 'LOCKED' });
  resetAuthThrottle();
  assert.deepEqual(verifyPasscode('5678'), { ok: true });

  closeDatabase();

  // Restart: credential survives reopen
  initDatabase(dir);
  const { verifyPasscode: verifyAgain } = await import('../../services/authService.js');
  assert.deepEqual(verifyAgain('5678'), { ok: true });
  closeDatabase();
}

console.log('db.test: all assertions passed');
