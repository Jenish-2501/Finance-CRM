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
let prod2Id = '';
let movementId = '';
let invoiceId = '';
let applyInvoiceId = '';

beforeAll(async () => {
  api = await loadStore();
  const st = state();
  const prod = st.createProduct(
    { product_name: 'Return Credit Widget', sku: 'RCW-1', description: '', primary_unit_id: 'uom-pcs', is_active: true },
    100
  );
  prodId = prod.id;
  const prod2 = st.createProduct(
    { product_name: 'Return Credit Widget II', sku: 'RCW-2', description: '', primary_unit_id: 'uom-pcs', is_active: true },
    100
  );
  prod2Id = prod2.id;
  const cust = st.createCustomer({
    customer_name: 'Return Credit Co', customer_number: 'C-9002', pan: '', gst_number: '',
    mobile: '', address: '', city: 'Surat', state: 'Gujarat', country: 'India', postal_code: '',
    credit_limit: 0, is_active: true,
  });
  custId = cust.customer!.id;
  st.createStockReceipt(
    { supplierName: 'Mill', referenceNumber: 'PO-RC', receiptDate: now(), notes: '' },
    [
      { productId: prodId, unitId: 'uom-pcs', quantity: 100, unitCost: 80 },
      { productId: prod2Id, unitId: 'uom-pcs', quantity: 100, unitCost: 60 },
    ]
  );
  const disp = st.dispatchBatchInventoryToCustomer({
    customerId: custId, referenceId: 'CH-RC-1',
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

describe('returns allowed billed or unbilled — cap is holdings only', () => {
  it('allows returns before any billing', () => {
    const r = state().returnBatchFromCustomer({
      customerId: custId, referenceId: 'RET-RC-1',
      items: [{ productId: prodId, unitId: 'uom-pcs', quantity: 3, rate: 100 }],
    });
    expect(r.success).toBe(true);
    expect(state().getCustomerProductInventory(custId, prodId)).toBe(7);
  });

  it('records the taken-back rate on the RETURN movement', () => {
    const movs = Object.values(state().customerInventoryMovements)
      .filter((m) => m.customer_id === custId && m.movement_type === 'RETURN');
    expect(movs).toHaveLength(1);
    expect(movs[0].rate).toBe(100);
    expect(movs[0].credit_applied_amount).toBe(0);
  });

  it('ALLOWS returning BILLED stock (old unbilled-only rule removed)', () => {
    const inv = bill(4);
    expect(inv.success).toBe(true);
    invoiceId = inv.invoiceId!;
    // held 7 with 4 of them billed — billed stock is returnable now.
    const r = state().returnBatchFromCustomer({
      customerId: custId, referenceId: 'RET-RC-2',
      items: [{ productId: prodId, unitId: 'uom-pcs', quantity: 2, rate: 100 }],
    });
    expect(r.success).toBe(true);
    expect(state().getCustomerProductInventory(custId, prodId)).toBe(5);
  });

  it('rejects returns beyond the currently held quantity', () => {
    const r = state().returnBatchFromCustomer({
      customerId: custId, referenceId: 'RET-RC-3',
      items: [{ productId: prodId, unitId: 'uom-pcs', quantity: 99, rate: 100 }],
    });
    expect(r.success).toBe(false);
    expect(r.error || '').toMatch(/more than delivered/i);
  });

  it('aggregates duplicate product lines against the holdings cap', () => {
    // held 5: two lines of 3 jointly overdraw (6 > 5) — must fail even
    // though each line alone would fit.
    const r = state().returnBatchFromCustomer({
      customerId: custId, referenceId: 'RET-RC-4',
      items: [
        { productId: prodId, unitId: 'uom-pcs', quantity: 3, rate: 100 },
        { productId: prodId, unitId: 'uom-pcs', quantity: 3, rate: 100 },
      ],
    });
    expect(r.success).toBe(false);
    expect(r.error || '').toMatch(/more than delivered/i);
  });

  it('credits return value per line: rate × quantity', () => {
    // 300 (line 1) + 200 (line 2) = 500 so far.
    expect(state().getCustomerReturnCredit(custId)).toBe(500);
  });

  it('supports multi-item batches across products with per-line rates', () => {
    const disp = state().dispatchBatchInventoryToCustomer({
      customerId: custId, referenceId: 'CH-RC-2',
      items: [{ productId: prod2Id, unitId: 'uom-pcs', quantity: 6 }],
    });
    expect(disp.success).toBe(true);
    const r = state().returnBatchFromCustomer({
      customerId: custId, referenceId: 'RET-RC-5',
      items: [
        { productId: prodId, unitId: 'uom-pcs', quantity: 1, rate: 100 },
        { productId: prod2Id, unitId: 'uom-pcs', quantity: 2, rate: 40 },
      ],
    });
    expect(r.success).toBe(true);
    // +100 +80 → 680
    expect(state().getCustomerReturnCredit(custId)).toBe(680);
  });

  it('returns with no rate (or 0) record no credit', () => {
    const before = state().getCustomerReturnCredit(custId);
    const r = state().returnBatchFromCustomer({
      customerId: custId, referenceId: 'RET-RC-6',
      items: [{ productId: prodId, unitId: 'uom-pcs', quantity: 1 }],
    });
    expect(r.success).toBe(true);
    expect(state().getCustomerReturnCredit(custId)).toBe(before);
  });
});

describe('manual return-credit application to invoices', () => {
  it('refuses to apply more than the available credit', () => {
    const inv = bill(2, 'FINALIZED');
    const r = state().applyReturnCreditToInvoice({ invoiceId: inv.invoiceId!, amount: 999999 });
    expect(r.success).toBe(false);
    expect(r.error || '').toMatch(/available/i);
  });

  it('consumes credit oldest-returns-first with partial line consumption', () => {
    // Oldest RETURN lines first: RET-RC-1 (300), RET-RC-2 (200), RET-RC-5
    // (180) — all unspent. Apply 480 → first line fully consumed (300),
    // second partially (180 of 200). Billed on a fresh 6-PCS invoice so the
    // payment never exceeds the invoice's outstanding.
    const avail = state().getCustomerReturnCredit(custId);
    expect(avail).toBe(680);
    const inv = bill(6, 'FINALIZED');
    expect(inv.success).toBe(true);
    applyInvoiceId = inv.invoiceId!;
    const r = state().applyReturnCreditToInvoice({ invoiceId: applyInvoiceId, amount: 480 });
    expect(r.success).toBe(true);
    expect(state().getCustomerReturnCredit(custId)).toBe(200);

    const rets = Object.values(state().customerInventoryMovements)
      .filter((m) => m.customer_id === custId && m.movement_type === 'RETURN' && (m.credit_applied_amount ?? 0) > 0);
    const appliedByRef = Object.fromEntries(rets.map((m) => [m.reference_id, m.credit_applied_amount]));
    expect(appliedByRef['RET-RC-1']).toBe(300);
    expect(appliedByRef['RET-RC-2']).toBe(180);
  });

  it('records an InvoicePayment with the RETURN-CREDIT reference', () => {
    const pays = Object.values(state().invoicePayments).filter((p) => p.invoice_id === applyInvoiceId);
    expect(pays.length).toBeGreaterThan(0);
    const last = pays[pays.length - 1];
    expect(last.amount).toBe(480);
    expect(last.payment_method).toBe('OTHER');
    expect(last.reference_number).toBe('RETURN-CREDIT');
  });

  it('legacy createCustomerReturn still works and defaults the rate to the agreed price', () => {
    const st = state();
    st.setCustomerPrice({ customerId: custId, productId: prod2Id, unitId: 'uom-pcs', price: 55 });
    const r = st.createCustomerReturn({
      customerId: custId, productId: prod2Id, unitId: 'uom-pcs', quantity: 1, referenceId: 'RET-RC-7',
    });
    expect(r.success).toBe(true);
    const movs = Object.values(state().customerInventoryMovements)
      .filter((m) => m.customer_id === custId && m.movement_type === 'RETURN' && m.reference_id === 'RET-RC-7');
    expect(movs).toHaveLength(1);
    expect(movs[0].rate).toBe(55);
  });
});

describe('delivered-rate variants for the return-rate dropdown', () => {
  it('collects distinct invoice rates, the override, and the list price', () => {
    const rates = state().getCustomerDeliveredRates(custId, prodId);
    // Invoices billed at 100; override none for prod-1; no list price added
    // by seed for this synthetic product.
    expect(rates).toContain(100);
    expect(rates).toEqual([...new Set(rates)].sort((a, b) => a - b));
  });
});
