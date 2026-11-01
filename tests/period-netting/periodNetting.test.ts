import { describe, it, expect, beforeAll } from 'vitest';
import { previewPeriodNetting } from '../../src/utils/periodNetting';
import type { CustomerInventoryMovement } from '../../src/types/database';
import type { useAccountingStore as useAccountingStoreType } from '../../src/store/accountingStore';

// Node has no window; the store guards all bridge access, so a bare stub suffices.
(globalThis as unknown as { window: unknown }).window ??= {};

let api: typeof useAccountingStoreType | undefined;
async function loadStore() {
  if (!api) api = (await import('../../src/store/accountingStore')).useAccountingStore;
  return api;
}

function state() {
  return api!.getState();
}

const now = () => new Date().toISOString();
// Mid-day UTC instants — the Kolkata calendar day of these is stable no matter
// which timezone the test machine runs in.
const at = (day: string) => new Date(`${day}T06:00:00.000Z`).toISOString();
// Entity ids derive from Date.now() — space creations out so customers,
// products and movements created back-to-back never collide on the same
// millisecond (the test steps run far faster than a real user's).
const tick = () => new Promise((r) => setTimeout(r, 3));

let custA = ''; // the client's exact scenario: 500 out / 200 back → 300
let custB = ''; // cross-period carry
let custC = ''; // piece-mapped KG net
let custD = ''; // box mixed units
let custE = ''; // zero-price refusal
let invAId = ''; // custA's invoice (set in the first test, reused by the second)
let prodA = ''; // plain PCS product
let prodB = ''; // piece-mapped product (billed in KG)
let prodBox = ''; // box-packed product
let prodFree = ''; // never priced
let pcsB = '';
let kgB = '';

beforeAll(async () => {
  api = await loadStore();
  const st = state();

  const a = st.createProduct(
    { product_name: 'Net PCS Widget', gujarati_name: null, sku: 'NET-A', description: '', primary_unit_id: 'uom-pcs', is_active: true },
    100
  );
  prodA = a.id;
  await tick();

  const b = st.createProduct(
    { product_name: 'Net KG Widget', gujarati_name: null, sku: 'NET-B', description: '', primary_unit_id: 'uom-gram', is_active: true },
    0
  );
  prodB = b.id;
  await tick();

  expect(st.savePieceWeightMapping(prodB, 500).success).toBe(true);
  await tick();
  const m = st.getPieceWeightMapping(prodB)!;
  pcsB = m.pcsUnitId;
  kgB = m.kgUnitId;
  st.createProductPrice({
    product_id: prodB,
    unit_id: kgB,
    price: 200,
    effective_from: new Date('2026-01-01T00:00:00Z').toISOString(),
    effective_to: null
  });
  await tick();

  const c = st.createProduct(
    { product_name: 'Net Box Widget', gujarati_name: null, sku: 'NET-C', description: '', primary_unit_id: 'uom-pcs', is_active: true },
    100,
    10
  );
  prodBox = c.id;
  await tick();

  const d = st.createProduct(
    { product_name: 'Free Widget', gujarati_name: null, sku: 'NET-D', description: '', primary_unit_id: 'uom-pcs', is_active: true },
    0
  );
  prodFree = d.id;
  await tick();

  const mk = (name: string, num: string) =>
    st.createCustomer({
      customer_name: name, customer_number: num, pan: '', gst_number: '', mobile: '',
      address: '', city: 'Surat', state: 'Gujarat', country: 'India', postal_code: '',
      credit_limit: 0, is_active: true
    }).customer!.id;
  custA = mk('Net Co A', 'C-N1');
  await tick();
  custB = mk('Net Co B', 'C-N2');
  await tick();
  custC = mk('Net Co C', 'C-N3');
  await tick();
  custD = mk('Net Co D', 'C-N4');
  await tick();
  custE = mk('Net Co E', 'C-N5');
  await tick();

  // Deep warehouse stock so dispatch validation never blocks a scenario.
  st.createStockReceipt(
    { supplierName: 'S', referenceNumber: 'P1', receiptDate: now(), notes: '' },
    [{ productId: prodA, unitId: 'uom-pcs', quantity: 5000, unitCost: 10 }]
  );
  st.createStockReceipt(
    { supplierName: 'S', referenceNumber: 'P2', receiptDate: now(), notes: '' },
    [{ productId: prodB, unitId: pcsB, quantity: 5000, unitCost: 50 }]
  );
  st.createStockReceipt(
    { supplierName: 'S', referenceNumber: 'P3', receiptDate: now(), notes: '' },
    [{ productId: prodBox, unitId: 'uom-pcs', quantity: 5000, unitCost: 5 }]
  );
  st.createStockReceipt(
    { supplierName: 'S', referenceNumber: 'P4', receiptDate: now(), notes: '' },
    [{ productId: prodFree, unitId: 'uom-pcs', quantity: 500, unitCost: 1 }]
  );
});

