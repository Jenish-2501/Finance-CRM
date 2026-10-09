// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DeliveryChallanPrintView } from '../../src/components/challan/DeliveryChallanPrintView';
import { formatINR } from '../../src/utils/calculations';

(globalThis as unknown as { window: unknown }).window ??= {};

let api: Awaited<ReturnType<typeof loadStore>>;
async function loadStore() {
  return (await import('../../src/store/accountingStore')).useAccountingStore;
}

afterEach(() => cleanup());

// Seed facts: cim-1 = cust-1 / prod-1 / uom-pcs × 300, reference CH-501 (sole row).
// Agreed price 140 → row total 300 × 140 = 42000.
const AGREED = 140;

beforeAll(async () => {
  api = await loadStore();
  expect(api.getState().setCustomerPrice({ customerId: 'cust-1', productId: 'prod-1', unitId: 'uom-pcs', price: AGREED }).success).toBe(true);
});

afterAll(() => {
  api.getState().clearCustomerPrice('cust-1', 'prod-1', 'uom-pcs');
});

describe('challan agreed price display', () => {
  it('shows the agreed customer price and quantity per line, with AGREED badge', () => {
    render(<DeliveryChallanPrintView movementId="cim-1" />);
    expect(screen.getByText(formatINR(AGREED))).toBeDefined();
    expect(screen.getByText('AGREED')).toBeDefined();
    // single-row challan: line total and footer total are both 300 × 140
    expect(screen.getAllByText(formatINR(300 * AGREED))).toHaveLength(2);
  });

  it('falls back to BASE badge with no override', () => {
    api.getState().clearCustomerPrice('cust-1', 'prod-1', 'uom-pcs');
    render(<DeliveryChallanPrintView movementId="cim-1" />);
    expect(screen.getByText('BASE')).toBeDefined();
    expect(screen.getByText(formatINR(120))).toBeDefined(); // active base pp-1-active
    api.getState().setCustomerPrice({ customerId: 'cust-1', productId: 'prod-1', unitId: 'uom-pcs', price: AGREED });
  });
});
