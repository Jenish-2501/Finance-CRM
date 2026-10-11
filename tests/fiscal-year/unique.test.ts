import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDatabase, closeDatabase, getSqlite } from '../../electron/database/index.js';
import { Repositories } from '../../electron/database/repositories/repositories.js';

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

const now = () => new Date().toISOString();

function customerRow(id: string) {
  return {
    id, customer_name: 'U Co', customer_number: '9001', pan: 'ABCDE1234F',
    gst_number: '24ABCDE1234F1Z5', mobile: '9999999999', address: 'A',
    city: 'Surat', state: 'Gujarat', country: 'India', postal_code: '395001',
    bank_details: null, credit_limit: null, is_active: true, created_at: now(), updated_at: now(),
  };
}

function invoiceRow(id: string, fy: string, num: string) {
  return {
    id, invoice_number: num, customer_id: 'cust-u1', invoice_date: '2026-01-20T10:00:00Z', fy,
    billing_period_start: '2026-01-01', billing_period_end: '2026-01-31', status: 'DRAFT',
    subtotal: 100, discount: 0, taxable_amount: 100, cgst: 2.5, sgst: 2.5, igst: 0,
    other_charges: 0, grand_total: 105, customer_snapshot: '{}', business_snapshot: '{}',
    bank_snapshot: '{}', notes: '', created_at: now(), updated_at: now(),
  };
}

describe('UNIQUE(fy, invoice_number) identity backstop', () => {
  it('index exists after migration', () => {
    const dir = tempDir('acculedger-uniq-idx-');
    delete process.env.VITE_DEV_SERVER_URL;
    initDatabase(dir);
    const idx = getSqlite()
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='invoices_fy_number_unique'")
      .get();
    expect(idx).toBeDefined();
  });

  it('same number twice in one FY is rejected; across FYs it is legal', () => {
    const dir = tempDir('acculedger-uniq-enforce-');
    delete process.env.VITE_DEV_SERVER_URL;
    initDatabase(dir);
    Repositories.customers.upsert(customerRow('cust-u1'));
    Repositories.invoices.upsert(invoiceRow('inv-a', '2025-26', '9001'));

    expect(() => Repositories.invoices.upsert(invoiceRow('inv-b', '2025-26', '9001'))).toThrowError(
      /UNIQUE|unique|constraint/i
    );

    // Same plain number in the next FY is the designed reset — must succeed.
    expect(() => Repositories.invoices.upsert(invoiceRow('inv-c', '2026-27', '9001'))).not.toThrow();

    const rows = Repositories.invoices.findAll() as Array<Record<string, unknown>>;
    expect(rows.filter((r) => r.invoice_number === '9001').length).toBe(2);
    expect(new Set(rows.filter((r) => r.invoice_number === '9001').map((r) => r.fy as string))).toEqual(
      new Set(['2025-26', '2026-27'])
    );
  });
});