describe('period netting — the client model', () => {
  it('bills the NET: 500 PCS delivered, 200 PCS returned → 300 PCS invoiced', async () => {
    const st = state();
    expect(
      st.dispatchBatchInventoryToCustomer({
        customerId: custA, referenceId: 'CH-N-A1', movementDate: at('2026-03-05'),
        items: [{ productId: prodA, unitId: 'uom-pcs', quantity: 500 }]
      }).success
    ).toBe(true);
    await tick();
    // Quantity-only return: no rate is passed, so no rupee credit is earned.
    expect(
      st.returnBatchFromCustomer({
        customerId: custA, referenceId: 'RS-N-A1', movementDate: at('2026-03-10'),
        items: [{ productId: prodA, unitId: 'uom-pcs', quantity: 200 }]
      }).success
    ).toBe(true);
    await tick();
    expect(st.getCustomerReturnCredit(custA)).toBe(0);

    const net = st.previewPeriodNetting(custA, '2026-03-01', '2026-03-31');
    expect(net.lines).toHaveLength(1);
    const line = net.lines[0];
    expect(line.deliveredQty).toBe(500);
    expect(line.returnedQty).toBe(200);
    expect(line.broughtForwardQty).toBe(0);
    expect(line.netQty).toBe(300);
    expect(line.billQty).toBe(300);
    expect(line.billingUnitCode).toBe('PCS');
    expect(line.rate).toBe(100);
    expect(line.lineSubtotal).toBe(30000);
    expect(line.challans).toHaveLength(2);

    const res = st.createInvoiceFromPeriod({
      customerId: custA, periodStart: '2026-03-01', periodEnd: '2026-03-31', status: 'DRAFT'
    });
    expect(res.success).toBe(true);
    invAId = res.invoiceId!;

    const s2 = state();
    const inv = s2.invoices[invAId];
    const items = Object.values(s2.invoiceItems).filter((i) => i.invoice_id === inv.id);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(300);
    expect(items[0].unit_price).toBe(100);
    expect(items[0].taxable_amount).toBe(30000);

    // The allocations link BOTH challans (delivery and return) in movement
    // units — this is what makes the per-invoice ledger reproducible.
    const allocs = Object.values(s2.invoiceAllocations).filter((al) => al.invoice_id === inv.id);
    expect(allocs).toHaveLength(2);
    expect(allocs.reduce((sum, al) => sum + al.allocated_quantity, 0)).toBe(700);
  });

  it('never re-bills a challan: an invoiced window is exhausted', () => {
    const st = state();
    const net = st.previewPeriodNetting(custA, '2026-03-01', '2026-03-31');
    expect(net.lines).toHaveLength(0);
    expect(net.excluded).toHaveLength(2);
    const invNum = state().invoices[invAId].invoice_number;
    expect(net.excluded.every((x) => x.billedOnInvoiceNumber === invNum)).toBe(true);
    expect(
      st.createInvoiceFromPeriod({ customerId: custA, periodStart: '2026-03-01', periodEnd: '2026-03-31' }).success
    ).toBe(false);
  });

  it('carries unattached balances across periods and closes the arithmetic', async () => {
    const st = state();
    // Feb: deliver 500, return 300 → Feb invoice bills 200.
    expect(
      st.dispatchBatchInventoryToCustomer({
        customerId: custB, referenceId: 'CH-N-B1', movementDate: at('2026-02-05'),
        items: [{ productId: prodA, unitId: 'uom-pcs', quantity: 500 }]
      }).success
    ).toBe(true);
    await tick();
    expect(
      st.returnBatchFromCustomer({
        customerId: custB, referenceId: 'RS-N-B1', movementDate: at('2026-02-20'),
        items: [{ productId: prodA, unitId: 'uom-pcs', quantity: 300 }]
      }).success
    ).toBe(true);
    await tick();
    const feb = st.previewPeriodNetting(custB, '2026-02-01', '2026-02-28');
    expect(feb.lines[0].deliveredQty).toBe(500);
    expect(feb.lines[0].returnedQty).toBe(300);
    expect(feb.lines[0].billQty).toBe(200);
    const febRes = st.createInvoiceFromPeriod({
      customerId: custB, periodStart: '2026-02-01', periodEnd: '2026-02-28', status: 'DRAFT'
    });
    expect(febRes.success).toBe(true);
    await tick();

    // Mar: the last 200 come back. Feb's challans are attached to the Feb
    // invoice (already billed), so the return nets to −200 → nothing bills
    // and the negative stays UNATTACHED, carrying into April implicitly.
    expect(
      st.returnBatchFromCustomer({
        customerId: custB, referenceId: 'RS-N-B2', movementDate: at('2026-03-05'),
        items: [{ productId: prodA, unitId: 'uom-pcs', quantity: 200 }]
      }).success
    ).toBe(true);
    await tick();
    const mar = st.previewPeriodNetting(custB, '2026-03-01', '2026-03-31');
    expect(mar.lines[0].broughtForwardQty).toBe(0);
    expect(mar.lines[0].returnedQty).toBe(200);
    expect(mar.lines[0].netQty).toBe(-200);
    expect(mar.lines[0].billQty).toBe(0);
    expect(
      st.createInvoiceFromPeriod({ customerId: custB, periodStart: '2026-03-01', periodEnd: '2026-03-31' }).success
    ).toBe(false);

    // Apr: 400 fresh pieces → 400 − 200 carried = 200 billed. Across all
    // three invoices: 200 + 0 + 200 = 400 = 900 delivered − 500 returned.
    expect(
      st.dispatchBatchInventoryToCustomer({
        customerId: custB, referenceId: 'CH-N-B2', movementDate: at('2026-04-05'),
        items: [{ productId: prodA, unitId: 'uom-pcs', quantity: 400 }]
      }).success
    ).toBe(true);
    await tick();
    const apr = st.previewPeriodNetting(custB, '2026-04-01', '2026-04-30');
    expect(apr.lines[0].broughtForwardQty).toBe(-200);
    expect(apr.lines[0].netQty).toBe(200);
    expect(apr.lines[0].billQty).toBe(200);
    const aprRes = st.createInvoiceFromPeriod({
      customerId: custB, periodStart: '2026-04-01', periodEnd: '2026-04-30', status: 'DRAFT'
    });
    expect(aprRes.success).toBe(true);
    const s2 = state();
    const aprItems = Object.values(s2.invoiceItems).filter((i) => i.invoice_id === aprRes.invoiceId);
    expect(aprItems[0].quantity).toBe(200);
    // The April invoice's allocations include the March RETURN (brought
    // forward) as well as the April delivery — the ledger tells the story.
    const aprAllocs = Object.values(s2.invoiceAllocations).filter((al) => al.invoice_id === aprRes.invoiceId);
    expect(aprAllocs).toHaveLength(2);
    const aprMovs = aprAllocs.map((al) => s2.customerInventoryMovements[al.customer_inventory_movement_id]);
    expect(aprMovs.map((mo) => mo.movement_type).sort()).toEqual(['DISPATCH', 'RETURN']);
  });
});

