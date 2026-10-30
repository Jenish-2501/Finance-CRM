// Desktop-conversion self-tests: capabilities, shell matrix, DB file split,
// legacy adoption, update preservation, offline bundle.
// Run: npm run test:desktop
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCapabilities, buildVersion } from '../../utils/capabilities.js';
import { hasDesktopBridge, isElectronShell } from '../../../src/utils/shellEnv.js';
import { initDatabase, closeDatabase, getSqlite } from '../index.js';

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// D-1. Capabilities contract: main is authoritative, all true, typed.
{
  const caps = buildCapabilities();
  assert.deepEqual(caps, {
    isElectron: true,
    canManagePasscode: true,
    canUseLocalDatabase: true,
    canAccessFilesystem: true,
  });
  const ver = buildVersion({ app: '1.0.0', electron: '44', chrome: '1', node: '22', platform: 'win32' });
  assert.equal(ver.app, '1.0.0');
  assert.equal(ver.platform, 'win32');
  console.log('D-1 capabilities contract: OK');
}

// D-2. Shell matrix: bridge x user-agent (no faked detection).
{
  assert.equal(hasDesktopBridge({ passcode: {} }), true, 'canonical bridge');
  assert.equal(hasDesktopBridge({ auth: {} }), true, 'legacy alias bridge');
  assert.equal(hasDesktopBridge({}), false, 'no bridge');
  assert.equal(hasDesktopBridge(null), false, 'null bridge');
  assert.equal(isElectronShell('Mozilla/5.0 Electron/44.5.1 Chrome/120 Safari/537.36'), true);
  assert.equal(
    isElectronShell('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36'),
    false
  );
  // The reported bug matrix: browser tab has no bridge and no Electron UA.
  assert.equal(hasDesktopBridge({}) === false && isElectronShell('Chrome/120') === false, true);
  console.log('D-2 shell matrix: OK');
}

// D-3. Production DB file is app.sqlite (no dev server env).
{
  const dir = tempDir('acculedger-desk-prod-');
  delete process.env.VITE_DEV_SERVER_URL;
  initDatabase(dir);
  assert.ok(fs.existsSync(path.join(dir, 'database', 'app.sqlite')), 'app.sqlite created');
  assert.ok(!fs.existsSync(path.join(dir, 'database', 'dev.sqlite')), 'no dev file in prod');
  closeDatabase();
  console.log('D-3 prod DB file: OK');
}

// D-4. Dev DB file is dev.sqlite and never touches app.sqlite.
{
  const dir = tempDir('acculedger-desk-dev-');
  process.env.VITE_DEV_SERVER_URL = 'http://localhost:3000/';
  initDatabase(dir);
  assert.ok(fs.existsSync(path.join(dir, 'database', 'dev.sqlite')), 'dev.sqlite created');
  assert.ok(!fs.existsSync(path.join(dir, 'database', 'app.sqlite')), 'no prod file in dev');
  closeDatabase();
  delete process.env.VITE_DEV_SERVER_URL;
  console.log('D-4 dev DB file: OK');
}

// D-5. Legacy application.db adopted to app.sqlite with data intact;
// legacy users table removed by the single-owner migration.
{
  const dir = tempDir('acculedger-desk-legacy-');
  const dbDir = path.join(dir, 'database');
  fs.mkdirSync(dbDir, { recursive: true });
  const Database = (await import('better-sqlite3')).default;
  const legacy = new Database(path.join(dbDir, 'application.db'));
  // Faithful pre-migration v1 customers shape (mirrors 0001_initial.ts):
  // every released database carries email/state_code until v11 drops them.
  legacy.exec(
    "CREATE TABLE customers (id TEXT PRIMARY KEY, customer_name TEXT NOT NULL, pan TEXT NOT NULL, gst_number TEXT NOT NULL, email TEXT NOT NULL, mobile TEXT NOT NULL, address TEXT NOT NULL, city TEXT NOT NULL, state TEXT NOT NULL, country TEXT NOT NULL, postal_code TEXT NOT NULL, state_code TEXT NOT NULL, bank_details TEXT, credit_limit REAL, is_active INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL); INSERT INTO customers (id, customer_name, pan, gst_number, email, mobile, address, city, state, country, postal_code, state_code, is_active, created_at, updated_at) VALUES ('cust-old', 'Old Customer', 'AAAAA0000A', '24AAAAA0000A1Z5', 'old@example.com', '9000000000', 'A', 'Surat', 'Gujarat', 'India', '395001', '24', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')"
  );
  legacy.close();
  delete process.env.VITE_DEV_SERVER_URL;
  initDatabase(dir);
  assert.ok(fs.existsSync(path.join(dbDir, 'app.sqlite')), 'adopted to app.sqlite');
  const row = getSqlite().prepare('SELECT customer_name FROM customers WHERE id=?').get('cust-old') as {
    customer_name: string;
  };
  assert.equal(row?.customer_name, 'Old Customer', 'update preserves existing data');
  const tables = new Set(
    (getSqlite().prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(
      (r) => r.name
    )
  );
  assert.ok(!tables.has('users'), 'legacy users table dropped (single-owner)');
  const vers = getSqlite().prepare('SELECT version FROM _migrations ORDER BY version').all();
  assert.deepEqual(vers, [{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }, { version: 6 }, { version: 7 }, { version: 8 }, { version: 9 }, { version: 10 }, { version: 11 }, { version: 12 }, { version: 13 }, { version: 14 }, { version: 15 }, { version: 16 }, { version: 17 }, { version: 18 }, { version: 19 }, { version: 20 }]);
  closeDatabase();
  console.log('D-5 legacy adoption + update preservation: OK');
}

// D-6. Offline bundle: no remote URLs or CDN references in dist.
{
  const html = fs.readFileSync('dist/index.html', 'utf8');
  assert.ok(!html.includes('https://'), 'index.html has no remote URLs');
  assert.ok(!html.includes('fonts.googleapis'), 'no font CDN');
  assert.ok(html.includes('Content-Security-Policy'), 'production CSP present');
  assert.ok(!html.match(/\*/), 'CSP has no wildcards');
  const assets = fs.readdirSync('dist/assets');
  assert.ok(assets.filter((f) => f.endsWith('.woff2')).length >= 7, 'self-hosted fonts bundled');
  console.log('D-6 offline bundle: OK');
}

console.log('desktop.test: all assertions passed');
