import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDatabase, closeDatabase, getSqlite } from '../../electron/database/index.js';
import { Repositories } from '../../electron/database/repositories/repositories.js';
import * as m0001 from '../../electron/database/migrations/0001_initial.js';
import * as m0002 from '../../electron/database/migrations/0002_auth.js';
import * as m0003 from '../../electron/database/migrations/0003_business_config.js';
import * as m0004 from '../../electron/database/migrations/0004_single_owner.js';
import * as m0005 from '../../electron/database/migrations/0005_customer_number.js';
import * as m0006 from '../../electron/database/migrations/0006_customer_pricing.js';
import * as m0007 from '../../electron/database/migrations/0007_fy_numbering.js';
import * as m0008 from '../../electron/database/migrations/0008_customer_counter_and_invoice_identity.js';

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

afterEach(() => {
  try {
    closeDatabase();
  } catch {
    // already closed
  }
});

const T = '2026-01-10T10:00:00Z';

// Genuine legacy v8 database: no document_next_number, no headers, no document_id,
// multi-row challan (2 products, one ref) + return + same ref string at another customer.
async function buildLegacyV8(dir: string): Promise<void> {
  const dbDir = path.join(dir, 'database');
  fs.mkdirSync(dbDir, { recursive: true });
  const Database = (await import('better-sqlite3')).default;
  const legacy = new Database(path.join(dbDir, 'app.sqlite'));
  for (const m of [m0001, m0002, m0003, m0004, m0005, m0006, m0007, m0008]) legacy.exec(m.sql);
  legacy.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL
  );`);
  for (const m of [m0001, m0002, m0003, m0004, m0005, m0006, m0007, m0008]) {
    legacy.prepare('INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)').run(m.version, m.name, T);
  }
  legacy.prepare(`INSERT INTO business_settings (id, business_name, legal_name, gst_number, pan,
    address, city, state, country, postal_code, phone, email, website, bank_name, bank_account_number,
    ifsc, branch, invoice_prefix, invoice_next_number, invoice_start_number, customer_next_number,
    currency, default_gst_rate, state_code, created_at, updated_at) VALUES ('biz-1','B','L',
    '24AAACA9999P1Z1','AAACA9999P','A','C','S','IN','1','P','E','W','BN','1','IFSC','BR','ABC-',
    1004,1,1,'INR',5,'24','${T}','${T}')`).run();
  for (const [id, num] of [['cust-A', 'C-9001'], ['cust-B', 'C-9002']] as Array<[string, string]>) {
    legacy.prepare(`INSERT INTO customers (id, customer_name, customer_number, pan, gst_number, email,
      mobile, address, city, state, country, postal_code, state_code, bank_details, credit_limit,
      is_active, created_at, updated_at) VALUES ('${id}','N','${num}','AAAAA0000A','24AAAAA0000A1Z5',
      'e@x.com','9000000000','A','Surat','Gujarat','India','395001','24',NULL,NULL,1,'${T}','${T}')`).run();
  }
  legacy.prepare(`INSERT INTO uoms (id, code, name, description, is_active, created_at, updated_at)
    VALUES ('uom-pcs','PCS','Pieces','',1,'${T}','${T}')`).run();
  for (const [id, sku] of [['prod-1', 'S1'], ['prod-2', 'S2']] as Array<[string, string]>) {
    legacy.prepare(`INSERT INTO products (id, product_name, sku, description, image, primary_unit_id,
      hsn_code, is_active, created_at, updated_at) VALUES ('${id}','P','${sku}','',NULL,'uom-pcs',
      NULL,1,'${T}','${T}')`).run();
  }
  const mov = (
    id: string, cust: string, prod: string, type: string, refType: string, ref: string, qty: number,
    vehicle: string | null = null, note = 'n'
  ) =>
    legacy.prepare(`INSERT INTO customer_inventory_movements (id, customer_id, product_id, unit_id,
      quantity, movement_type, movement_date, reference_type, reference_id, notes,
      vehicle_number, transporter_name, eway_bill_number, dispatch_purpose, created_at, created_by)
      VALUES ('${id}','${cust}','${prod}','uom-pcs',${qty},'${type}','${T}','${refType}','${ref}','${note}',
      ${vehicle === null ? 'NULL' : `'${vehicle}'`},NULL,NULL,NULL,'${T}','owner')`).run();
  mov('m1', 'cust-A', 'prod-1', 'DISPATCH', 'DISPATCH', 'CH-900', 10, 'GJ-05-XX-1234', 'Handle with care');
  mov('m2', 'cust-A', 'prod-2', 'DISPATCH', 'DISPATCH', 'CH-900', 20);
  mov('m3', 'cust-A', 'prod-1', 'RETURN', 'RETURN', 'RET-900', 5);
  mov('m4', 'cust-B', 'prod-1', 'DISPATCH', 'DISPATCH', 'CH-900', 7);
  legacy.close();
}

describe('v8 → v14 upgrade adoption', () => {
  it('applies v9–v14: headers collapse multi-row challans, ids backfilled, counters default, indexes live', () => {
    const dir = tempDir('acculedger-doc-upgrade-');
    return buildLegacyV8(dir).then(() => {
      delete process.env.VITE_DEV_SERVER_URL;
      initDatabase(dir);
      const db = getSqlite();
      expect(db.prepare('SELECT version FROM _migrations ORDER BY version').all()).toEqual([
        { version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 },
        { version: 6 }, { version: 7 }, { version: 8 }, { version: 9 }, { version: 10 }, { version: 11 }, { version: 12 }, { version: 13 }, { version: 14 },
      ]);

      const headers = db.prepare('SELECT customer_id, document_type, document_number FROM dispatch_documents ORDER BY customer_id, document_type').all();
      expect(headers).toEqual([
        { customer_id: 'cust-A', document_type: 'DISPATCH', document_number: 'CH-900' },
        { customer_id: 'cust-A', document_type: 'RETURN', document_number: 'RET-900' },
        { customer_id: 'cust-B', document_type: 'DISPATCH', document_number: 'CH-900' },
      ]);

      const nulls = db.prepare('SELECT COUNT(*) AS c FROM customer_inventory_movements WHERE document_id IS NULL').get() as { c: number };
      expect(nulls.c).toBe(0);
      const m1doc = db.prepare('SELECT document_id FROM customer_inventory_movements WHERE id=?').get('m1') as { document_id: string };
      const m2doc = db.prepare('SELECT document_id FROM customer_inventory_movements WHERE id=?').get('m2') as { document_id: string };
      expect(m1doc.document_id).toBe(m2doc.document_id);

      const biz = db.prepare('SELECT document_next_number FROM business_settings WHERE id=?').get('biz-1') as { document_next_number: number };
      expect(biz.document_next_number).toBe(1);

      const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='dispatch_documents_customer_type_number_unique'").get();
      expect(idx).toBeDefined();

      // v14: logistics columns gone, everything else byte-identical.
      const cols = (db.prepare("SELECT name FROM pragma_table_info('customer_inventory_movements')").all() as Array<{ name: string }>).map((r) => r.name);
      for (const dropped of ['vehicle_number', 'transporter_name', 'eway_bill_number', 'dispatch_purpose', 'notes']) {
        expect(cols).not.toContain(dropped);
      }
      for (const kept of ['id', 'customer_id', 'product_id', 'quantity', 'reference_id', 'document_id', 'created_by']) {
        expect(cols).toContain(kept);
      }
      const m1 = db.prepare('SELECT quantity, reference_id FROM customer_inventory_movements WHERE id=?').get('m1') as { quantity: number; reference_id: string };
      expect(m1).toEqual({ quantity: 10, reference_id: 'CH-900' });
      const count = db.prepare('SELECT COUNT(*) AS c FROM customer_inventory_movements').get() as { c: number };
      expect(count.c).toBe(4);
    });
  });

  it('UNIQUE(customer, type, number) rejects true duplicates, allows other scopes', () => {
    const dir = tempDir('acculedger-doc-unique-');
    delete process.env.VITE_DEV_SERVER_URL;
    initDatabase(dir);
    for (const [id, num] of [['cust-1', 'C-1'], ['cust-2', 'C-2']] as Array<[string, string]>) {
      Repositories.customers.upsert({
        id, customer_name: 'N', customer_number: num, pan: 'AAAAA0000A',
        gst_number: '24AAAAA0000A1Z5', mobile: '9000000000', address: 'A',
        city: 'Surat', state: 'Gujarat', country: 'India', postal_code: '395001',
        bank_details: null, credit_limit: null, is_active: true, created_at: T, updated_at: T,
      });
    }
    const header = (id: string, cust: string, type: string, num: string) => ({
      id, document_number: num, customer_id: cust, document_type: type,
      document_date: T, created_at: T,
    });
    Repositories.dispatchDocuments.upsert(header('d1', 'cust-1', 'DISPATCH', '7701'));
    expect(() =>
      Repositories.dispatchDocuments.upsert(header('d2', 'cust-1', 'DISPATCH', '7701'))
    ).toThrowError(/UNIQUE|unique|constraint/i);
    expect(() =>
      Repositories.dispatchDocuments.upsert(header('d3', 'cust-2', 'DISPATCH', '7701'))
    ).not.toThrow();
    expect(() =>
      Repositories.dispatchDocuments.upsert(header('d4', 'cust-1', 'RETURN', '7701'))
    ).not.toThrow();
  });
});
