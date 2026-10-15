import { describe, it, expect, beforeAll } from 'vitest';

// Node has no window; the store guards all bridge access, so a bare stub suffices.
(globalThis as unknown as { window: unknown }).window ??= {};

let api: Awaited<ReturnType<typeof loadStore>>;
async function loadStore() {
  return (await import('../../src/store/accountingStore')).useAccountingStore;
}

function state() {
  return api.getState();
}

const now = () => new Date().toISOString();

let custId = '';
let prodId = '';
let movementId = '';
let invoiceId = '';

beforeAll(async () => {
  api = await loadStore();
  const st = state();
  const prod = st.createProduct(
    { product_name: 'Return Guard Widget', sku: 'RGW-1', description: '', primary_unit_id: 'uom-pcs', is_active: true },
    100
  );
  prodId = prod.id;
  const cust = st.createCustomer({
    customer_name: 'Return Guard Co', customer_number: 'C-9001', pan: '', gst_number: '',
    mobile: '', address: '', city: 'Surat', state: 'Gujarat', country: 'India', postal_code: '',
    credit_limit: 0, is_active: true,
  });
  custId = cust.customer!.id;
  st.createStockReceipt(
    { supplierName: 'Mill', referenceNumber: 'PO-RG', receiptDate: now(), notes: '' },
    [{ productId: prodId, unitId: 'uom-pcs', quantity: 100, unitCost: 80 }]
  );
  const disp = st.dispatchBatchInventoryToCustomer({
    customerId: custId, referenceId: 'CH-RG-1',
    items: [{ productId: prodId, unitId: 'uom-pcs', quantity: 10 }],
  });
  expect(disp.success).toBe(true);
  movementId = state().getBillableMovementsForCustomer(custId)[0].movementId;
});

function bill(qty: number, status: 'DRAFT' | 'FINALIZED' = 'FINALIZED') {
  return state().createInvoice({
    customerId: custId,
    billingPeriodStart: '2026-01-01',
    billingPeriodEnd: '2026-01-31',
    items: [{
      productId: prodId, unitId: 'uom-pcs', quantity: qty, unitPrice: 100, discount: 0,
      movementAllocations: [{ movementId, allocatedQuantity: qty }],
    }],
    otherCharges: 0, notes: '', status, invoiceDate: now(),
  });
}

describe('returns accepted only against unbilled stock', () => {
  it('allows returns before any billing', () => {
    const r = state().createCustomerReturn({
      customerId: custId, productId: prodId, unitId: 'uom-pcs', quantity: 3, referenceId: 'RET-RG-1',
    });
    expect(r.success).toBe(true);
    // held 7, billed 0 → unbilled 7
    expect(state().getCustomerProductInventory(custId, prodId)).toBe(7);
  });

  it('rejects returns beyond the unbilled balance', () => {
    const inv = bill(4);
    expect(inv.success).toBe(true);
    invoiceId = inv.invoiceId!;
    // held 7, billed 4 → unbilled 3; asking 5 must fail naming unbilled stock
    const r = state().createCustomerReturn({
      customerId: custId, productId: prodId, unitId: 'uom-pcs', quantity: 5, referenceId: 'RET-RG-2',
    });
    expect(r.success).toBe(false);
    expect(r.error || '').toMatch(/unbilled/i);
  });

  it('accepts an exact-fit return down to zero unbilled', () => {
    const r = state().createCustomerReturn({
      customerId: custId, productId: prodId, unitId: 'uom-pcs', quantity: 3, referenceId: 'RET-RG-3',
    });
    expect(r.success).toBe(true);
    expect(state().getCustomerProductInventory(custId, prodId)).toBe(4);
  });

  it('rejects any return once everything held is billed', () => {
    const r = state().createCustomerReturn({
      customerId: custId, productId: prodId, unitId: 'uom-pcs', quantity: 1, referenceId: 'RET-RG-4',
    });
    expect(r.success).toBe(false);
    expect(r.error || '').toMatch(/unbilled|billed/i);
  });

  it('still rejects over-holding returns with the holding message first', () => {
    const r = state().createCustomerReturn({
      customerId: custId, productId: prodId, unitId: 'uom-pcs', quantity: 99, referenceId: 'RET-RG-5',
    });
    expect(r.success).toBe(false);
    expect(r.error || '').toMatch(/insufficient/i);
  });

  it('cancelling the invoice frees the balance for return again', () => {
    expect(state().cancelInvoice(invoiceId, 'test reopen').success).toBe(true);
    // held 4, billed 0 → unbilled 4
    const r = state().createCustomerReturn({
      customerId: custId, productId: prodId, unitId: 'uom-pcs', quantity: 2, referenceId: 'RET-RG-6',
    });
    expect(r.success).toBe(true);
    expect(state().getCustomerProductInventory(custId, prodId)).toBe(2);
  });
});
