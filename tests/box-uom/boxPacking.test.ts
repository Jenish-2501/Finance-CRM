import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Node has no window; the store guards all bridge access, so a bare stub suffices.
(globalThis as unknown as { window: unknown }).window = {};

import { formatBoxPcs, convertQuantity } from '../../src/utils/calculations';

let api: Awaited<ReturnType<typeof loadStore>>;
async function loadStore() {
  return (await import('../../src/store/accountingStore')).useAccountingStore;
}

function state() {
  return api.getState();
}

let boxProdId = '';
let boxUnitId = '';
let pcsUnitId = '';

const BOX_PRICE = 100;
const PCS_PER_BOX = 10;

beforeAll(async () => {
  api = await loadStore();
  // Box-packed product: 1 BOX = 10 PCS, BOX price ₹100 (PCS derives to ₹10).
  const created = state().createProduct(
    {
      product_name: 'Box Test Widget',
      gujarati_name: null,
      sku: 'BOX-TEST-1',
      description: 'Box packing test product',
      primary_unit_id: 'uom-pcs',
      is_active: true
    },
    BOX_PRICE,
    PCS_PER_BOX
  );
  boxProdId = created.id;
  const mapping = state().getBoxMapping(boxProdId);
  expect(mapping).not.toBeNull();
  boxUnitId = mapping!.boxUnitId;
  pcsUnitId = mapping!.pcsUnitId;
});

afterAll(() => {
  if (boxProdId) {
    state().clearCustomerPrice('cust-1', boxProdId, boxUnitId);
  }
});

describe('formatBoxPcs — "N BOX + M PCS" display split', () => {
  it('splits whole boxes and loose pieces', () => {
    expect(formatBoxPcs(95, 10)).toBe('9 BOX + 5 PCS');
  });
  it('shows boxes only when nothing is loose', () => {
    expect(formatBoxPcs(100, 10)).toBe('10 BOX');
  });
  it('shows pieces only below one box', () => {
    expect(formatBoxPcs(5, 10)).toBe('5 PCS');
  });
  it('renders zero stock as 0 PCS', () => {
    expect(formatBoxPcs(0, 10)).toBe('0 PCS');
  });
  it('keeps the sign on negative stock', () => {
    expect(formatBoxPcs(-25, 10)).toBe('-2 BOX + 5 PCS');
  });
  it('returns nothing for invalid factors', () => {
    expect(formatBoxPcs(10, 1)).toBe('');
    expect(formatBoxPcs(NaN, 10)).toBe('');
  });
});

describe('box packing — pricing anchor and derivation', () => {
  it('exposes the mapping only for products created with PCS-per-BOX', () => {
    expect(state().getBoxMapping('prod-1')).toBeNull(); // seed product, no box
    expect(state().getBoxMapping(boxProdId)).toEqual({
      pcsPerBox: PCS_PER_BOX,
      pcsUnitId,
      boxUnitId
    });
  });

  it('anchors the BOX price and derives the PCS price (100 ÷ 10 = 10)', () => {
    expect(state().getProductEffectivePrice(boxProdId, boxUnitId)).toBe(BOX_PRICE);
    expect(state().getProductEffectivePrice(boxProdId, pcsUnitId)).toBe(10);
  });

  it('derives per-customer PCS prices from the agreed BOX price', () => {
    expect(
      state().setCustomerPrice({ customerId: 'cust-1', productId: boxProdId, unitId: boxUnitId, price: 120 })
    ).toEqual({ success: true });
    // Agreed ₹120/box → ₹12/pc, flagged custom from the BOX override.
    expect(state().resolvePriceForCustomer(boxProdId, pcsUnitId, 'cust-1')).toEqual({
      price: 12,
      basePrice: 10,
      isCustom: true
    });
    // Other customers stay on the base derivation.
    expect(state().resolvePriceForCustomer(boxProdId, pcsUnitId, 'cust-2')).toEqual({
      price: 10,
      basePrice: 10,
      isCustom: false
    });
    // BOX resolution itself stays the stored override.
    expect(state().resolvePriceForCustomer(boxProdId, boxUnitId, 'cust-1').price).toBe(120);
  });

  it('ignores box packing on non-PCS-primary products', () => {
    const created = state().createProduct(
      {
        product_name: 'KG Ignore Box',
        gujarati_name: null,
        sku: 'BOX-TEST-2',
        description: 'BOX factor must be dropped for KG primary',
        primary_unit_id: 'uom-kg',
        is_active: true
      },
      50,
      PCS_PER_BOX
    );
    expect(state().getBoxMapping(created.id)).toBeNull();
    // Price stays on the primary (KG) unit — no BOX anchor was created.
    expect(state().getProductEffectivePrice(created.id, created.primary_unit_id)).toBe(50);
  });
});

describe('box packing — stock conversion', () => {
  it('converts BOX entries to PCS primary through the product units', () => {
    const pus = Object.values(state().productUnits).filter((pu) => pu.product_id === boxProdId);
    expect(convertQuantity(5, boxUnitId, pcsUnitId, pus)).toBe(50);
    expect(convertQuantity(5, pcsUnitId, boxUnitId, pus)).toBe(0.5);
  });
});

