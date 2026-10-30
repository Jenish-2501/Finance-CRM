import { describe, it, expect, beforeAll } from 'vitest';
import { roundCurrency } from '../../src/utils/calculations';
import {
  buildSupplySummary,
  previousOutstandingInvoices,
  previousOutstandingByMonth,
  sumOutstanding,
  type LedgerSummaryInput
} from '../../src/utils/ledgerSummary';

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
let movementId2 = '';

beforeAll(async () => {
  api = await loadStore();
  const st = state();

  // Realistic piece-mapped product: GRAM primary, 100 g per piece, billed in
  // KG (challan flow: PCS entered on the challan, KG on the invoice).
  const prod = st.createProduct(
    { product_name: 'Ledger Supply Rod', sku: 'LSR-1', description: '', primary_unit_id: 'uom-gram', is_active: true },
    0
  );
  prodId = prod.id;
  expect(st.savePieceWeightMapping(prodId, 100).success).toBe(true);

  // A plain PCS-primary product (no piece mapping): the PCS column must fill
  // directly from PCS-billed items.
  const prod2 = st.createProduct(
    { product_name: 'Ledger Plain Bracket', sku: 'LPB-1', description: '', primary_unit_id: 'uom-pcs', is_active: true },
    40
  );
  prod2Id = prod2.id;
  expect(st.getPieceWeightMapping(prod2Id)).toBeNull();

  const cust = st.createCustomer({
    customer_name: 'Ledger Print Co', customer_number: 'C-9004', pan: '', gst_number: '',
    mobile: '', address: '', city: 'Surat', state: 'Gujarat', country: 'India', postal_code: '',
    credit_limit: 0, is_active: true,
  });
  custId = cust.customer!.id;

  // Stock + dispatch in PCS (movements carry PCS quantities and allocations).
  st.createStockReceipt(
    { supplierName: 'Mill', referenceNumber: 'PO-LP', receiptDate: now(), notes: '' },
    [{ productId: prodId, unitId: 'uom-pcs', quantity: 100, unitCost: 60 }]
  );
  const disp = st.dispatchBatchInventoryToCustomer({
    customerId: custId, referenceId: 'CH-LP-1',
    items: [{ productId: prodId, unitId: 'uom-pcs', quantity: 30 }],
  });
  expect(disp.success).toBe(true);
  movementId = state().getBillableMovementsForCustomer(custId)[0].movementId;

  // Stock + dispatch + bill for the PCS-primary product (billed in PCS).
  st.createStockReceipt(
    { supplierName: 'Mill', referenceNumber: 'PO-LP2', receiptDate: now(), notes: '' },
    [{ productId: prod2Id, unitId: 'uom-pcs', quantity: 50, unitCost: 20 }]
  );
  const disp2 = st.dispatchBatchInventoryToCustomer({
    customerId: custId, referenceId: 'CH-LP-2',
    items: [{ productId: prod2Id, unitId: 'uom-pcs', quantity: 8 }],
  });
  expect(disp2.success).toBe(true);
  movementId2 = state().getBillableMovementsForCustomer(custId)
    .find((m: { productId: string }) => m.productId === prod2Id)!.movementId;
});

function input(): LedgerSummaryInput {
  const st = state();
  return {
    invoices: st.invoices,
    invoiceItems: st.invoiceItems,
    products: st.products,
    uoms: st.uoms,
    customerId: custId,
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    getPieceWeightMapping: st.getPieceWeightMapping,
    getInvoiceOutstanding: st.getInvoiceOutstanding
  };
}

function billInPeriod(
  qtyPcs: number,
  kgPrice: number,
  invoiceDate: string,
  status: 'DRAFT' | 'FINALIZED' = 'FINALIZED',
  productId = prodId,
  movementIdOverride = movementId
) {
  // Bills qtyPcs pieces in KG (grams-per-piece = 100): qty = pcs x 0.1 KG,
  // allocation stays in the movement's PCS quantities.
  const mapping = state().getPieceWeightMapping(productId);
  const kgUnitId = mapping!.kgUnitId;
  const kgQty = roundCurrency(qtyPcs / 10);
  return state().createInvoice({
    customerId: custId,
    billingPeriodStart: '2026-01-01',
    billingPeriodEnd: '2026-01-31',
    items: [{
      productId, unitId: kgUnitId, quantity: kgQty, unitPrice: kgPrice, discount: 0,
      movementAllocations: [{ movementId: movementIdOverride, allocatedQuantity: qtyPcs }],
    }],
    otherCharges: 0, notes: '', status, invoiceDate,
  });
}

