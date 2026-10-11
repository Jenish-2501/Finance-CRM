import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Node has no window; the store guards all bridge access, so a bare stub suffices.
(globalThis as unknown as { window: unknown }).window = {};

let api: Awaited<ReturnType<typeof loadStore>>;
async function loadStore() {
  return (await import('../../src/store/accountingStore')).useAccountingStore;
}

function state() {
  return api.getState();
}

const JAN = '2026-01-15T10:00:00Z'; // FY 2025-26
const JAN2 = '2026-01-16T10:00:00Z';
const MAY = '2026-05-10T10:00:00Z'; // FY 2026-27
const MAR31 = '2026-03-31T10:00:00Z'; // 15:30 IST Mar 31 → FY 2025-26
const APR01 = '2026-04-01T10:00:00Z'; // 15:30 IST Apr 1 → FY 2026-27

function makeInvoice(invoiceDate: string) {
  return state().createInvoice({
    customerId: 'cust-1',
    billingPeriodStart: '2026-01-01',
    billingPeriodEnd: '2026-01-31',
    items: [{ productId: 'prod-1', unitId: 'uom-pcs', quantity: 1, unitPrice: 100 }],
    status: 'DRAFT',
    invoiceDate,
  });
}

function invoiceCount() {
  return Object.keys(state().invoices).length;
}

beforeAll(async () => {
  api = await loadStore();
});

afterAll(() => {
  state().resetToSeedData();
});

describe('fiscal-year series — sequential numbering and automatic rollover', () => {
  it('first invoice of an FY starts at 1 with no prefix', () => {
    const r = makeInvoice(JAN);
    expect(r.success).toBe(true);
    const inv = state().invoices[r.invoiceId as string];
    expect(inv.fy).toBe('2025-26');
    expect(inv.invoice_number).toBe('1');
    expect(inv.invoice_date).toBe(JAN);
  });

  it('numbers are monotonic within the FY', () => {
    const r = makeInvoice(JAN2);
    expect(r.success).toBe(true);
    expect(state().invoices[r.invoiceId as string].invoice_number).toBe('2');
  });

  it('first invoice of the next FY rolls over to 1 automatically', () => {
    const r = makeInvoice(MAY);
    expect(r.success).toBe(true);
    const inv = state().invoices[r.invoiceId as string];
    expect(inv.fy).toBe('2026-27');
    expect(inv.invoice_number).toBe('1');
    const fys = new Set(Object.values(state().invoiceSeries).map((s) => s.fy));
    expect(fys.has('2025-26')).toBe(true);
    expect(fys.has('2026-27')).toBe(true);
  });

  it('future and invalid dates are rejected without burning numbers', () => {
    const before = invoiceCount();
    expect(makeInvoice('2999-01-01T00:00:00Z').success).toBe(false);
    expect(makeInvoice('not-a-date').success).toBe(false);
    expect(invoiceCount()).toBe(before);
  });

  it('50 rapid creates stay unique and gapless within the FY', () => {
    const got: string[] = [];
    for (let i = 0; i < 50; i++) {
      const r = makeInvoice(JAN2);
      expect(r.success).toBe(true);
      got.push(state().invoices[r.invoiceId as string].invoice_number);
    }
    const nums = got.map(Number).sort((a, b) => a - b);
    expect(new Set(got).size).toBe(50);
    expect(nums[0]).toBe(3);
    expect(nums[49] - nums[0]).toBe(49);
  });

  it('owner can advance the counter, but never rewind into issued numbers', () => {
    expect(state().setSeriesNextNumber('2025-26', 100).success).toBe(true);
    const r = makeInvoice(JAN2);
    expect(state().invoices[r.invoiceId as string].invoice_number).toBe('100');
    expect(state().setSeriesNextNumber('2025-26', 5).success).toBe(false);
    expect(state().setSeriesNextNumber('2025-26', 0).success).toBe(false);
    expect(state().setSeriesNextNumber('2025-26', 1.5).success).toBe(false);
  });

  it('a March bill and an April bill draw from their own FY series (backdating)', () => {
    const mar = makeInvoice(MAR31);
    const apr = makeInvoice(APR01);
    expect(state().invoices[mar.invoiceId as string].fy).toBe('2025-26');
    expect(state().invoices[apr.invoiceId as string].fy).toBe('2026-27');
  });

  it('startNewFySeries is idempotent', () => {
    const a = state().startNewFySeries();
    const b = state().startNewFySeries();
    expect(a.success && b.success).toBe(true);
    expect(a.fy).toBe(b.fy);
    const rows = Object.values(state().invoiceSeries).filter((s) => s.fy === a.fy);
    expect(rows.length).toBe(1);
  });

  it('issued numbers never move when counters change later', () => {
    const r = makeInvoice(JAN2);
    const num = state().invoices[r.invoiceId as string].invoice_number;
    expect(state().setSeriesNextNumber('2025-26', Number(num) + 500).success).toBe(true);
    expect(state().invoices[r.invoiceId as string].invoice_number).toBe(num);
  });
});
