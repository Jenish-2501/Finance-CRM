import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Node has no window; the store guards all bridge access, so a bare stub suffices.
(globalThis as unknown as { window: unknown }).window = {};

let api: Awaited<ReturnType<typeof loadStore>>;
async function loadStore() {
  return (await import('../../src/store/accountingStore')).useAccountingStore;
}

const PROD = 'prod-1';
const UNIT = 'uom-pcs';
const CUST = 'cust-1';
const OTHER = 'cust-2';

function state() {
  return api.getState();
}

function clearOverride() {
  state().clearCustomerPrice(CUST, PROD, UNIT);
}

beforeAll(async () => {
  api = await loadStore();
  clearOverride();
});

afterAll(() => {
  clearOverride();
});

describe('customer pricing — resolution order and isolation', () => {
  it('falls back to the active base price with no override (base 120 from seed)', () => {
    const r = state().resolvePriceForCustomer(PROD, UNIT, CUST);
    expect(r).toEqual({ price: 120, basePrice: 120, isCustom: false });
    expect(state().getProductEffectivePrice(PROD, UNIT)).toBe(120);
  });

  it('applies the agreed price only to that customer', () => {
    expect(state().setCustomerPrice({ customerId: CUST, productId: PROD, unitId: UNIT, price: 150 })).toEqual({ success: true });
    expect(state().resolvePriceForCustomer(PROD, UNIT, CUST)).toEqual({ price: 150, basePrice: 120, isCustom: true });
    expect(state().resolvePriceForCustomer(PROD, UNIT, OTHER)).toEqual({ price: 120, basePrice: 120, isCustom: false });
  });

  it('updating the price appends history newest-first (old → new)', () => {
    expect(state().setCustomerPrice({ customerId: CUST, productId: PROD, unitId: UNIT, price: 165 }).success).toBe(true);
    expect(state().resolvePriceForCustomer(PROD, UNIT, CUST).price).toBe(165);
    const h = state().getCustomerPriceHistory(CUST);
    expect(h.length).toBe(2);
    expect([h[0].old_price, h[0].new_price]).toEqual([150, 165]);
    expect([h[1].old_price, h[1].new_price]).toEqual([null, 150]);
  });

  it('re-setting the same price is a no-op without history spam', () => {
    const before = state().getCustomerPriceHistory(CUST).length;
    expect(state().setCustomerPrice({ customerId: CUST, productId: PROD, unitId: UNIT, price: 165 })).toEqual({ success: true });
    expect(state().getCustomerPriceHistory(CUST).length).toBe(before);
  });

  it('clearing removes the override and logs removal, base applies again', () => {
    expect(state().clearCustomerPrice(CUST, PROD, UNIT)).toEqual({ success: true });
    expect(state().resolvePriceForCustomer(PROD, UNIT, CUST)).toEqual({ price: 120, basePrice: 120, isCustom: false });
    const h = state().getCustomerPriceHistory(CUST);
    expect([h[0].old_price, h[0].new_price]).toEqual([165, null]);
  });

  it('empty history for an untouched customer', () => {
    expect(state().getCustomerPriceHistory(OTHER)).toEqual([]);
  });
});

describe('customer pricing — validation', () => {
  it('rejects negative, NaN, unknown and inactive customers', () => {
    expect(state().setCustomerPrice({ customerId: CUST, productId: PROD, unitId: UNIT, price: -5 }).success).toBe(false);
    expect(state().setCustomerPrice({ customerId: CUST, productId: PROD, unitId: UNIT, price: NaN }).success).toBe(false);
    expect(state().setCustomerPrice({ customerId: 'cust-nope', productId: PROD, unitId: UNIT, price: 10 }).success).toBe(false);
    expect(state().setCustomerPrice({ customerId: CUST, productId: 'prod-nope', unitId: UNIT, price: 10 }).success).toBe(false);
    expect(state().resolvePriceForCustomer(PROD, UNIT, CUST).isCustom).toBe(false);

    const created = state().createCustomer({
      customer_name: 'Price Test Co',
      customer_number: 'CP-T1',
      pan: '', gst_number: '', email: '', mobile: '', address: '', city: '', state: '', country: '', postal_code: '', state_code: '24',
      is_active: true,
    });
    expect(created.success).toBe(true);
    const tmpId = created.customer?.id as string;
    expect(state().updateCustomer(tmpId, { is_active: false }).success).toBe(true);
    expect(state().setCustomerPrice({ customerId: tmpId, productId: PROD, unitId: UNIT, price: 10 }).success).toBe(false);
    expect(state().deleteCustomer(tmpId).success).toBe(true);
  });

  it('rounds fractional paise through roundCurrency', () => {
    expect(state().setCustomerPrice({ customerId: CUST, productId: PROD, unitId: UNIT, price: 99.999 }).success).toBe(true);
    expect(state().resolvePriceForCustomer(PROD, UNIT, CUST).price).toBe(100);
    clearOverride();
  });
});

describe('customer pricing — billing and invoice independence', () => {
  it('billable movements carry the agreed price with base alongside', () => {
    expect(state().setCustomerPrice({ customerId: CUST, productId: PROD, unitId: UNIT, price: 140 }).success).toBe(true);
    const row = state().getBillableMovementsForCustomer(CUST).find((m) => m.movementId === 'cim-1');
    expect(row).toBeDefined();
    expect(row?.applicablePrice).toBe(140);
    expect(row?.basePrice).toBe(120);
    expect(row?.isCustomPrice).toBe(true);
  });

  it('invoices snapshot the agreed-at-billing price and ignore later changes', () => {
    const rows = state().getBillableMovementsForCustomer(CUST);
    const target = rows.find((m) => m.movementId === 'cim-1');
    expect(target).toBeDefined();
    const created = state().createInvoice({
      customerId: CUST,
      billingPeriodStart: '2026-01-01',
      billingPeriodEnd: '2026-01-31',
      items: [
        {
          productId: target?.productId as string,
          unitId: target?.unitId as string,
          quantity: 10,
          unitPrice: target?.applicablePrice as number,
        },
      ],
      status: 'DRAFT',
    });
    expect(created.success).toBe(true);
    const item = Object.values(state().invoiceItems).find((i) => i.invoice_id === created.invoiceId);
    expect(item?.unit_price).toBe(140);

    // Owner reprices afterwards: the historical line must not move.
    expect(state().setCustomerPrice({ customerId: CUST, productId: PROD, unitId: UNIT, price: 200 }).success).toBe(true);
    const same = Object.values(state().invoiceItems).find((i) => i.invoice_id === created.invoiceId);
    expect(same?.unit_price).toBe(140);
    clearOverride();
  });
});
