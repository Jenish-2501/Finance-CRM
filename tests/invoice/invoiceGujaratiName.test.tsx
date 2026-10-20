// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { InvoicePrintView } from '../../src/components/invoice/InvoicePrintView';
import { buildInvoicePdf, gujaratiInlineImage } from '../../src/utils/pdfDocuments';
import { LanguageProvider } from '../../src/i18n';

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

  it('replaces the English name with the nickname in the printable preview', async () => {
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
    expect(screen.getByText(GU)).toBeTruthy();
    // replaced in place: the English name appears nowhere on the document
    expect(screen.queryByText('Shree Traders')).toBeNull();
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
