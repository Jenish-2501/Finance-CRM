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
describe('challan quantities-only display', () => {
  it('shows dispatched quantity and UOM per line with no rates or values', async () => {
    await loadStore();
    render(<DeliveryChallanPrintView movementId="cim-1" />);
    const text = pdfText();
    // line qty + footer qty total (the grid carries a Qty and UOM column)
    expect(text).toContain('Total Dispatched Quantity:');
    expect(text).toContain('PCS');
    expect(text).not.toContain('Agreed Rate');
    expect(text).not.toContain('Total Value');
    expect(text).not.toContain('AGREED');
    expect(text).not.toContain('BASE');
    expect(text).not.toContain('Agreed Value in Words');
  });

  it('shows transfer weight in KG once the line hits 1000 gram, gram below', async () => {
    const store = (await loadStore()).getState();
    // prod-7 is KG-primary: map 1 PCS = 1000 g, stock it, dispatch 4 PCS.
    expect(store.savePieceWeightMapping('prod-7', 1000).success).toBe(true);
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
    // 4 PCS = 4000 g → "4 KG" on the line AND in the totals row (foot shows
    // the same Total Dispatched Quantity grid with the weight column).
    expect(text).toContain('4 KG');
    expect(text).toContain('Total Dispatched Quantity:');
    // gram-scale values never print as raw grams here (4000 g = 4 KG)
    expect(text).not.toContain('4000 gram');
  });

  it('shows business address and contact in the footer, not the header', async () => {
    await loadStore();
    render(<DeliveryChallanPrintView movementId="cim-1" />);
    const text = pdfText();
    // Header carries the business name only…
    expect(text).toContain('ABC Industries Pvt Ltd');
    // …address + contact live in the footer, each appearing exactly once.
    expect(text.split('Ring Road').length - 1).toBe(1);
    expect(text).toContain('401-405, Apex Business Hub, Ring Road, Surat');
    expect(text).toContain('Contact: +91 98250 12345');
  });

  it('prints a return slip for RETURN movements with a RETURN CHALLAN stamp', async () => {
    const store = (await loadStore()).getState();
    expect(store.savePieceWeightMapping('prod-7', 1000).success).toBe(true);
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
    // 1 PCS = 1000 g → KG display, and no dispatch-only rate UI anywhere.
    expect(text).toContain('1 KG');
    expect(text).not.toContain('Agreed Rate');
  });
});
