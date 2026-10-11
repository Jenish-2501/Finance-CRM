import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { suggestCustomerNumber } from '../../src/utils/calculations';

// Node has no window; the store guards all bridge access, so a bare stub suffices.
(globalThis as unknown as { window: unknown }).window = {};

let api: Awaited<ReturnType<typeof loadStore>>;
async function loadStore() {
  return (await import('../../src/store/accountingStore')).useAccountingStore;
}

function state() {
  return api.getState();
}

describe('suggestCustomerNumber — pure rule', () => {
  const cases: Array<{ existing: string[]; floor?: number; attempts?: number; expected: string }> = [
    { existing: [], expected: '1' },
    { existing: ['1', '2'], expected: '3' },
    { existing: ['1', '2', '4'], expected: '5' },
    { existing: ['C-1001', 'C-1005'], expected: '1' },
    { existing: ['1'], floor: 10, expected: '10' },
    { existing: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], floor: 5, expected: '11' },
    { existing: ['1'], floor: 0, expected: '2' },
    { existing: ['1'], floor: -3, expected: '2' },
    { existing: ['1'], floor: NaN, expected: '2' },
    { existing: ['1'], floor: 1, attempts: 0, expected: '' },
    { existing: ['  2  '], floor: 1, expected: '3' },
  ];
  for (const c of cases) {
    it(`[${c.existing.join(',')}] floor ${c.floor ?? 1} → '${c.expected}'`, () => {
      expect(suggestCustomerNumber(c.existing, c.floor ?? 1, c.attempts ?? 500)).toBe(c.expected);
    });
  }
});

describe('customer auto-number — store integration (seed DB has C-1001…C-1005, no plain)', () => {
  beforeAll(async () => {
    api = await loadStore();
  });

  afterAll(() => {
    state().resetToSeedData();
  });

  it('suggests 1 when no plain numbers exist', () => {
    expect(state().suggestNextCustomerNumber()).toBe('1');
  });

  it('auto-assigns 1 then 2, advancing the counter', () => {
    const base = {
      customer_name: 'Auto One', pan: '', gst_number: '', mobile: '', address: '',
      city: '', state: '', country: '', postal_code: '', is_active: true,
    };
    const r1 = state().createCustomer({ ...base, customer_number: '' });
    expect(r1.success).toBe(true);
    expect(r1.customer?.customer_number).toBe('1');
    expect(state().businessSettings.customer_next_number).toBe(2);
    const r2 = state().createCustomer({ ...base, customer_name: 'Auto Two', customer_number: '' });
    expect(r2.customer?.customer_number).toBe('2');
  });

  it('custom numbers fast-forward the counter; duplicates rejected', () => {
    const base = {
      customer_name: 'Custom', pan: '', gst_number: '', mobile: '', address: '',
      city: '', state: '', country: '', postal_code: '', is_active: true,
    };
    expect(state().createCustomer({ ...base, customer_number: '10' }).success).toBe(true);
    expect(state().businessSettings.customer_next_number).toBe(11);
    expect(state().createCustomer({ ...base, customer_name: 'Dup', customer_number: '10' }).success).toBe(false);
    expect(state().createCustomer({ ...base, customer_name: 'Vip', customer_number: 'VIP' }).success).toBe(true);
    expect(state().businessSettings.customer_next_number).toBe(11);
    expect(state().suggestNextCustomerNumber()).toBe('11');
  });

  it('failed creates burn nothing', () => {
    const before = state().businessSettings.customer_next_number;
    expect(state().createCustomer({
      customer_name: 'Dup2', pan: '', gst_number: '', mobile: '', address: '',
      city: '', state: '', country: '', postal_code: '',
      customer_number: '10', is_active: true,
    }).success).toBe(false);
    expect(state().businessSettings.customer_next_number).toBe(before);
  });
});