function billPcsInPeriod(qtyPcs: number, unitPrice: number, invoiceDate: string, status: 'DRAFT' | 'FINALIZED' = 'FINALIZED') {
  // Plain PCS-primary product: billed in PCS directly.
  return state().createInvoice({
    customerId: custId,
    billingPeriodStart: '2026-01-01',
    billingPeriodEnd: '2026-01-31',
    items: [{
      productId: prod2Id, unitId: 'uom-pcs', quantity: qtyPcs, unitPrice, discount: 0,
      movementAllocations: [{ movementId: movementId2, allocatedQuantity: qtyPcs }],
    }],
    otherCharges: 0, notes: '', status, invoiceDate,
  });
}

// Product summary = per-product billed supply from INVOICE ITEMS dated inside
// the period (billed supply, invoiced rates); previous-outstanding box =
// FINALIZED invoices dated BEFORE the period that still carry a balance.
describe('customer ledger print summary', () => {
  let oldOutstandingAfterPayment = 0;

  it('aggregates in-period invoice items per product (qty, PCS, weight, effective rate)', () => {
    // 10 PCS (1 KG) @ 1000/KG + 5 PCS (0.5 KG) @ 1200/KG — same product, two
    // rates, two dispatches, billed 2026-01-10/11.
    const inv = billInPeriod(10, 1000, '2026-01-10T06:00:00.000Z');
    expect(inv.success).toBe(true);
    const inv2 = billInPeriod(5, 1200, '2026-01-11T06:00:00.000Z');
    expect(inv2.success).toBe(true);

    // OUTSIDE the period: an earlier invoice (2025-12-10) that must not feed
    // the supply table (only the previous-outstanding box).
    const old = billInPeriod(4, 1000, '2025-12-10T06:00:00.000Z');
    expect(old.success).toBe(true);

    // IN-period PCS-primary product: 8 PCS @ 40 billed 2026-01-12.
    const inv3 = billPcsInPeriod(8, 40, '2026-01-12T06:00:00.000Z');
    expect(inv3.success).toBe(true);

    const rows = buildSupplySummary(input());
    expect(rows.length).toBe(2);

    // Alphabetical: Bracket first. No piece mapping → PCS straight from the
    // PCS-billed items, no weight.
    const bracket = rows[0];
    expect(bracket.productName).toBe('Ledger Plain Bracket');
    expect(bracket.qty).toBe(8);
    expect(bracket.unitCode).toBe('PCS');
    expect(bracket.pcs).toBe(8);
    expect(bracket.weightKg).toBeNull();
    expect(bracket.value).toBe(320);
    expect(bracket.rate).toBe(40);

    const r = rows[1];
    expect(r.productName).toBe('Ledger Supply Rod');
    expect(r.qty).toBe(1.5); // billing quantity in KG
    expect(r.unitCode).toBe('KG');
    expect(r.pcs).toBe(15); // 1500 g / 100 g per piece
    expect(r.weightKg).toBe(1.5);
    expect(r.value).toBe(1600); // 1000 + 600 (taxable, pre-tax)
    expect(r.rate).toBe(roundCurrency(1600 / 1.5)); // effective, mixed rates
  });

  it('lists only pre-period FINALIZED invoices with a balance (partial payment case)', () => {
    // The 2025-12-10 invoice from the previous test: pay part of it now.
    const invoices = Object.values(state().invoices).filter(
      (i) => i.customer_id === custId && i.invoice_date.startsWith('2025-12-10')
    );
    const oldId = invoices[0].id;
    const { outstanding: before } = state().getInvoiceOutstanding(oldId);

    const pay = state().createInvoicePayment({
      invoiceId: oldId, amount: 100, paymentMethod: 'CASH',
      referenceNumber: 'UTR-LP-1', notes: '',
    });
    expect(pay.success).toBe(true);
    oldOutstandingAfterPayment = roundCurrency(before - 100);
    expect(oldOutstandingAfterPayment).toBeGreaterThan(0);

    // A second, fully settled pre-period invoice must NOT appear.
    const old2 = billInPeriod(2, 100, '2025-12-20T06:00:00.000Z');
    expect(old2.success).toBe(true);
    const old2Id = old2.invoiceId!;
    const { outstanding: full2 } = state().getInvoiceOutstanding(old2Id);
    const pay2 = state().createInvoicePayment({
      invoiceId: old2Id, amount: full2, paymentMethod: 'CASH',
      referenceNumber: 'UTR-LP-2', notes: '',
    });
    expect(pay2.success).toBe(true);

    const rows = previousOutstandingInvoices(input());
    expect(rows.length).toBe(1);
    expect(rows[0].invoiceId).toBe(oldId);
    expect(rows[0].invoiceNumber).toBe(invoices[0].invoice_number);
    expect(rows[0].outstanding).toBe(oldOutstandingAfterPayment);
    expect(sumOutstanding(rows)).toBe(oldOutstandingAfterPayment);
  });

  it('buckets pre-period dues by month and omits fully settled months', () => {
    // An extra pre-period month whose ONLY invoice gets fully paid: NOVEMBER
    // 2025 must not appear in the box at all.
    const nov = billInPeriod(1, 500, '2025-11-05T06:00:00.000Z');
    expect(nov.success).toBe(true);
    const novId = nov.invoiceId!;
    const { outstanding: novDue } = state().getInvoiceOutstanding(novId);
    const payNov = state().createInvoicePayment({
      invoiceId: novId, amount: novDue, paymentMethod: 'CASH',
      referenceNumber: 'UTR-LP-3', notes: '',
    });
    expect(payNov.success).toBe(true);

    // With a 2030 period every unpaid invoice is "previous": DECEMBER 2025
    // (the partial invoice; the fully paid 2025-12-20 one adds nothing) and
    // JANUARY 2026 (the three unpaid January invoices).
    const empty = { ...input(), startDate: '2030-01-01', endDate: '2030-01-31' };
    const months = previousOutstandingByMonth(empty);
    expect(months.map((m) => m.label)).toEqual(['DECEMBER 2025', 'JANUARY 2026']);

    const st = state();
    const dueOn = (date: string) => roundCurrency(
      Object.values(st.invoices)
        .filter((i) => i.customer_id === custId && i.invoice_date.startsWith(date))
        .reduce((s, i) => s + st.getInvoiceOutstanding(i.id).outstanding, 0)
    );

    expect(months[0].monthKey).toBe('2025-12');
    expect(months[0].total).toBe(oldOutstandingAfterPayment);

    expect(months[1].monthKey).toBe('2026-01');
    expect(months[1].total).toBe(roundCurrency(
      dueOn('2026-01-10') + dueOn('2026-01-11') + dueOn('2026-01-12')
    ));

    // Month totals sum back to the invoice-level total (paid months excluded).
    expect(sumOutstanding(previousOutstandingInvoices(empty))).toBe(
      roundCurrency(months[0].total + months[1].total)
    );
  });

  it('returns empty summary/outstanding for a period with nothing', () => {
    // A DRAFT January invoice is not billed supply — must not count either.
    const draft = billInPeriod(3, 1000, '2026-01-15T06:00:00.000Z', 'DRAFT');
    expect(draft.success).toBe(true);

    const empty = { ...input(), startDate: '2030-01-01', endDate: '2030-01-31' };
    expect(buildSupplySummary(empty)).toEqual([]);
    // For a 2030 period everything unpaid (the 2025 partial + all three
    // January invoices) is previous outstanding — but the FULLY PAID
    // 2025-12-20 invoice must still be absent.
    const prev = previousOutstandingInvoices(empty);
    expect(prev.length).toBe(4);
    const paidNumber = Object.values(state().invoices).find(
      (i) => i.customer_id === custId && i.invoice_date.startsWith('2025-12-20')
    )!.invoice_number;
    expect(prev.some((r) => r.invoiceNumber === paidNumber)).toBe(false);
    expect(sumOutstanding([])).toBe(0);

    // The draft exists in the January period but supply stays at two rows.
    expect(buildSupplySummary(input()).length).toBe(2);
  });
});
