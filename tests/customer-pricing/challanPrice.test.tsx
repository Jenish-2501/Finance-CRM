// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { DeliveryChallanPrintView } from '../../src/components/challan/DeliveryChallanPrintView';

// The preview IS the PDF now: capture the exact jsPDF document the view hands
// to PdfPreview and assert on its text — the same bytes that Download saves
// and the printer receives. (jsdom has no createObjectURL, so the real viewer
// would render nothing; the mock also keeps that safe.)
const captured = vi.hoisted(() => ({ doc: null as unknown }));
vi.mock('../../src/components/common/PdfPreview', () => ({
  PdfPreview: ({ doc }: { doc: unknown }) => {
    captured.doc = doc;
    return null;
  },
}));

import type { useAccountingStore as useAccountingStoreType } from '../../src/store/accountingStore';

(globalThis as unknown as { window: unknown }).window ??= {};

let api: typeof useAccountingStoreType | undefined;
async function loadStore() {
  if (!api) api = (await import('../../src/store/accountingStore')).useAccountingStore;
  return api;
}

function pdfText(): string {
  const doc = captured.doc as { output: (type: 'arraybuffer') => ArrayBuffer } | null;
  if (!doc) throw new Error('preview never received a jsPDF document');
  return Buffer.from(doc.output('arraybuffer')).toString('latin1');
}

afterEach(() => cleanup());

// Challans are quantities-only (no rates or values — holding transfer, not a
// sale). Seed facts: cim-1 = cust-1 / prod-1 / uom-pcs × 300, reference CH-501.
// Gujarati labels (વિગત/જથ્થો/ગ્રામ) are canvas images, absent in jsdom —
// assertions anchor on the Latin dynamic values only.
describe('challan quantities-only display', () => {
  it('shows dispatched quantity per line with no rates or values', async () => {
    await loadStore();
    render(<DeliveryChallanPrintView movementId="cim-1" />);
    const text = pdfText();
    // Line quantity prints as a bare number for PCS rows (no unit, no rates).
    expect(text).toContain('300');
    expect(text).not.toContain('PCS'); // units only print for non-PCS lines
    expect(text).not.toContain('Agreed Rate');
    expect(text).not.toContain('Total Value');
    expect(text).not.toContain('AGREED');
    expect(text).not.toContain('BASE');
    expect(text).not.toContain('Agreed Value in Words');
    expect(text).not.toContain('Total Dispatched Quantity:'); // old grid label
  });

  it('prints weight-priced lines in KG in the weight column', async () => {
    const store = (await loadStore()).getState();
    // prod-7 is KG-primary: map 1 PCS = 1050 g, stock it, dispatch 4 PCS.
    expect(store.savePieceWeightMapping('prod-7', 1050).success).toBe(true);
    store.createStockReceipt(
      { supplierName: 'Mill', referenceNumber: 'PO-WT', receiptDate: new Date().toISOString(), notes: '' },
      [{ productId: 'prod-7', unitId: 'uom-kg', quantity: 50, unitCost: 90 }]
    );
    const disp = store.dispatchBatchInventoryToCustomer({
      customerId: 'cust-1',
      referenceId: 'CH-WT-1',
      items: [{ productId: 'prod-7', unitId: 'uom-pcs', quantity: 4 }]
    });
    expect(disp.success).toBe(true);

    render(<DeliveryChallanPrintView challanReference="CH-WT-1" />);
    const text = pdfText();
    // 4 PCS = 4200 g → "4.2" in the KG weight column and in the totals row.
    expect(text).toContain('4.2');
    // Raw grams and the old KG-suffixed count are gone.
    expect(text).not.toContain('4200');
    expect(text).not.toContain('4 KG');
  });

  it('shows the business name in the header, customer address in the info box', async () => {
    await loadStore();
    render(<DeliveryChallanPrintView movementId="cim-1" />);
    const text = pdfText();
    // English fallback while no Gujarati business name is set (jsdom has no
    // canvas, so a set Gujarati name would not render here either).
    expect(text).toContain('ABC INDUSTRIES PVT LTD');
    // Info box carries the customer's street address…
    expect(text).toContain('GIDC Electronic');
    // …while the business address and contact labels stay off the booklet.
    expect(text).not.toContain('Ring Road');
    expect(text).not.toContain('Contact:');
  });

  it('prints a return slip for RETURN movements with a RETURN CHALLAN title', async () => {
    const store = (await loadStore()).getState();
    expect(store.savePieceWeightMapping('prod-7', 1050).success).toBe(true);
    store.createStockReceipt(
      { supplierName: 'Mill', referenceNumber: 'PO-RT', receiptDate: new Date().toISOString(), notes: '' },
      [{ productId: 'prod-7', unitId: 'uom-kg', quantity: 50, unitCost: 90 }]
    );
    const disp = store.dispatchBatchInventoryToCustomer({
      customerId: 'cust-1',
      referenceId: 'CH-RT-1',
      items: [{ productId: 'prod-7', unitId: 'uom-pcs', quantity: 4 }]
    });
    expect(disp.success).toBe(true);
    const ret = store.createCustomerReturn({
      customerId: 'cust-1',
      productId: 'prod-7',
      unitId: 'uom-pcs',
      quantity: 1,
      referenceId: 'RET-1'
    });
    expect(ret.success).toBe(true);

    render(<DeliveryChallanPrintView challanReference="RET-1" direction="return" />);
    const text = pdfText();
    expect(text).toContain('RETURN CHALLAN');
    expect(text).not.toContain('DELIVERY CHALLAN');
    // 1 PCS = 1050 g → 1.05 KG in the weight column; no rate UI anywhere.
    expect(text).toContain('1.05');
    expect(text).not.toContain('1050');
    expect(text).not.toContain('Agreed Rate');
  });
});
