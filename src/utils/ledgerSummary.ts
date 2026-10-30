// Customer-ledger print summary: pure aggregation over store data, consumed
// by CustomerLedgerView's PDF builder (buildCustomerLedgerPdf). Kept pure over
// its inputs (like getPieceWeightMapping) so it is unit-testable without the
// store or a PDF.
//
// Supply source decision (user-confirmed): quantities AND prices come from
// INVOICE ITEMS dated inside the period — billed supply, invoiced rates.
// Previous outstanding: FINALIZED invoices dated BEFORE the period start that
// still carry a balance.

import { roundCurrency, kolkataCalendarDay } from './calculations';
import type { Invoice, InvoiceItem, Product, UnitOfMeasure } from '../types/database';

export interface SupplyRow {
  productId: string;
  productName: string;
  /** Σ billed quantity, in the items' billing units. */
  qty: number;
  /** UOM code of the billing units (snapshot-consistent display). */
  unitCode: string;
  /** PCS-equivalent quantity for piece-mapped products, else null. */
  pcs: number | null;
  /** Weight of the supplied quantity in KG (piece-mapped products), else null. */
  weightKg: number | null;
  /** Σ pre-tax line value (taxable_amount). */
  value: number;
  /** Effective rate = value ÷ qty; null when nothing was supplied. */
  rate: number | null;
}

export interface PreviousOutstandingRow {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  outstanding: number;
}

export interface LedgerSummaryInput {
  invoices: Record<string, Invoice>;
  invoiceItems: Record<string, InvoiceItem>;
  products: Record<string, Product>;
  uoms: Record<string, UnitOfMeasure>;
  customerId: string;
  /** Calendar days (YYYY-MM-DD, IST) — the same days the view's filters use. */
  startDate: string;
  endDate: string;
  /** Store selector (wraps the pure getPieceWeightMapping). */
  getPieceWeightMapping: (productId: string) => { pcsUnitId: string; gramsPerPiece: number; kgUnitId: string } | null;
  /** Store selector returning the invoice's current outstanding. */
  getInvoiceOutstanding: (invoiceId: string) => { outstanding: number };
}

/**
 * Per-product billed supply inside the period. One row per product (rates
 * collapse to an effective value ÷ qty when a product was billed at several
 * rates). Quantities are summed in whatever billing units the items carry —
 * mixed units on one product are aggregated as-is (the challan flow bills a
 * product consistently in one unit).
 */
