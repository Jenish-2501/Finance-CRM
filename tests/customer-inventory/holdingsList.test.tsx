// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CustomerInventoryView } from '../../src/views/CustomerInventoryView';
import { LanguageProvider } from '../../src/i18n';

import type { useAccountingStore as useAccountingStoreType } from '../../src/store/accountingStore';

(globalThis as unknown as { window: unknown }).window ??= {};

let api: typeof useAccountingStoreType | undefined;
async function loadStore() {
  if (!api) api = (await import('../../src/store/accountingStore')).useAccountingStore;
  return api;
}

afterEach(() => cleanup());

// Holdings tab shows ONE interleaved list: dispatch challans + return slips,
// newest first — no product-grouped table anymore.
describe('holdings challan list', () => {
  it('lists dispatch and return slips together, newest first', async () => {
    const store = (await loadStore()).getState();
    expect(store.savePieceWeightMapping('prod-7', 1000).success).toBe(true);
    store.createStockReceipt(
      { supplierName: 'Mill', referenceNumber: 'PO-HL', receiptDate: new Date().toISOString(), notes: '' },
      [{ productId: 'prod-7', unitId: 'uom-kg', quantity: 50, unitCost: 90 }]
    );
    // Dispatch yesterday, return today → return card must come first.
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const disp = store.dispatchBatchInventoryToCustomer({
      customerId: 'cust-1',
      referenceId: 'CH-HL-1',
      movementDate: yesterday,
      items: [{ productId: 'prod-7', unitId: 'uom-pcs', quantity: 4 }]
    });
    expect(disp.success).toBe(true);
    const ret = store.createCustomerReturn({
      customerId: 'cust-1',
      productId: 'prod-7',
      unitId: 'uom-pcs',
      quantity: 1,
      referenceId: 'RET-HL-1'
    });
    expect(ret.success).toBe(true);

    const { container } = render(
      <LanguageProvider>
        <CustomerInventoryView />
      </LanguageProvider>
    );
    expect(screen.getByText('Delivery Challan #CH-HL-1')).toBeDefined();
    expect(screen.getByText('Return Slip #RET-HL-1')).toBeDefined();
    // Return (today) renders before dispatch (yesterday).
    const html = container.innerHTML;
    expect(html.indexOf('RET-HL-1')).toBeLessThan(html.indexOf('CH-HL-1'));
    // PCS-first quantities with weight beneath on both cards (dispatch line +
    // its unbilled remainder both read 4 PCS on the dispatch card).
    expect(screen.getAllByText('(= 4 KG)')).toHaveLength(2);
    expect(screen.getByText('(= 1 KG)')).toBeDefined();
  });
});
