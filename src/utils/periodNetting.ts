// ---------------------------------------------------------------------------
// Period netting engine — the heart of challan-based billing.
//
// Business rule (client-approved): returns are recorded in QUANTITY only (no
// rate, no rupee credit). When an invoice is generated for a customer's
// from-date/to-date window, every challan movement in that window — deliveries
// AND returns — nets together, and the invoice bills the NET quantity:
// 500 PCS delivered − 200 PCS returned = 300 PCS billed.
//
// One challan movement may shape ONE invoice only (never double-billed): a
// movement attached to a live invoice is excluded from every later netting.
//
// Cross-period spillage carries implicitly: returns that exceed the
// deliveries available to net against stay UNATTACHED (no invoice line, no
// synthetic records), so a later period's netting naturally picks them up as
// a negative brought-forward. Example: deliver 500, return 700 → nothing
// bills; a later 400-PCS delivery nets against the leftover −200 → 200 bills.
// ---------------------------------------------------------------------------
import { CustomerInventoryMovement, Product, ProductUnit, UnitOfMeasure } from '../types/database';
import { convertQuantity, kolkataCalendarDay, roundCurrency } from './calculations';

export interface PieceWeightMappingLite {
  kgUnitId: string;
  pcsUnitId: string;
  gramsPerPiece: number;
}

export interface BoxMappingLite {
  boxUnitId: string;
  pcsUnitId: string;
  pcsPerBox: number;
}

export interface ResolvedPriceLite {
  price: number;
  basePrice: number;
  isCustom: boolean;
}

/** One challan movement line (delivery or return) in its own movement unit. */
export interface PeriodChallanRow {
  movementId: string;
  date: string; // ISO
  challanRef: string; // reference_id (challan / slip number)
  kind: 'DISPATCH' | 'RETURN';
  productId: string;
  quantity: number; // movement units, always positive
  unitId: string;
  unitCode: string;
}

/** A challan already consumed by another live invoice. */
export interface ExcludedChallanRow extends PeriodChallanRow {
  billedOnInvoiceId: string;
  billedOnInvoiceNumber: string;
}

export interface PeriodNetLine {
  productId: string;
  productName: string;
  sku: string;
  billingUnitId: string;
  billingUnitCode: string;
  /** Deliveries in the period, converted to the billing unit. */
  deliveredQty: number;
  /** Returns in the period, converted to the billing unit (positive). */
  returnedQty: number;
  /**
   * Brought-forward net from unattached pre-period movements (negative when
   * the customer over-returned in the past; positive when old deliveries were
   * never billed). Expressed in the billing unit.
   */
  broughtForwardQty: number;
  /** delivered − returned + broughtForward (may be negative or zero). */
  netQty: number;
  /** What the invoice actually bills: max(0, netQty). */
  billQty: number;
  rate: number;
  isCustomRate: boolean;
  /** billQty × rate (pre-tax). */
  lineSubtotal: number;
  /** Unattached, in-range challans for this product (movement units). */
  challans: PeriodChallanRow[];
  /** Unattached, pre-period challans that shaped the brought-forward. */
  broughtForwardChallans: PeriodChallanRow[];
}

export interface PeriodNetting {
  customerId: string;
  periodStart: string; // YYYY-MM-DD (inclusive)
  periodEnd: string;   // YYYY-MM-DD (inclusive)
  /** Every product touched by in-range or brought-forward challans. */
  lines: PeriodNetLine[];
  /** lines with billQty > 0 — these become the invoice's items. */
  billableLines: PeriodNetLine[];
  /** In-range challans already billed on another invoice (never re-billed). */
  excluded: ExcludedChallanRow[];
}

export interface PeriodNettingInput {
  customerId: string;
  periodStart: string;
  periodEnd: string;
  products: Record<string, Product>;
  uoms: Record<string, UnitOfMeasure>;
  productUnits: Record<string, ProductUnit>;
  customerInventoryMovements: Record<string, CustomerInventoryMovement>;
  invoiceAllocations: Record<string, {
    invoice_id: string;
    customer_inventory_movement_id: string;
    allocated_quantity: number;
  }>;
  invoices: Record<string, { id: string; status: string; invoice_number: string }>;
  getPieceWeightMapping: (productId: string) => PieceWeightMappingLite | null;
  getBoxMapping: (productId: string) => BoxMappingLite | null;
  resolvePriceForCustomer: (productId: string, unitId: string, customerId: string) => ResolvedPriceLite;
}

/** Invoice line products whose period challans exist but net to nothing. */
export const periodHasNoChallans = (netting: PeriodNetting): boolean =>
  netting.lines.length === 0;

function toPrimary(
  qty: number,
  unitId: string,
  productId: string,
  productUnits: Record<string, ProductUnit>,
  primaryUnitId: string
): number {
  const pus = Object.values(productUnits).filter((pu) => pu.product_id === productId);
  return convertQuantity(qty, unitId, primaryUnitId, pus);
}

