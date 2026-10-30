import { describe, it, expect, beforeAll } from 'vitest';
import { roundCurrency } from '../../src/utils/calculations';

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
let returnMovementIds: string[] = [];

beforeAll(async () => {
  api = await loadStore();
  const st = state();
  const prod = st.createProduct(
    { product_name: 'Pay-Credit Widget', sku: 'PCW-1', description: '', primary_unit_id: 'uom-pcs', is_active: true },
    100
  );
  prodId = prod.id;
  const cust = st.createCustomer({
    customer_name: 'Pay-Credit Co', customer_number: 'C-9003', pan: '', gst_number: '',
    mobile: '', address: '', city: 'Surat', state: 'Gujarat', country: 'India', postal_code: '',
    credit_limit: 0, is_active: true,
  });
  custId = cust.customer!.id;
  st.createStockReceipt(
    { supplierName: 'Mill', referenceNumber: 'PO-PC', receiptDate: now(), notes: '' },
    [{ productId: prodId, unitId: 'uom-pcs', quantity: 200, unitCost: 80 }]
  );
  const disp = st.dispatchBatchInventoryToCustomer({
    customerId: custId, referenceId: 'CH-PC-1',
    items: [{ productId: prodId, unitId: 'uom-pcs', quantity: 20 }],
  });
  expect(disp.success).toBe(true);
  movementId = state().getBillableMovementsForCustomer(custId)[0].movementId;
  const ret = st.returnBatchFromCustomer({
    customerId: custId, referenceId: 'RET-PC-1',
    items: [{ productId: prodId, unitId: 'uom-pcs', quantity: 3, rate: 100 }],
  });
  expect(ret.success).toBe(true);
  returnMovementIds = ret.movementIds ?? [];
  expect(state().getCustomerReturnCredit(custId)).toBe(300);
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

function paymentsFor(invoiceId: string) {
  return Object.values(state().invoicePayments).filter((p) => p.invoice_id === invoiceId);
}

// Merged settlement: the payment modal records cash AND consumes return
// credit in ONE createInvoicePayment call — credit portion becomes its own
// OTHER / RETURN-CREDIT row (no cash moves), consumed oldest-returns-first.
describe('payment with return credit (single submission)', () => {
  it('refuses credit above the available balance', () => {
    const inv = bill(2, 'FINALIZED');
    const r = state().createInvoicePayment({
      invoiceId: inv.invoiceId!, amount: 0, paymentMethod: 'CASH',
      referenceNumber: '', notes: '', returnCredit: 301,
    });
    expect(r.success).toBe(false);
    expect(r.error || '').toMatch(/available/i);
  });

  it('refuses cash + credit above the outstanding', () => {
    const inv = bill(1, 'FINALIZED');
    const { outstanding } = state().getInvoiceOutstanding(inv.invoiceId!);
    const r = state().createInvoicePayment({
      invoiceId: inv.invoiceId!, amount: outstanding, paymentMethod: 'CASH',
      referenceNumber: '', notes: '', returnCredit: 1,
    });
    expect(r.success).toBe(false);
    expect(r.error || '').toMatch(/exceeds/i);
  });

  it('refuses an empty settlement (no cash, no credit)', () => {
    const inv = bill(1, 'FINALIZED');
    const r = state().createInvoicePayment({
      invoiceId: inv.invoiceId!, amount: 0, paymentMethod: 'CASH',
      referenceNumber: '', notes: '',
    });
    expect(r.success).toBe(false);
    expect(r.error || '').toMatch(/greater than zero/i);
  });

  it('splits a combined settlement: credit row + cash row, oldest-first consumption', () => {
    const inv = bill(6, 'FINALIZED');
    expect(inv.success).toBe(true);
    const invoiceId = inv.invoiceId!;
    const { outstanding } = state().getInvoiceOutstanding(invoiceId);
    const creditPart = 100;
    const cashPart = roundCurrency(outstanding - 150);

    const r = state().createInvoicePayment({
      invoiceId, amount: cashPart, paymentMethod: 'UPI',
      referenceNumber: 'UTR-PC-1', notes: 'part cash', returnCredit: creditPart,
    });
    expect(r.success).toBe(true);

    // Two rows: OTHER/RETURN-CREDIT for the credit, UPI for the cash.
    const rows = paymentsFor(invoiceId);
    expect(rows.length).toBe(2);
    const creditRow = rows.find((p) => p.reference_number === 'RETURN-CREDIT');
    const cashRow = rows.find((p) => p.reference_number === 'UTR-PC-1');
    expect(creditRow?.payment_method).toBe('OTHER');
    expect(creditRow?.amount).toBe(creditPart);
    expect(cashRow?.payment_method).toBe('UPI');
    expect(cashRow?.amount).toBe(cashPart);

    // Outstanding drops by cash + credit; credit balance 300 → 200.
    const { outstanding: after } = state().getInvoiceOutstanding(invoiceId);
    expect(after).toBe(roundCurrency(outstanding - cashPart - creditPart));
    expect(state().getCustomerReturnCredit(custId)).toBe(200);
    // The return movement recorded the consumption.
    const mov = state().customerInventoryMovements[returnMovementIds[0]];
    expect(mov.credit_applied_amount).toBe(creditPart);
  });

  it('lets credit settle the invoice alone (cash 0 allowed when credit > 0)', () => {
    const inv = bill(4, 'FINALIZED');
    const invoiceId = inv.invoiceId!;
    const before = state().getCustomerReturnCredit(custId); // 200
    const r = state().createInvoicePayment({
      invoiceId, amount: 0, paymentMethod: 'CASH',
      referenceNumber: '', notes: '', returnCredit: 150,
    });
    expect(r.success).toBe(true);
    const rows = paymentsFor(invoiceId);
    expect(rows.length).toBe(1);
    expect(rows[0].reference_number).toBe('RETURN-CREDIT');
    expect(state().getCustomerReturnCredit(custId)).toBe(before - 150);
  });
});
