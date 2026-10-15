// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DeliveryChallanPrintView } from '../../src/components/challan/DeliveryChallanPrintView';

import type { useAccountingStore as useAccountingStoreType } from '../../src/store/accountingStore';

(globalThis as unknown as { window: unknown }).window ??= {};

let api: typeof useAccountingStoreType | undefined;
async function loadStore() {
  if (!api) api = (await import('../../src/store/accountingStore')).useAccountingStore;
  return api;
}

afterEach(() => cleanup());

// Challans are quantities-only (no rates or values — holding transfer, not a
// sale). Seed facts: cim-1 = cust-1 / prod-1 / uom-pcs × 300, reference CH-501.
describe('challan quantities-only display', () => {
  it('shows dispatched quantity and UOM per line with no rates or values', async () => {
    await loadStore();
    render(<DeliveryChallanPrintView movementId="cim-1" />);
    // line qty + footer qty total
    expect(screen.getAllByText('300')).toHaveLength(2);
    expect(screen.getByText('Total Dispatched Quantity:')).toBeDefined();
    expect(screen.queryByText('Agreed Rate')).toBeNull();
    expect(screen.queryByText(/Total Value/)).toBeNull();
    expect(screen.queryByText('AGREED')).toBeNull();
    expect(screen.queryByText('BASE')).toBeNull();
    expect(screen.queryByText(/Agreed Value in Words/)).toBeNull();
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
    // 4 PCS = 4000 g → KG display on the line…
    expect(screen.getByText('(= 4 KG)')).toBeDefined();
    // …and a Total Transfer Weight footer row (qty total lives in tfoot too).
    expect(screen.getByText('Total Transfer Weight:')).toBeDefined();
    const tfootFours = screen.getAllByText((content, element) => {
      if (content !== '4' || !element) return false;
      return element.closest('tfoot') !== null;
    });
    expect(tfootFours).toHaveLength(2);
  });

  it('shows business address and contact in the footer, not the header', async () => {
    await loadStore();
    const { container } = render(<DeliveryChallanPrintView movementId="cim-1" />);
    // Header carries the business name only…
    const header = container.querySelector('.border-b-2');
    expect(header?.textContent).toContain('ABC Industries Pvt Ltd');
    expect(header?.textContent).not.toContain('Ring Road');
    expect(header?.textContent).not.toContain('98250 12345');
    // …address + contact live in the footnote.
    expect(screen.getByText(/401-405, Apex Business Hub/)).toBeDefined();
    expect(screen.getByText(/Contact: \+91 98250 12345/)).toBeDefined();
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
    expect(screen.getByText('RETURN CHALLAN')).toBeDefined();
    // 1 PCS = 1000 g → KG display, and no dispatch-only rate UI anywhere.
    expect(screen.getByText('(= 1 KG)')).toBeDefined();
    expect(screen.queryByText('Agreed Rate')).toBeNull();
  });
});