describe('period netting — unit resolution', () => {
  it('bills piece-mapped products in KG (100 PCS − 40 PCS → 30 KG at the KG rate)', async () => {
    const st = state();
    expect(
      st.dispatchBatchInventoryToCustomer({
        customerId: custC, referenceId: 'CH-N-C1', movementDate: at('2026-03-05'),
        items: [{ productId: prodB, unitId: pcsB, quantity: 100 }]
      }).success
    ).toBe(true);
    await tick();
    expect(
      st.returnBatchFromCustomer({
        customerId: custC, referenceId: 'RS-N-C1', movementDate: at('2026-03-12'),
        items: [{ productId: prodB, unitId: pcsB, quantity: 40 }]
      }).success
    ).toBe(true);
    await tick();

    const net = st.previewPeriodNetting(custC, '2026-03-01', '2026-03-31');
    expect(net.lines).toHaveLength(1);
    const line = net.lines[0];
    expect(line.billingUnitCode).toBe('KG');
    expect(line.deliveredQty).toBe(50);
    expect(line.returnedQty).toBe(20);
    expect(line.billQty).toBe(30);
    expect(line.rate).toBe(200);
    expect(line.lineSubtotal).toBe(6000);

    const res = st.createInvoiceFromPeriod({
      customerId: custC, periodStart: '2026-03-01', periodEnd: '2026-03-31', status: 'DRAFT'
    });
    expect(res.success).toBe(true);
    const s2 = state();
    const items = Object.values(s2.invoiceItems).filter((i) => i.invoice_id === res.invoiceId);
    expect(items[0].quantity).toBe(30);
    expect(items[0].unit_id).toBe(kgB);
    expect(items[0].unit_price).toBe(200);
    // Allocations keep the movement's own unit: PCS magnitudes.
    const allocs = Object.values(s2.invoiceAllocations).filter((al) => al.invoice_id === res.invoiceId);
    expect(allocs.map((al) => al.allocated_quantity).sort((x, y) => x - y)).toEqual([40, 100]);
  });

  it("bills box products in the first delivery's unit (30 BOX − 5 BOX → 25 BOX)", async () => {
    const st = state();
    const boxUnit = st.getBoxMapping(prodBox)!.boxUnitId;
    expect(
      st.dispatchBatchInventoryToCustomer({
        customerId: custD, referenceId: 'CH-N-D1', movementDate: at('2026-03-05'),
        items: [{ productId: prodBox, unitId: boxUnit, quantity: 30 }]
      }).success
    ).toBe(true);
    await tick();
    expect(
      st.returnBatchFromCustomer({
        customerId: custD, referenceId: 'RS-N-D1', movementDate: at('2026-03-12'),
        items: [{ productId: prodBox, unitId: boxUnit, quantity: 5 }]
      }).success
    ).toBe(true);
    await tick();

    const net = st.previewPeriodNetting(custD, '2026-03-01', '2026-03-31');
    const line = net.lines[0];
    expect(line.billingUnitCode).toBe('BOX');
    expect(line.deliveredQty).toBe(30);
    expect(line.returnedQty).toBe(5);
    expect(line.billQty).toBe(25);
    expect(line.rate).toBe(100);
  });

  it('bills in PCS when a box product was dispatched loose only', async () => {
    const st = state();
    const box = st.getBoxMapping(prodBox)!;
    const loose = st.createCustomer({
      customer_name: 'Net Co D2', customer_number: 'C-N6', pan: '', gst_number: '', mobile: '',
      address: '', city: 'Surat', state: 'Gujarat', country: 'India', postal_code: '',
      credit_limit: 0, is_active: true
    }).customer!.id;
    await tick();
    expect(
      st.dispatchBatchInventoryToCustomer({
        customerId: loose, referenceId: 'CH-N-D2', movementDate: at('2026-03-05'),
        items: [{ productId: prodBox, unitId: box.pcsUnitId, quantity: 20 }]
      }).success
    ).toBe(true);
    await tick();
    const net = st.previewPeriodNetting(loose, '2026-03-01', '2026-03-31');
    expect(net.lines[0].billingUnitCode).toBe('PCS');
    expect(net.lines[0].billQty).toBe(20);
  });
});

