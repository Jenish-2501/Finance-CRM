// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { InvoicePrintView } from '../../src/components/invoice/InvoicePrintView';
import { buildInvoicePdf, gujaratiInlineImage } from '../../src/utils/pdfDocuments';
import { LanguageProvider } from '../../src/i18n';

// The preview IS the PDF now: capture the exact jsPDF document the view hands
// to PdfPreview (jsdom has no createObjectURL, so the real viewer would render
// nothing; the mock also keeps that safe).
const captured = vi.hoisted(() => ({ doc: null as unknown }));
vi.mock('../../src/components/common/PdfPreview', () => ({
  PdfPreview: ({ doc }: { doc: unknown }) => {
    captured.doc = doc;
    return null;
  },
}));

// And spy on the builder inputs to prove the frozen nickname reaches the PDF.
const pdfSpy = vi.hoisted(() => ({ lastInvoiceInput: null as Record<string, unknown> | null }));
vi.mock('../../src/utils/pdfDocuments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/pdfDocuments')>();
  return {
    ...actual,
    buildInvoicePdf: (input: Parameters<typeof actual.buildInvoicePdf>[0]) => {
      pdfSpy.lastInvoiceInput = input as unknown as Record<string, unknown>;
      return actual.buildInvoicePdf(input);
    },
  };
});

import type { useAccountingStore as useAccountingStoreType } from '../../src/store/accountingStore';

(globalThis as unknown as { window: unknown }).window ??= {};

let api: typeof useAccountingStoreType | undefined;
async function loadStore() {
  if (!api) api = (await import('../../src/store/accountingStore')).useAccountingStore;
  return api;
}

afterEach(() => cleanup());

const now = () => new Date().toISOString();
const GU = 'શ્રી ટ્રેડર્સ';

describe('Gujarati customer name on invoices', () => {
  it('freezes the nickname into the invoice snapshot at billing time', async () => {
    const store = (await loadStore()).getState();
    const prod = store.createProduct(
      { product_name: 'Bolt M8', sku: 'B-M8', description: '', primary_unit_id: 'uom-pcs', is_active: true }, 50
    );
    store.createProductPrice({
      product_id: prod.id, unit_id: 'uom-pcs', price: 50,
      effective_from: new Date('2026-01-01T00:00:00Z').toISOString(), effective_to: null,
    });
    const cust = store.createCustomer({
      customer_name: 'Shree Traders', customer_number: 'C-9101', gujarati_name: GU,
      pan: '', gst_number: '', mobile: '', address: '', city: 'Surat', state: 'Gujarat',
      country: 'India', postal_code: '', credit_limit: 0, is_active: true,
    });
    const custId = cust.customer!.id;
    store.createStockReceipt(
      { supplierName: 'M', referenceNumber: 'P', receiptDate: now(), notes: '' },
      [{ productId: prod.id, unitId: 'uom-pcs', quantity: 20, unitCost: 0 }]
    );
    store.dispatchBatchInventoryToCustomer({
      customerId: custId, referenceId: 'CH-GU-1',
      items: [{ productId: prod.id, unitId: 'uom-pcs', quantity: 4 }],
    });
    const s = (await loadStore()).getState();
    const mov = Object.values(s.customerInventoryMovements).find((m) => m.reference_id === 'CH-GU-1')!;
    const inv = s.createInvoice({
      customerId: custId, billingPeriodStart: '2026-01-01', billingPeriodEnd: '2026-01-31',
      items: [{
        productId: prod.id, unitId: 'uom-pcs', quantity: 4, unitPrice: 50, discount: 0,
        movementAllocations: [{ movementId: mov.id, allocatedQuantity: 4 }],
      }],
      otherCharges: 0, notes: '', status: 'DRAFT', invoiceDate: now(),
    });
    expect(inv.success).toBe(true);
    const s2 = (await loadStore()).getState();
    expect(s2.invoices[inv.invoiceId!].customer_snapshot.gujarati_name).toBe(GU);
  });

  it('hands the frozen nickname to the PDF document (the printable preview)', async () => {
    const s = (await loadStore()).getState();
    const invoice = Object.values(s.invoices).find(
      (i) => i.customer_snapshot.gujarati_name === GU
    )!;
    const items = Object.values(s.invoiceItems).filter((i) => i.invoice_id === invoice.id);
    const allocs = Object.values(s.invoiceAllocations).filter((a) => a.invoice_id === invoice.id);
    render(
      <LanguageProvider>
        <InvoicePrintView invoice={invoice} items={items} payments={[]} allocations={allocs} />
      </LanguageProvider>
    );
    // The view built a document for the preview…
    expect(captured.doc).not.toBeNull();
    // …and passed the frozen Gujarati nickname into the builder.
    expect(pdfSpy.lastInvoiceInput?.customerGujaratiName).toBe(GU);
    // jsdom has no canvas, so gujaratiInlineImage falls back to the English
    // name inside the PDF text (verified separately below); in the real
    // Electron shell the canvas path renders the Gujarati glyphs.
    const doc = captured.doc as { output: (type: 'arraybuffer') => ArrayBuffer };
    const text = Buffer.from(doc.output('arraybuffer')).toString('latin1');
    expect(text).toContain('Shree Traders');
  });

  it('gujaratiInlineImage falls back safely without a canvas', () => {
    // jsdom has no canvas 2d context: must return null, never throw —
    // builders then fall back to the English name.
    expect(gujaratiInlineImage(GU, 7)).toBeNull();
    expect(gujaratiInlineImage('', 7)).toBeNull();
    expect(gujaratiInlineImage(undefined, 7)).toBeNull();
  });

  it('buildInvoicePdf stays intact with and without a nickname', async () => {
    const s = (await loadStore()).getState();
    const invoice = Object.values(s.invoices).find(
      (i) => i.customer_snapshot.gujarati_name === GU
    )!;
    const items = Object.values(s.invoiceItems).filter((i) => i.invoice_id === invoice.id);
    const allocs = Object.values(s.invoiceAllocations).filter((a) => a.invoice_id === invoice.id);
    const withGu = buildInvoicePdf({ invoice, items, payments: [], allocations: allocs, customerGujaratiName: GU });
    expect(withGu.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    const withoutGu = buildInvoicePdf({ invoice, items, payments: [], allocations: allocs });
    expect(withoutGu.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});
