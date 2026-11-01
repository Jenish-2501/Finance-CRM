import { describe, it, expect, beforeAll } from 'vitest';
import type jsPDF from 'jspdf';
import { buildInvoiceModeDoc, invoiceDocFilename } from '../../src/utils/invoiceDocs';
import { buildInvoiceLedgerModel } from '../../src/utils/invoiceLedger';
import type { useAccountingStore as useAccountingStoreType } from '../../src/store/accountingStore';

// Node has no window; the store guards all bridge access, so a bare stub suffices.
(globalThis as unknown as { window: unknown }).window ??= {};

let api: typeof useAccountingStoreType | undefined;
async function loadStore() {
  if (!api) api = (await import('../../src/store/accountingStore')).useAccountingStore;
  return api;
}

function state() {
  return api!.getState();
}

const now = () => new Date().toISOString();
const at = (day: string) => new Date(`${day}T06:00:00.000Z`).toISOString();
const tick = () => new Promise((r) => setTimeout(r, 3));

// jsPDF's WinAnsi text runs live in the PDF string literals; NUL bytes appear
// only when a non-WinAnsi char (e.g. "≈") forced a UTF-16-style run. Strip
// padding and unescape \( \) \\ to reconstruct readable text.
const pdfText = (doc: jsPDF) =>
  Buffer.from(doc.output('arraybuffer'))
    .toString('latin1')
    .replace(/\0/g, '')
    .replace(/\\([()\\])/g, '$1');

let custId = '';
let prodA = ''; // plain PCS (₹100)
let prodB = ''; // piece-mapped, billed in KG (₹200/KG)
let pcsB = '';
let kgB = '';
let invId = '';

beforeAll(async () => {
  api = await loadStore();
  const st = state();

  const a = st.createProduct(
    { product_name: 'Ledger PCS Widget', gujarati_name: null, sku: 'LED-A', description: '', primary_unit_id: 'uom-pcs', is_active: true },
    100
  );
  prodA = a.id;
  await tick();

  const b = st.createProduct(
    { product_name: 'Ledger KG Widget', gujarati_name: null, sku: 'LED-B', description: '', primary_unit_id: 'uom-gram', is_active: true },
    0
  );
  prodB = b.id;
  await tick();
  expect(st.savePieceWeightMapping(prodB, 500).success).toBe(true);
  await tick();
  const m = st.getPieceWeightMapping(prodB)!;
  pcsB = m.pcsUnitId;
  kgB = m.kgUnitId;
  st.createProductPrice({
    product_id: prodB, unit_id: kgB, price: 200,
    effective_from: new Date('2026-01-01T00:00:00Z').toISOString(), effective_to: null
  });
  await tick();

  custId = st.createCustomer({
    customer_name: 'Ledger Co', customer_number: 'C-L1', pan: '', gst_number: '24ABCDEF1234A1Z5', mobile: '9876500000',
    address: '', city: 'Surat', state: 'Gujarat', country: 'India', postal_code: '',
    credit_limit: 0, is_active: true
  }).customer!.id;
  await tick();

  st.createStockReceipt(
    { supplierName: 'S', referenceNumber: 'PL1', receiptDate: now(), notes: '' },
    [{ productId: prodA, unitId: 'uom-pcs', quantity: 5000, unitCost: 10 }]
  );
  st.createStockReceipt(
    { supplierName: 'S', referenceNumber: 'PL2', receiptDate: now(), notes: '' },
    [{ productId: prodB, unitId: pcsB, quantity: 5000, unitCost: 50 }]
  );

  // One period, two products, deliveries and returns — the full ledger story:
  // A: 500 out / 200 back → 300 PCS × 100 = 30,000
  // B: 100 PCS (= 50 KG) out / 40 PCS (= 20 KG) back → 30 KG × 200 = 6,000
  expect(
    st.dispatchBatchInventoryToCustomer({
      customerId: custId, referenceId: 'CH-L-A1', movementDate: at('2026-03-05'),
      items: [
        { productId: prodA, unitId: 'uom-pcs', quantity: 500 },
        { productId: prodB, unitId: pcsB, quantity: 100 }
      ]
    }).success
  ).toBe(true);
  await tick();
  expect(
    st.returnBatchFromCustomer({
      customerId: custId, referenceId: 'RS-L-A1', movementDate: at('2026-03-10'),
      items: [
        { productId: prodA, unitId: 'uom-pcs', quantity: 200 },
        { productId: prodB, unitId: pcsB, quantity: 40 }
      ]
    }).success
  ).toBe(true);
  await tick();

  const res = st.createInvoiceFromPeriod({
    customerId: custId, periodStart: '2026-03-01', periodEnd: '2026-03-31', status: 'DRAFT'
  });
  expect(res.success).toBe(true);
  invId = res.invoiceId!;
});