export function previewPeriodNetting(input: PeriodNettingInput): PeriodNetting {
  const {
    customerId,
    periodStart,
    periodEnd,
    products,
    uoms,
    productUnits,
    customerInventoryMovements,
    invoiceAllocations,
    invoices,
    getPieceWeightMapping,
    getBoxMapping,
    resolvePriceForCustomer
  } = input;

  // Movements attached to a LIVE (non-cancelled) invoice are consumed — they
  // must never shape a second invoice.
  const attachedTo = new Map<string, { invoiceId: string; invoiceNumber: string }>();
  for (const alloc of Object.values(invoiceAllocations)) {
    const inv = invoices[alloc.invoice_id];
    if (!inv || inv.status === 'CANCELLED') continue;
    attachedTo.set(alloc.customer_inventory_movement_id, {
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number
    });
  }

  const startDay = periodStart.slice(0, 10);
  const endDay = periodEnd.slice(0, 10);

  const excluded: ExcludedChallanRow[] = [];
  const inRangeByProduct = new Map<string, PeriodChallanRow[]>();
  const beforeByProduct = new Map<string, PeriodChallanRow[]>();

  for (const mov of Object.values(customerInventoryMovements)) {
    if (mov.customer_id !== customerId) continue;
    if (mov.movement_type !== 'DISPATCH' && mov.movement_type !== 'RETURN') continue;
    const prod = products[mov.product_id];
    if (!prod) continue;

    const row: PeriodChallanRow = {
      movementId: mov.id,
      date: mov.movement_date,
      challanRef: mov.reference_id,
      kind: mov.movement_type,
      productId: mov.product_id,
      quantity: mov.quantity,
      unitId: mov.unit_id,
      unitCode: uoms[mov.unit_id]?.code || 'PCS'
    };

    const attached = attachedTo.get(mov.id);
    if (attached) {
      const day = kolkataCalendarDay(mov.movement_date);
      // Only in-range attachments are reported as "excluded" — older ones
      // belong to history, not to this billing decision.
      if (day >= startDay && day <= endDay) {
        excluded.push({
          ...row,
          billedOnInvoiceId: attached.invoiceId,
          billedOnInvoiceNumber: attached.invoiceNumber
        });
      }
      continue;
    }

    const day = kolkataCalendarDay(mov.movement_date);
    if (day >= startDay && day <= endDay) {
      const list = inRangeByProduct.get(mov.product_id) || [];
      list.push(row);
      inRangeByProduct.set(mov.product_id, list);
    } else if (day < startDay) {
      // Pre-period leftovers: unattached deliveries that were never billed and
      // unattached returns that were never netted. They carry forward here.
      const list = beforeByProduct.get(mov.product_id) || [];
      list.push(row);
      beforeByProduct.set(mov.product_id, list);
    }
    // Movements after the period belong to a future bill.
  }

  excluded.sort((a, b) => a.date.localeCompare(b.date));

  const productIds = new Set<string>([...inRangeByProduct.keys(), ...beforeByProduct.keys()]);
  const lines: PeriodNetLine[] = [];

  for (const productId of productIds) {
    const prod = products[productId];
    if (!prod) continue;

    const challans = (inRangeByProduct.get(productId) || [])
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || a.movementId.localeCompare(b.movementId));
    const bfChallans = (beforeByProduct.get(productId) || [])
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || a.movementId.localeCompare(b.movementId));

    const sumKind = (rows: PeriodChallanRow[], kind: PeriodChallanRow['kind']) =>
      roundCurrency(
        rows
          .filter((r) => r.kind === kind)
          .reduce((s, r) => s + toPrimary(r.quantity, r.unitId, productId, productUnits, prod.primary_unit_id), 0)
      );

    const deliveredPrimary = sumKind(challans, 'DISPATCH');
    const returnedPrimary = sumKind(challans, 'RETURN');
    const bfDeliveredPrimary = sumKind(bfChallans, 'DISPATCH');
    const bfReturnedPrimary = sumKind(bfChallans, 'RETURN');
    const broughtForwardPrimary = roundCurrency(bfDeliveredPrimary - bfReturnedPrimary);

    // Billing unit: KG for piece-mapped products (weight billing); for box
    // products the unit the period's deliveries actually used (BOX stays the
    // anchor); otherwise the product's primary unit.
    const box = getBoxMapping(productId);
    const mapping = getPieceWeightMapping(productId);
    let billingUnitId: string;
    if (mapping) {
      billingUnitId = mapping.kgUnitId;
    } else if (box) {
      const firstDispatch = challans.find((r) => r.kind === 'DISPATCH');
      billingUnitId =
        firstDispatch && (firstDispatch.unitId === box.pcsUnitId || firstDispatch.unitId === box.boxUnitId)
          ? firstDispatch.unitId
          : box.boxUnitId;
    } else {
      billingUnitId = prod.primary_unit_id;
    }

    const toBilling = (primaryQty: number) =>
      roundCurrency(toPrimary(primaryQty, prod.primary_unit_id, productId, productUnits, billingUnitId));

    const deliveredQty = toBilling(deliveredPrimary);
    const returnedQty = toBilling(returnedPrimary);
    const broughtForwardQty = toBilling(broughtForwardPrimary);
    const netQty = roundCurrency(deliveredQty - returnedQty + broughtForwardQty);
    const billQty = Math.max(0, netQty);

    const resolved = resolvePriceForCustomer(productId, billingUnitId, customerId);

    lines.push({
      productId,
      productName: prod.product_name,
      sku: prod.sku,
      billingUnitId,
      billingUnitCode: uoms[billingUnitId]?.code || 'PCS',
      deliveredQty,
      returnedQty,
      broughtForwardQty,
      netQty,
      billQty,
      rate: resolved.price,
      isCustomRate: resolved.isCustom,
      lineSubtotal: roundCurrency(billQty * resolved.price),
      challans,
      broughtForwardChallans: bfChallans
    });
  }

  lines.sort((a, b) => a.productName.localeCompare(b.productName));

  return {
    customerId,
    periodStart,
    periodEnd,
    lines,
    billableLines: lines.filter((l) => l.billQty > 0),
    excluded
  };
}
