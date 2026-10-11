import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDatabase, closeDatabase, getSqlite } from '../../electron/database/index.js';
import * as m0001 from '../../electron/database/migrations/0001_initial.js';
import * as m0002 from '../../electron/database/migrations/0002_auth.js';
import * as m0003 from '../../electron/database/migrations/0003_business_config.js';
import * as m0004 from '../../electron/database/migrations/0004_single_owner.js';
import * as m0005 from '../../electron/database/migrations/0005_customer_number.js';
import * as m0006 from '../../electron/database/migrations/0006_customer_pricing.js';

const DIRS: string[] = [];
function tempDir(prefix: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  DIRS.push(d);
  return d;
}

afterEach(() => {
  try {
    closeDatabase();
  } catch {
    // already closed
  }
});

// Builds a genuine legacy v6 database by hand: baseline DDL has no fy /
// invoice_start_number / invoice_series, and _migrations stops at 6.
async function buildLegacyV6(dir: string): Promise<void> {
  const dbDir = path.join(dir, 'database');
  fs.mkdirSync(dbDir, { recursive: true });
  const Database = (await import('better-sqlite3')).default;
  const legacy = new Database(path.join(dbDir, 'app.sqlite'));
  legacy.exec(m0001.sql);
  legacy.exec(m0002.sql);
  legacy.exec(m0003.sql);
  legacy.exec(m0004.sql);
  legacy.exec(m0005.sql);
  legacy.exec(m0006.sql);
  // 0005 backfills customer_number for existing rows; none exist yet.
  legacy.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL
  );`);
  const now = new Date().toISOString();
  for (const m of [m0001, m0002, m0003, m0004, m0005, m0006]) {
    legacy.prepare('INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)').run(m.version, m.name, now);
  }
  legacy.prepare(`INSERT INTO business_settings (id, business_name, legal_name, gst_number, pan,
    address, city, state, country, postal_code, phone, email, website, bank_name, bank_account_number,
    ifsc, branch, invoice_prefix, invoice_next_number, currency, default_gst_rate, state_code,
    created_at, updated_at) VALUES ('biz-1','B','L','24AAACA9999P1Z1','AAACA9999P','A','C','S','IN','1',
    'P','E','W','BN','1','IFSC','BR','ABC-',1004,'INR',5,'24','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`).run();
  legacy.prepare(`INSERT INTO customers (id, customer_name, customer_number, pan, gst_number, email, mobile,
    address, city, state, country, postal_code, state_code, bank_details, credit_limit, is_active,
    created_at, updated_at) VALUES ('cust-9','Legacy Co','C-9009','AAAAA0000A','24AAAAA0000A1Z5','e@x.com',
    '9000000000','A','Surat','Gujarat','India','395001','24',NULL,NULL,1,
    '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`).run();
  legacy.prepare(`INSERT INTO invoices (id, invoice_number, customer_id, invoice_date, billing_period_start,
    billing_period_end, status, subtotal, discount, taxable_amount, cgst, sgst, igst, other_charges,
    grand_total, customer_snapshot, business_snapshot, bank_snapshot, notes, created_at, updated_at)
    VALUES ('inv-old','ABC-1004','cust-9','2026-01-20T10:00:00Z','2026-01-01','2026-01-31','FINALIZED',
    100,0,100,2.5,2.5,0,0,105,'{}','{}','{}','', '2026-01-20T10:00:00Z','2026-01-20T10:00:00Z')`).run();
  legacy.close();
}

describe('v6 → v13 upgrade adoption', () => {
  it('applies v7 through v13: fy backfilled, counters default, legacy number untouched, no series fabricated', () => {
    const dir = tempDir('acculedger-fy-upgrade-');
    return buildLegacyV6(dir).then(() => {
      delete process.env.VITE_DEV_SERVER_URL;
      initDatabase(dir);
      const db = getSqlite();
      const vers = db.prepare('SELECT version FROM _migrations ORDER BY version').all();
      expect(vers).toEqual([
        { version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 },
        { version: 6 }, { version: 7 }, { version: 8 }, { version: 9 }, { version: 10 },
        { version: 11 }, { version: 12 }, { version: 13 }, { version: 14 },
      ]);

      const inv = db.prepare('SELECT invoice_number, fy FROM invoices WHERE id=?').get('inv-old') as {
        invoice_number: string;
        fy: string;
      };
      expect(inv.invoice_number).toBe('ABC-1004');
      expect(inv.fy).toBe('2025-26');

      const biz = db.prepare('SELECT invoice_start_number, customer_next_number FROM business_settings WHERE id=?').get('biz-1') as {
        invoice_start_number: number;
        customer_next_number: number;
      };
      expect(biz.invoice_start_number).toBe(1);
      expect(biz.customer_next_number).toBe(1);

      const series = db.prepare('SELECT COUNT(*) AS c FROM invoice_series').get() as { c: number };
      expect(series.c).toBe(0);

      const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='invoices_fy_number_unique'").get();
      expect(idx).toBeDefined();
    });
  });
});
