// ---------------------------------------------------------------------------
// Per-invoice challan ledger model (pure over store slices — no store import).
//
// One invoice's justification sheet: every challan movement that shaped its
// net (deliveries and accepted returns, in the movement's own unit), plus a
// per-line billing summary tying the net quantity to the invoice's money.
// Reconstructed from `invoice_allocations`, which — since period billing —
// link the invoice to BOTH delivery and return movements. Old manual-allocation
// invoices (a product on two lines, BOX + PCS) attribute each allocation to
// the line whose unit matches the movement's, falling back to the piece/KG
// line for PCS movements behind a KG quantity.
// ---------------------------------------------------------------------------
import { CustomerInventoryMovement, Invoice, InvoiceItem, Product, ProductUnit, UnitOfMeasure } from '../types/database';
import { convertQuantity, roundCurrency, toDisplayWeight } from './calculations';

export interface PieceWeightMappingLite {
  kgUnitId: string;
  pcsUnitId: string;
  gramsPerPiece: number;
}

export interface InvoiceLedgerRow {
  date: string; // ISO
  challanRef: string;
  kind: 'DELIVERY' | 'RETURN';
  productId: string;
  productName: string;
  sku: string;
  quantity: number; // movement units, positive
  unitId: string;
  unitCode: string;
  /** KG weight for piece-mapped PCS rows; null when not weight-mapped. */
  weightKg: number | null;
  /** True when the movement is dated before the billing period opened. */
  broughtForward: boolean;
}

export interface InvoiceLedgerLineSummary {
  productId: string;
  productName: string;
  sku: string;
  unitCode: string;
  deliveredQty: number;
  returnedQty: number;
  netQty: number;
  rate: number;
  taxableValue: number;
  /** Net weight for KG-billed lines; null otherwise. */
  weightKg: number | null;
}

export interface InvoiceLedgerModel {
  invoiceNumber: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  customerName: string;
  rows: InvoiceLedgerRow[];
  summaries: InvoiceLedgerLineSummary[];
  totalTaxable: number;
}

export interface InvoiceLedgerInput {
  invoice: Invoice;
  items: InvoiceItem[];
  allocations: Array<{ id: string; customer_inventory_movement_id: string; allocated_quantity: number }>;
  movements: Record<string, CustomerInventoryMovement>;
  products: Record<string, Product>;
  uoms: Record<string, UnitOfMeasure>;
  productUnits: Record<string, ProductUnit>;
  getPieceWeightMapping: (productId: string) => PieceWeightMappingLite | null;
}

export function buildInvoiceLedgerModel(input: InvoiceLedgerInput): InvoiceLedgerModel {
  const { invoice, items, allocations, movements, products, uoms, productUnits, getPieceWeightMapping } = input;

  const periodStartDay = (invoice.billing_period_start || '').slice(0, 10);
  const periodEndDay = (invoice.billing_period_end || '').slice(0, 10);

  const rows: InvoiceLedgerRow[] = [];
  for (const alloc of allocations) {
    const mov = movements[alloc.customer_inventory_movement_id];
    if (!mov) continue;
    const prod = products[mov.product_id];
    const mapping = getPieceWeightMapping(mov.product_id);
    const isPcsBehindKg = Boolean(mapping && mov.unit_id === mapping.pcsUnitId);
    const day = mov.movement_date.slice(0, 10);
    rows.push({
      date: mov.movement_date,
      challanRef: mov.reference_id,
      kind: mov.movement_type === 'RETURN' ? 'RETURN' : 'DELIVERY',
      productId: mov.product_id,
      productName: prod?.product_name || 'Item',
      sku: prod?.sku || '',
      quantity: alloc.allocated_quantity,
      unitId: mov.unit_id,
      unitCode: uoms[mov.unit_id]?.code || 'PCS',
      weightKg: isPcsBehindKg
        ? roundCurrency((alloc.allocated_quantity * (mapping?.gramsPerPiece ?? 0)) / 1000)
        : null,
      broughtForward: Boolean(
        periodStartDay && (day < periodStartDay || day > periodEndDay)
      )
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.challanRef.localeCompare(b.challanRef));

  // Per-LINE summary: delivered/returned/net converted into the line's unit.
  const summaries: InvoiceLedgerLineSummary[] = items.map((line) => {
    const prod = products[line.product_id];
    const mapping = getPieceWeightMapping(line.product_id);

    // Attribute allocations to this line: unit match first; PCS movements
    // behind a KG line follow the mapping; leftovers land on a single-line
    // product (the only case the period netter produces).
    const lineAllocations = allocations.filter((a) => {
      const mov = movements[a.customer_inventory_movement_id];
      if (!mov || mov.product_id !== line.product_id) return false;
      if (items.length === 1) return true;
      const sameProductLines = items.filter((i) => i.product_id === line.product_id);
      if (sameProductLines.length === 1) return true;
      if (mov.unit_id === line.unit_id) return true;
      return Boolean(mapping && mov.unit_id === mapping.pcsUnitId && line.unit_id === mapping.kgUnitId);
    });

    const sumKind = (kind: 'DELIVERY' | 'RETURN') => {
      const pus = Object.values(productUnits).filter((pu) => pu.product_id === line.product_id);
      return roundCurrency(
        lineAllocations
          .filter((a) => {
            const mov = movements[a.customer_inventory_movement_id];
            if (!mov) return false;
            return (mov.movement_type === 'RETURN' ? 'RETURN' : 'DELIVERY') === kind;
          })
          .reduce(
            (s, a) => {
              const mov = movements[a.customer_inventory_movement_id];
              return s + convertQuantity(a.allocated_quantity, mov.unit_id, line.unit_id, pus);
            },
            0
          )
      );
    };

    const deliveredQty = sumKind('DELIVERY');
    const returnedQty = sumKind('RETURN');
    const netQty = roundCurrency(deliveredQty - returnedQty);
    const isKgLine = Boolean(mapping && line.unit_id === mapping.kgUnitId);

    return {
      productId: line.product_id,
      productName: prod?.product_name || line.product_name_snapshot,
      sku: line.sku_snapshot,
      unitCode: line.uom_snapshot,
      deliveredQty,
      returnedQty,
      netQty,
      rate: line.unit_price,
      taxableValue: roundCurrency(line.taxable_amount),
      weightKg: isKgLine ? netQty : null
    };
  });

  return {
    invoiceNumber: invoice.invoice_number,
    invoiceDate: invoice.invoice_date,
    periodStart: invoice.billing_period_start,
    periodEnd: invoice.billing_period_end,
    customerName: invoice.customer_snapshot.customer_name,
    rows,
    summaries,
    totalTaxable: roundCurrency(items.reduce((s, i) => s + i.taxable_amount, 0))
  };
}

/** Pre-formatted weight cell: "1.00 KG" via toDisplayWeight, '-' when null. */
export function ledgerWeightCell(kg: number | null): string {
  if (kg === null || !Number.isFinite(kg)) return '-';
  const w = toDisplayWeight(kg * 1000);
  return `${w.qty} ${w.unit}`;
}
