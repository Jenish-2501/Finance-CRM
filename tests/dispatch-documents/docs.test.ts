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

const PROD = 'prod-1';
const UNIT = 'uom-pcs';

function dispatch(customerId: string, referenceId = '', qty = 10) {
  return state().dispatchBatchInventoryToCustomer({
    customerId,
    referenceId,
    items: [{ productId: PROD, unitId: UNIT, quantity: qty }],
  });
}

beforeAll(async () => {
  api = await loadStore();
});

afterAll(() => {
  state().resetToSeedData();
});

describe('dispatch documents — shared plain sequence', () => {
  it('suggests 1 when no plain document numbers exist', () => {
    expect(state().suggestNextDocumentNumber('cust-1', 'DISPATCH')).toBe('1');
  });

  it('first dispatch takes 1 with header + movement linkage', () => {
    const r = dispatch('cust-1');
    expect(r.success).toBe(true);
    expect(r.referenceId).toBe('1');
    const headers = Object.values(state().dispatchDocuments);
    expect(headers.filter((h) => h.document_type === 'DISPATCH' && h.document_number === '1').length).toBe(1);
    const movs = Object.values(state().customerInventoryMovements).filter((m) => m.reference_id === '1');
    expect(movs.length).toBeGreaterThan(0);
    expect(new Set(movs.map((m) => m.document_id)).size).toBe(1);
    expect(state().businessSettings.document_next_number).toBe(2);
  });

  it('counter is global: next customer continues, returns share it', () => {
    const d2 = dispatch('cust-2');
    expect(d2.referenceId).toBe('2');
    const ret = state().createCustomerReturn({
      customerId: 'cust-1', productId: PROD, unitId: UNIT, quantity: 5,
      referenceId: '',
    });
    expect(ret.success).toBe(true);
    const retMov = Object.values(state().customerInventoryMovements).find(
      (m) => m.customer_id === 'cust-1' && m.movement_type === 'RETURN' && m.quantity === 5
    );
    expect(retMov?.reference_id).toBe('3');
    expect(retMov?.document_id).not.toBeNull();
  });

  it('multi-item dispatch creates one header for all rows', () => {
    const r = state().dispatchBatchInventoryToCustomer({
      customerId: 'cust-1', referenceId: '',
      items: [
        { productId: PROD, unitId: UNIT, quantity: 4 },
        { productId: PROD, unitId: UNIT, quantity: 6 },
      ],
    });
    expect(r.success).toBe(true);
    expect(r.referenceId).toBe('4');
    const movs = Object.values(state().customerInventoryMovements).filter((m) => m.reference_id === '4');
    expect(movs.length).toBe(2);
    expect(new Set(movs.map((m) => m.document_id)).size).toBe(1);
  });

  it('custom references respected, fast-forward, duplicates rejected per customer+type', () => {
    expect(dispatch('cust-1', '10').success).toBe(true);
    expect(state().businessSettings.document_next_number).toBe(11);
    expect(dispatch('cust-1', '10').success).toBe(false);
    expect(dispatch('cust-2', '10').success).toBe(true);
  });

  it('failed dispatches burn nothing', () => {
    const before = state().businessSettings.document_next_number;
    expect(dispatch('cust-1', '', 0).success).toBe(false);
    expect(state().businessSettings.document_next_number).toBe(before);
  });
});