describe('invoice challan ledger documents', () => {
  const pieces = () => {
    const s = state();
    const invoice = s.invoices[invId];
    return {
      invoice,
      items: Object.values(s.invoiceItems).filter((i) => i.invoice_id === invId),
      payments: Object.values(s.invoicePayments).filter((p) => p.invoice_id === invId),
      allocations: Object.values(s.invoiceAllocations).filter((a) => a.invoice_id === invId),
      s
    };
  };

  it('the invoice document stays a pure TAX INVOICE', () => {
    const { invoice, items, payments, allocations, s } = pieces();
    const text = pdfText(buildInvoiceModeDoc(invoice, items, payments, allocations, 'invoice', s));
    expect(text).toContain('TAX INVOICE');
    expect(text).not.toContain('CHALLAN LEDGER');
    expect(invoiceDocFilename(invoice, 'invoice')).toBe(`Invoice-${invoice.invoice_number}.pdf`);
  });

  it('the ledger document lists both challans, both types, and the net', () => {
    const { invoice, items, payments, allocations, s } = pieces();
    const text = pdfText(buildInvoiceModeDoc(invoice, items, payments, allocations, 'ledger', s));
    expect(text).toContain('CHALLAN LEDGER');
    expect(text).toContain('DELIVERY');
    expect(text).toContain('RETURN');
    expect(text).toContain('CH-L-A1');
    expect(text).toContain('RS-L-A1');
    expect(text).toContain('NET QUANTITY BILLED');
    expect(text).toContain(invoice.invoice_number);
    // Quantities print in the movement's own units, plus KG weights for the
    // piece-mapped PCS rows (100 PCS × 500 g = 50 KG). Return rows lead with
    // a minus — the paper itself shows what came back.
    expect(text).toContain('500');
    expect(text).toContain('-200');
    expect(text).toContain('-40');
    expect(text).toContain('50 KG');
    expect(text).toContain('-20 KG');
    // Merged cells: each challan spans two product rows, so its reference
    // prints exactly ONCE (a repeated ref would mean the rowSpan collapsed).
    expect(text.split('CH-L-A1').length - 1).toBe(1);
    expect(text.split('RS-L-A1').length - 1).toBe(1);
    // ASCII-only theme: the ≈ glyph never enters the PDF (WinAnsi garbage).
    expect(text).not.toContain('≈');
    expect(invoiceDocFilename(invoice, 'ledger')).toBe(`ChallanLedger-${invoice.invoice_number}.pdf`);
  });

  it('the combined document merges ledger pages first, then the invoice', () => {
    const { invoice, items, payments, allocations, s } = pieces();
    const doc = buildInvoiceModeDoc(invoice, items, payments, allocations, 'both', s);
    expect(doc.getNumberOfPages()).toBe(2);
    const text = pdfText(doc);
    expect(text).toContain('CHALLAN LEDGER');
    expect(text).toContain('TAX INVOICE');
    expect(invoiceDocFilename(invoice, 'both')).toBe(`Invoice-Ledger-${invoice.invoice_number}.pdf`);
  });

  it('the ledger model reproduces the net from the allocations alone', () => {
    const { invoice, items, allocations, s } = pieces();
    const model = buildInvoiceLedgerModel({
      invoice,
      items,
      allocations,
      movements: s.customerInventoryMovements,
      products: s.products,
      uoms: s.uoms,
      productUnits: s.productUnits,
      getPieceWeightMapping: s.getPieceWeightMapping
    });
    expect(model.customerName).toBe('Ledger Co');
    expect(model.rows).toHaveLength(4); // 2 products × (delivery + return)
    expect(model.rows.every((r) => !r.broughtForward)).toBe(true);
    // Rows sort by date: both deliveries first, then both returns.
    expect(model.rows.map((r) => r.kind)).toEqual(['DELIVERY', 'DELIVERY', 'RETURN', 'RETURN']);

    const bySku = new Map(model.summaries.map((sm) => [sm.sku, sm]));
    const a = bySku.get('LED-A')!;
    expect(a.deliveredQty).toBe(500);
    expect(a.returnedQty).toBe(200);
    expect(a.netQty).toBe(300);
    expect(a.taxableValue).toBe(30000);
    expect(a.weightKg).toBeNull(); // PCS product — no weight

    const b = bySku.get('LED-B')!;
    expect(b.deliveredQty).toBe(50); // 100 PCS × 500 g → KG
    expect(b.returnedQty).toBe(20);
    expect(b.netQty).toBe(30);
    expect(b.taxableValue).toBe(6000);
    expect(b.weightKg).toBe(30);

    expect(model.totalTaxable).toBe(36000);
  });
});