describe('box packing — mixed-unit invoice grouping (5 BOX + 5 PCS = 550)', () => {
  it('stores one invoice line per product+unit with the derived PCS price', () => {
    // Dispatch stock to the customer so the flow mirrors real usage.
    state().createStockReceipt(
      {
        supplierName: 'Box Dealer',
        referenceNumber: 'BOX-RCV-2',
        receiptDate: new Date().toISOString(),
        notes: 'Mixed billing test stock'
      },
      [{ productId: boxProdId, unitId: boxUnitId, quantity: 6, unitCost: 60 }]
    );
    const dispatched = state().dispatchBatchInventoryToCustomer({
      customerId: 'cust-1',
      referenceId: '',
      items: [{ productId: boxProdId, unitId: boxUnitId, quantity: 6 }]
    });
    expect(dispatched.success).toBe(true);

    // The client scenario: 5 BOX (₹100 each) + 5 PCS (₹10 each) → ₹550.
    const result = state().createInvoice({
      customerId: 'cust-1',
      billingPeriodStart: '2026-10-01',
      billingPeriodEnd: '2026-10-31',
      items: [
        { productId: boxProdId, unitId: boxUnitId, quantity: 5, unitPrice: 100, discount: 0 },
        { productId: boxProdId, unitId: pcsUnitId, quantity: 5, unitPrice: 10, discount: 0 }
      ],
      status: 'DRAFT'
    });
    expect(result.success).toBe(true);
    const inv = state().invoices[result.invoiceId!];
    const items = Object.values(state().invoiceItems).filter((it) => it.invoice_id === inv.id);

    // Two separate lines, each snapping its own unit + price.
    const boxLine = items.find((it) => it.unit_id === boxUnitId);
    const pcsLine = items.find((it) => it.unit_id === pcsUnitId);
    expect(items).toHaveLength(2);
    expect(boxLine).toMatchObject({ quantity: 5, unit_price: 100 });
    expect(boxLine?.uom_snapshot).toBe('BOX');
    expect(pcsLine).toMatchObject({ quantity: 5, unit_price: 10 });
    expect(pcsLine?.uom_snapshot).toBe('PCS');
    expect(inv.subtotal).toBe(550);
    // Default 5% GST on ₹550 → ₹577.50.
    expect(inv.grand_total).toBe(577.5);
  });

  it('rejects billing a BOX line when no BOX price exists', () => {
    const created = state().createProduct(
      {
        product_name: 'Box No Price',
        gujarati_name: null,
        sku: 'BOX-NOPRICE',
        description: 'BOX price missing',
        primary_unit_id: 'uom-pcs',
        is_active: true
      },
      0,
      5
    );
    const map = state().getBoxMapping(created.id)!;
    // Company stock exists but no price was ever set (initialPrice 0).
    state().createStockReceipt(
      {
        supplierName: 'Box Dealer',
        referenceNumber: 'BOX-RCV-3',
        receiptDate: new Date().toISOString(),
        notes: 'No price test'
      },
      [{ productId: created.id, unitId: map.boxUnitId, quantity: 1, unitCost: 10 }]
    );
    state().dispatchBatchInventoryToCustomer({
      customerId: 'cust-1',
      referenceId: '',
      items: [{ productId: created.id, unitId: map.boxUnitId, quantity: 1 }]
    });
    const res = state().createInvoice({
      customerId: 'cust-1',
      billingPeriodStart: '2026-10-01',
      billingPeriodEnd: '2026-10-31',
      items: [{ productId: created.id, unitId: map.boxUnitId, quantity: 1, unitPrice: 0, discount: 0 }],
      status: 'DRAFT'
    });
    // The zero-price line must not silently bill ₹0 — the invoice is refused.
    expect(res.success).toBe(false);
  });
});

describe('box packing — multi-line challan validation', () => {
  it('aggregates same-product lines before checking company stock', () => {
    // Receive exactly 1 BOX (10 PCS).
    state().createStockReceipt(
      {
        supplierName: 'Box Dealer',
        referenceNumber: 'BOX-RCV-1',
        receiptDate: new Date().toISOString(),
        notes: 'Box packing multi-line validation test'
      },
      [{ productId: boxProdId, unitId: boxUnitId, quantity: 1, unitCost: 60 }]
    );
    expect(state().getCurrentCompanyStock(boxProdId)).toBe(10);

    // Two lines of the same product, each individually within stock
    // (9 ≤ 10), but jointly 18 > 10 — must be rejected.
    const over = state().dispatchBatchInventoryToCustomer({
      customerId: 'cust-1',
      referenceId: '',
      items: [
        { productId: boxProdId, unitId: pcsUnitId, quantity: 9 },
        { productId: boxProdId, unitId: pcsUnitId, quantity: 9 }
      ]
    });
    expect(over.success).toBe(false);
    expect(over.error).toContain('Insufficient company warehouse stock');

    // A single BOX line within the aggregated balance dispatches cleanly.
    const ok = state().dispatchBatchInventoryToCustomer({
      customerId: 'cust-1',
      referenceId: '',
      items: [{ productId: boxProdId, unitId: boxUnitId, quantity: 1 }]
    });
    expect(ok.success).toBe(true);
    expect(state().getCurrentCompanyStock(boxProdId)).toBe(0);
  });
});