export function buildSupplySummary(input: LedgerSummaryInput): SupplyRow[] {
  const { invoices, invoiceItems, products, uoms, customerId, startDate, endDate } = input;

  interface Acc {
    qty: number;
    value: number;
    grams: number | null;
    gramsPerPiece: number | null;
    /** PCS billed directly on non-mapped (PCS-primary) products. */
    directPcs: number | null;
    unitCode: string;
  }
  const byProduct = new Map<string, Acc>();

  for (const inv of Object.values(invoices)) {
    if (inv.customer_id !== customerId) continue;
    if (inv.status !== 'FINALIZED') continue; // billed supply only
    const day = kolkataCalendarDay(inv.invoice_date);
    if (day < startDate || day > endDate) continue;
    for (const item of Object.values(invoiceItems)) {
      if (item.invoice_id !== inv.id) continue;
      const prod = products[item.product_id];
      const mapping = input.getPieceWeightMapping(item.product_id);
      let acc = byProduct.get(item.product_id);
      if (!acc) {
        acc = {
          qty: 0,
          value: 0,
          grams: mapping ? 0 : null,
          gramsPerPiece: mapping ? mapping.gramsPerPiece : null,
          directPcs: mapping ? null : 0,
          unitCode: item.uom_snapshot || uoms[item.unit_id]?.code || ''
        };
        byProduct.set(item.product_id, acc);
      }
      acc.qty = roundCurrency(acc.qty + item.quantity);
      acc.value = roundCurrency(acc.value + item.taxable_amount);

      const code = (uoms[item.unit_id]?.code || '').trim().toUpperCase();
      if (mapping) {
        // Weight accumulation from the billing unit: KG x1000, GRAM x1, and
        // PCS x grams-per-piece for robustness (the challan flow bills in KG,
        // so PCS-valued items are rare — but harmless to support).
        const itemGrams =
          code === 'KG' ? item.quantity * 1000
          : code === 'GRAM' ? item.quantity
          : item.unit_id === mapping.pcsUnitId ? item.quantity * mapping.gramsPerPiece
          : null;
        if (itemGrams !== null) {
          acc.grams = roundCurrency((acc.grams ?? 0) + itemGrams);
        }
      } else if (code === 'PCS') {
        // No piece mapping: the PCS column still shows what was supplied.
        acc.directPcs = roundCurrency((acc.directPcs ?? 0) + item.quantity);
      }
    }
  }

  return [...byProduct.entries()]
    .map(([productId, acc]) => {
      const prod = products[productId];
      const weightKg =
        acc.grams !== null && acc.grams > 0
          ? roundCurrency(acc.grams) / 1000
          : null;
      return {
        productId,
        productName: prod?.product_name || productId,
        qty: acc.qty,
        unitCode: acc.unitCode,
        pcs:
          acc.grams !== null && acc.gramsPerPiece
            ? roundCurrency(acc.grams / acc.gramsPerPiece)
            : acc.directPcs,
        weightKg,
        value: acc.value,
        rate: acc.qty > 0 ? roundCurrency(acc.value / acc.qty) : null
      };
    })
    .sort((a, b) => a.productName.localeCompare(b.productName));
}

/**
 * FINALIZED invoices of this customer dated BEFORE the period start that
 * still carry an outstanding balance — the "previous month" box on the
 * printed ledger. Sorted oldest first.
 */
export function previousOutstandingInvoices(input: LedgerSummaryInput): PreviousOutstandingRow[] {
  const { invoices, customerId, startDate } = input;
  return Object.values(invoices)
    .filter((inv) => {
      if (inv.customer_id !== customerId) return false;
      if (inv.status !== 'FINALIZED') return false;
      if (kolkataCalendarDay(inv.invoice_date) >= startDate) return false;
      return input.getInvoiceOutstanding(inv.id).outstanding > 0;
    })
    .map((inv) => ({
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      invoiceDate: inv.invoice_date,
      outstanding: input.getInvoiceOutstanding(inv.id).outstanding
    }))
    .sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime());
}

/** Also exported for the PDF total box. */
export function sumOutstanding(rows: PreviousOutstandingRow[]): number {
  return roundCurrency(rows.reduce((sum, r) => sum + r.outstanding, 0));
}

export interface PreviousMonthDueRow {
  /** YYYY-MM key (IST calendar month of the invoice dates). */
  monthKey: string;
  /** Display label, e.g. "DECEMBER 2025". */
  label: string;
  /** Σ outstanding across the month's pre-period invoices. */
  total: number;
}

const MONTH_LABELS = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];

/**
 * Month-wise view of the previous outstanding for the printed ledger box:
 * one row per calendar month (oldest first) with the summed balance.
 * Months whose dues are fully settled (total = 0) are omitted entirely.
 */
export function previousOutstandingByMonth(input: LedgerSummaryInput): PreviousMonthDueRow[] {
  const byMonth = new Map<string, number>();
  for (const row of previousOutstandingInvoices(input)) {
    const monthKey = kolkataCalendarDay(row.invoiceDate).slice(0, 7); // YYYY-MM
    byMonth.set(monthKey, roundCurrency((byMonth.get(monthKey) ?? 0) + row.outstanding));
  }
  return [...byMonth.entries()]
    .filter(([, total]) => total > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, total]) => ({
      monthKey,
      label: `${MONTH_LABELS[Number(monthKey.slice(5, 7)) - 1]} ${monthKey.slice(0, 4)}`,
      total
    }));
}