describe('period netting — refusals', () => {
  it('refuses to bill an unpriced product and names it in the error', async () => {
    const st = state();
    expect(
      st.dispatchBatchInventoryToCustomer({
        customerId: custE, referenceId: 'CH-N-E1', movementDate: at('2026-03-05'),
        items: [{ productId: prodFree, unitId: 'uom-pcs', quantity: 10 }]
      }).success
    ).toBe(true);
    await tick();
    const net = st.previewPeriodNetting(custE, '2026-03-01', '2026-03-31');
    expect(net.billableLines).toHaveLength(1);
    expect(net.billableLines[0].rate).toBe(0);

    const res = st.createInvoiceFromPeriod({
      customerId: custE, periodStart: '2026-03-01', periodEnd: '2026-03-31'
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('Free Widget');
  });

  it('refuses an empty window and a reversed range', () => {
    const st = state();
    const empty = st.createInvoiceFromPeriod({
      customerId: custE, periodStart: '2030-01-01', periodEnd: '2030-01-31'
    });
    expect(empty.success).toBe(false);
    const reversed = st.createInvoiceFromPeriod({
      customerId: custE, periodStart: '2026-03-31', periodEnd: '2026-03-01'
    });
    expect(reversed.success).toBe(false);
  });
});

describe('period netting — pure engine edge cases', () => {
  const baseMov = (id: string, type: 'DISPATCH' | 'RETURN', day: string, qty: number): CustomerInventoryMovement => ({
    id,
    customer_id: 'cx',
    product_id: '',
    unit_id: 'uom-pcs',
    quantity: qty,
    movement_type: type,
    movement_date: at(day),
    reference_type: type,
    reference_id: type === 'DISPATCH' ? `CH-${id}` : `RS-${id}`,
    document_id: null,
    created_at: now(),
    created_by: 'u1'
  });

  it('an over-returned period bills nothing and carries the negative forward', () => {
    const st = state();
    const movs: Record<string, CustomerInventoryMovement> = {
      m1: { ...baseMov('m1', 'DISPATCH', '2026-02-01', 500), product_id: prodA },
      m2: { ...baseMov('m2', 'RETURN', '2026-02-20', 700), product_id: prodA }
    };
    const base = {
      customerId: 'cx',
      products: { [prodA]: st.products[prodA] },
      uoms: st.uoms,
      productUnits: {},
      customerInventoryMovements: movs,
      invoiceAllocations: {},
      invoices: {},
      getPieceWeightMapping: () => null,
      getBoxMapping: () => null,
      resolvePriceForCustomer: () => ({ price: 100, basePrice: 100, isCustom: false })
    };

    const feb = previewPeriodNetting({ ...base, periodStart: '2026-02-01', periodEnd: '2026-02-28' });
    expect(feb.lines[0].netQty).toBe(-200);
    expect(feb.lines[0].billQty).toBe(0);
    expect(feb.billableLines).toHaveLength(0);

    const movs2 = {
      ...movs,
      m3: { ...baseMov('m3', 'DISPATCH', '2026-03-05', 400), product_id: prodA }
    };
    const mar = previewPeriodNetting({
      ...base,
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      customerInventoryMovements: movs2
    });
    expect(mar.lines[0].broughtForwardQty).toBe(-200);
    expect(mar.lines[0].billQty).toBe(200);
  });
});
