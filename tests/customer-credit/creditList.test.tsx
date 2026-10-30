// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CustomerCreditView } from '../../src/views/CustomerCreditView';
import { LanguageProvider } from '../../src/i18n';

import type { useAccountingStore as useAccountingStoreType } from '../../src/store/accountingStore';

(globalThis as unknown as { window: unknown }).window ??= {};

let api: typeof useAccountingStoreType | undefined;
async function loadStore() {
  if (!api) api = (await import('../../src/store/accountingStore')).useAccountingStore;
  return api;
}

afterEach(() => cleanup());

// Customer Credit lists per-customer return credit: earned = Σ rate × qty,
// applied = what invoices consumed, available = earned − applied. The seed's
// rate-less return (RET-019) must render as "—" and contribute no credit.
describe('customer credit list', () => {
  it('shows earned/applied/available with expandable per-slip detail', async () => {
    const store = (await loadStore()).getState();
    const disp = store.dispatchBatchInventoryToCustomer({
      customerId: 'cust-1',
      referenceId: 'CH-CC-1',
      items: [
        { productId: 'prod-1', unitId: 'uom-pcs', quantity: 10 },
        { productId: 'prod-2', unitId: 'uom-pcs', quantity: 20 }
      ]
    });
    expect(disp.success).toBe(true);
    const ret = store.returnBatchFromCustomer({
      customerId: 'cust-1',
      referenceId: 'RET-CC-1',
      items: [
        { productId: 'prod-1', unitId: 'uom-pcs', quantity: 2, rate: 120 },
        { productId: 'prod-2', unitId: 'uom-pcs', quantity: 3, rate: 50 }
      ]
    });
    expect(ret.success).toBe(true);

    render(
      <LanguageProvider>
        <CustomerCreditView />
      </LanguageProvider>
    );

    // Overview: earned 2×120 + 3×50 = 390 (earned + available columns),
    // applied 0. Only cust-1 has return history, so exactly one customer row.
    expect(screen.getByText('ABC Corporate Tower Ltd')).toBeDefined();
    expect(screen.getAllByText('₹390.00').length).toBe(2);

    // Expand → per-slip detail: the rate-less seed slip RET-019 (no credit)
    // plus the new rate'd slip; qty cells carry the unit code.
    fireEvent.click(screen.getByText('ABC Corporate Tower Ltd'));
    expect(screen.getByText('RET-019')).toBeDefined();
    // Same slip ref renders on each of the slip's two movement lines.
    expect(screen.getAllByText(String(ret.referenceId)).length).toBe(2);
    expect(screen.getByText('2 PCS')).toBeDefined();
    expect(screen.getByText('₹120.00')).toBeDefined();
    expect(screen.getByText('3 PCS')).toBeDefined();
    expect(screen.getByText('₹50.00')).toBeDefined();
    // Exactly one rate-less line → three "—" cells (rate, earned, remaining).
    expect(screen.getAllByText('—').length).toBe(3);
  });
});
