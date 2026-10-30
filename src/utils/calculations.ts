/**
 * Precision Financial Calculations and UOM Conversion Utilities
 * Guaranteed decimal-safe math for accounting invariants.
 */

import {
  ProductUnit,
  UnitOfMeasure,
  InvoicePayment
} from '../types/database';

/**
 * Rounds a number to exactly 2 decimal places.
 * Symmetric half-up on the received binary value. Implemented with exact integer
 * arithmetic on the round-trip decimal expansion (not Math.round(x * 100), whose
 * float multiply rounds sub-tie values up to exactly the tie, e.g. 2.675 * 100
 * is exactly 267.5 in float64). See BUG-001/002/003.
 */
export function roundCurrency(amount: number): number {
  if (!Number.isFinite(amount)) return amount; // NaN / ±Infinity pass through (documented)
  if (amount === 0) return 0;
  const sign = amount < 0 ? -1 : 1;
  // toPrecision(17) is the shortest string that round-trips the binary value.
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(Math.abs(amount).toPrecision(17));
  if (!match) return amount; // unreachable for finite numbers; fail open, never NaN
  const digits = match[1] + (match[2] ?? '');
  const decimalExp = (match[3] ? Number(match[3]) : 0) - (match[2] ?? '').length;
  // cents = round_half_up(BigInt(digits) * 10^(decimalExp + 2))
  const num = BigInt(digits);
  const shift = decimalExp + 2;
  let cents: bigint;
  if (shift >= 0) {
    cents = num * 10n ** BigInt(shift);
  } else {
    const divisor = 10n ** BigInt(-shift);
    const q = num / divisor;
    const r = num % divisor;
    cents = r * 2n >= divisor ? q + 1n : q;
  }
  const rounded = (sign === -1 ? -cents : cents);
  const result = Number(rounded) / 100;
  return result === 0 ? 0 : result; // normalize -0 to 0
}

/**
 * Formats a number in Indian INR accounting currency notation (₹ 1,23,456.78)
 */
export function formatINR(amount: number, showSymbol = true): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return showSymbol ? '₹0.00' : '0.00';
  }
  const isNegative = amount < 0;
  const absAmount = Math.abs(roundCurrency(amount));

  // Indian numbering format: last 3 digits, then groups of 2 digits
  const parts = absAmount.toFixed(2).split('.');
  let integerPart = parts[0];
  const decimalPart = parts[1];

  let lastThree = integerPart.substring(integerPart.length - 3);
  const otherNumbers = integerPart.substring(0, integerPart.length - 3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const formattedInt = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
  const result = `${formattedInt}.${decimalPart}`;

  return `${isNegative ? '-' : ''}${showSymbol ? '₹' : ''}${result}`;
}

/**
 * Convert quantity from one product unit to another product unit.
 * Uses the product_units relational mapping.
 */
export function convertQuantity(
  quantity: number,
  fromUnitId: string,
  toUnitId: string,
  productUnits: ProductUnit[]
): number {
  if (fromUnitId === toUnitId) return quantity;

  const fromPU = productUnits.find((pu) => pu.unit_id === fromUnitId);
  const toPU = productUnits.find((pu) => pu.unit_id === toUnitId);

  // If not found in product_units, default to direct 1:1 fallback
  const fromFactor = fromPU ? fromPU.conversion_to_primary : 1;
  const toFactor = toPU ? toPU.conversion_to_primary : 1;

  if (toFactor === 0) return 0;

  // Convert from source unit to primary quantity, then from primary quantity to target unit
  const primaryQty = quantity * fromFactor;
  const targetQty = primaryQty / toFactor;

  return roundCurrency(targetQty);
}

export interface TaxBreakdown {
  taxableAmount: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  isInterState: boolean;
}

/**
 * Computes GST tax according to Indian Tax Rules (CGST+SGST vs IGST)
 */
export function calculateTax(
  taxableAmount: number,
  gstRate: number,
  businessStateCode: string,
  customerStateCode: string
): TaxBreakdown {
  const roundedTaxable = roundCurrency(taxableAmount);
  // If business state code matches customer state code => Intra-state (CGST + SGST)
  // Else => Inter-state (IGST)
  const isInterState =
    Boolean(businessStateCode) &&
    Boolean(customerStateCode) &&
    businessStateCode.trim().toLowerCase() !== customerStateCode.trim().toLowerCase();

  if (gstRate <= 0 || roundedTaxable <= 0) {
    return {
      taxableAmount: roundedTaxable,
      gstRate: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      totalTax: 0,
      isInterState
    };
  }

  if (isInterState) {
    const igst = roundCurrency((roundedTaxable * gstRate) / 100);
    return {
      taxableAmount: roundedTaxable,
      gstRate,
      cgst: 0,
      sgst: 0,
      igst,
      totalTax: igst,
      isInterState: true
    };
  } else {
    // Split equally into CGST and SGST
    const halfRate = gstRate / 2;
    const cgst = roundCurrency((roundedTaxable * halfRate) / 100);
    const sgst = roundCurrency((roundedTaxable * halfRate) / 100);
    return {
      taxableAmount: roundedTaxable,
      gstRate,
      cgst,
      sgst,
      igst: 0,
      totalTax: roundCurrency(cgst + sgst),
      isInterState: false
    };
  }
}

/**
 * Calculates a single line item financials
 */
export function calculateLineItemFinancials(
  quantity: number,
  unitPrice: number,
  discount = 0,
  gstRate = 5,
  extraCharges = 0,
  businessStateCode = '24',
  customerStateCode = '24'
) {
  const lineSubtotal = roundCurrency(quantity * unitPrice);
  const roundedDiscount = roundCurrency(discount);
  const taxableAmount = Math.max(0, roundCurrency(lineSubtotal - roundedDiscount));
  const tax = calculateTax(taxableAmount, gstRate, businessStateCode, customerStateCode);
  const lineTotal = roundCurrency(
    taxableAmount + tax.cgst + tax.sgst + tax.igst + roundCurrency(extraCharges)
  );

  return {
    quantity,
    unitPrice,
    discount: roundedDiscount,
    lineSubtotal,
    taxableAmount,
    gstRate,
    cgst: tax.cgst,
    sgst: tax.sgst,
    igst: tax.igst,
    extraCharges: roundCurrency(extraCharges),
    lineTotal
  };
}

export interface InvoiceTotals {
  subtotal: number;
  discount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  otherCharges: number;
  grandTotal: number;
}

/**
 * Computes aggregate invoice totals from line items and other charges
 */
export function calculateInvoiceTotals(
  items: Array<{
    quantity: number;
    unit_price: number;
    discount?: number;
    taxable_amount?: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
    extra_charges?: number;
    line_total?: number;
  }>,
  otherCharges = 0
): InvoiceTotals {
  let subtotal = 0;
  let discount = 0;
  let taxableAmount = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  for (const item of items) {
    const rawLine = roundCurrency(item.quantity * item.unit_price);
    subtotal = roundCurrency(subtotal + rawLine);
    discount = roundCurrency(discount + (item.discount || 0));
    taxableAmount = roundCurrency(taxableAmount + (item.taxable_amount || (rawLine - (item.discount || 0))));
    cgst = roundCurrency(cgst + (item.cgst || 0));
    sgst = roundCurrency(sgst + (item.sgst || 0));
    igst = roundCurrency(igst + (item.igst || 0));
  }

  const roundedOtherCharges = roundCurrency(otherCharges);
  const grandTotal = roundCurrency(taxableAmount + cgst + sgst + igst + roundedOtherCharges);

  return {
    subtotal,
    discount,
    taxableAmount,
    cgst,
    sgst,
    igst,
    otherCharges: roundedOtherCharges,
    grandTotal
  };
}

/**
 * Calculates outstanding balance for an invoice
 */
export function calculateInvoiceOutstanding(
  grandTotal: number,
  invoiceStatus: string,
  payments: InvoicePayment[]
): {
  totalPaid: number;
  outstanding: number;
} {
  if (invoiceStatus === 'CANCELLED') {
    return { totalPaid: 0, outstanding: 0 };
  }

  const totalPaid = payments
    .filter((p) => p.status === 'ACTIVE')
    .reduce((sum, p) => roundCurrency(sum + p.amount), 0);

  const outstanding = Math.max(0, roundCurrency(grandTotal - totalPaid));
  return { totalPaid, outstanding };
}

/**
 * Converts a numeric amount to Indian currency words representation.
 */export function numberToWordsINR(amount: number): string {
  if (isNaN(amount) || amount === 0) return 'Rupees Zero Only';
  const absAmount = Math.floor(Math.abs(amount));

  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertTwoDigits = (n: number): string => {
    if (n < 20) return units[n];
    return `${tens[Math.floor(n / 10)]} ${units[n % 10]}`.trim();
  };

  const convertThreeDigits = (n: number): string => {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    let s = '';
    if (h > 0) s += `${units[h]} Hundred `;
    if (rest > 0) s += convertTwoDigits(rest);
    return s.trim();
  };

  const crore = Math.floor(absAmount / 10000000);
  let remainder = absAmount % 10000000;
  const lakh = Math.floor(remainder / 100000);
  remainder = remainder % 100000;
  const thousand = Math.floor(remainder / 1000);
  const hundredPart = remainder % 1000;

  const parts: string[] = [];
  if (crore > 0) parts.push(`${convertTwoDigits(crore)} Crore`);
  if (lakh > 0) parts.push(`${convertTwoDigits(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${convertTwoDigits(thousand)} Thousand`);
  if (hundredPart > 0) parts.push(convertThreeDigits(hundredPart));

  return `Rupees ${parts.join(' ')} Only`.replace(/\s+/g, ' ').trim();
}

/**
 * Financial year for an ISO timestamp, e.g. '2025-26'. India follows April–March,
 * and the boundary is midnight IST — so the calendar date is read in Asia/Kolkata,
 * never UTC (31 Mar 23:30 UTC is already 1 Apr IST, i.e. the next FY).
 */
export function getFyForDate(isoDate: string): string {
  const d = new Date(isoDate);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const [yStr, mStr] = parts.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (m >= 4) return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  return `${y - 1}-${String(y % 100).padStart(2, '0')}`;
}

/**
 * Calendar day (YYYY-MM-DD) of an instant, read in Asia/Kolkata — the SAME
 * calendar the FY boundary uses above. 'en-CA' emits ISO-shaped output, so
 * zero-padded results compare correctly as plain strings. This is the
 * "today" that date pickers and past/future checks must agree on: UTC-based
 * `toISOString().split('T')[0]` shifts a day for UTC+ zones outside the UTC
 * window, and instant comparisons reject "today" when it is entered in the
 * IST morning (a date-only string parses as UTC midnight = 05:30 IST).
 */
export function kolkataCalendarDay(instant: string | Date): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * PCS-first display quantity for a piece-mapped product.
 * Ledger math always stays in primary units — this is display only: converts a
 * primary-unit total into its PCS equivalent, or null when unmapped (caller
 * renders the primary value as before). Unit codes render raw (universal).
 */
export function toPcsDisplayQty(
  mapping: PieceWeightMapping | null,
  primaryQty: number,
  primaryUnitId: string,
  productUnits: ProductUnit[]
): number | null {
  if (!mapping || !Number.isFinite(primaryQty)) return null;
  return convertQuantity(primaryQty, primaryUnitId, mapping.pcsUnitId, productUnits);
}

/**
 * Smart transfer-weight display for challans: kilograms once the weight hits
 * 1000 gram, grams below. Keeps challan lines readable (750 gram, not
 * 0.75 KG) while billing still works in KG.
 */
export function toDisplayWeight(totalGrams: number): { qty: number; unit: 'KG' | 'gram' } {
  if (!Number.isFinite(totalGrams)) return { qty: totalGrams, unit: 'gram' };
  if (totalGrams >= 1000) return { qty: roundCurrency(totalGrams / 1000), unit: 'KG' };
  return { qty: roundCurrency(totalGrams), unit: 'gram' };
}

/**
 * Next free plain document number ("1", "2", … — no prefix, no FY link).
 * Only all-digit numbers participate in the scan (legacy codes like "CH-501"
 * stay valid but never shift the plain sequence); the stored floor keeps
 * Settings edits meaningful; taken candidates are skipped so the result is
 * always free. Returns '' when nothing is free within the attempt cap.
 */
export function suggestNextPlainNumber(
  existingNumbers: string[],
  floor = 1,
  maxAttempts = 500
): string {
  let maxPlain = 0;
  for (const raw of existingNumbers) {
    const t = (raw || '').trim();
    if (!/^\d+$/.test(t)) continue;
    const n = Number(t);
    if (Number.isSafeInteger(n) && n > maxPlain) maxPlain = n;
  }
  let candidate = Math.max(Number.isInteger(floor) && floor > 0 ? floor : 1, maxPlain + 1);
  const taken = new Set(existingNumbers.map((s) => (s || '').trim().toUpperCase()).filter(Boolean));
  for (let i = 0; i < maxAttempts; i++) {
    if (!taken.has(String(candidate))) return String(candidate);
    candidate += 1;
  }
  return '';
}

/**
 * Piece-weight mapping ("enter PCS, weight comes automatically").
 *
 * A weight-billed product (primary unit GRAM or KG) is piece-mapped when it
 * carries a PCS row (conversion_to_primary = piece weight in PRIMARY units)
 * plus, for GRAM-primary products, a KG row (factor 1000) used for KG billing
 * and display. Challans are entered in PCS, stored in PCS, and billed in KG —
 * all conversions flow through convertQuantity().
 * Precision note: convertQuantity rounds to 2 decimals — exact in grams
 * (0.01 g) but 10 g steps in kilograms. GRAM primary is exact; KG primary
 * rounds stock to the nearest 10 g (warned in the UI, never blocked).
 */
export interface PieceWeightMapping {
  gramsPerPiece: number;
  pcsUnitId: string;
  kgUnitId: string;
}

/** Grams-per-piece validity: finite, positive, sane upper bound. */
export function isValidGramsPerPiece(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 1000000
  );
}

function findUnitIdByCode(
  uoms: Record<string, UnitOfMeasure>,
  code: string
): string | null {
  const needle = code.trim().toUpperCase();
  for (const u of Object.values(uoms)) {
    if ((u.code || '').trim().toUpperCase() === needle && u.is_active) {
      return u.id;
    }
  }
  return null;
}

/**
 * Resolve the piece-weight mapping for a product, or null when unmapped.
 * gramsPerPiece is always expressed in GRAMS (converted when primary is KG).
 * Pure over its inputs — the store selector delegates to this (unit-testable).
 */
export function getPieceWeightMapping(
  productUnits: ProductUnit[],
  uoms: Record<string, UnitOfMeasure>,
  primaryUnitId: string
): PieceWeightMapping | null {
  const primary = uoms[primaryUnitId];
  const primaryCode = (primary?.code || '').trim().toUpperCase();
  const primaryIsGram = primaryCode === 'GRAM';
  const primaryIsKg = primaryCode === 'KG';
  if (!primary || (!primaryIsGram && !primaryIsKg)) return null;
  const pcsUnitId = findUnitIdByCode(uoms, 'PCS');
  if (!pcsUnitId) return null;
  const pcsRow = productUnits.find((pu) => pu.unit_id === pcsUnitId);
  if (!pcsRow || !Number.isFinite(pcsRow.conversion_to_primary) || pcsRow.conversion_to_primary <= 0) {
    return null;
  }
  if (primaryIsKg) {
    // The primary row IS the KG row (factor 1, billing-flagged at creation).
    const primaryRow = productUnits.find((pu) => pu.unit_id === primaryUnitId);
    if (!primaryRow) return null;
    const grams = roundCurrency(pcsRow.conversion_to_primary * 1000);
    if (!isValidGramsPerPiece(grams)) return null;
    return { gramsPerPiece: grams, pcsUnitId, kgUnitId: primaryUnitId };
  }
  const kgUnitId = findUnitIdByCode(uoms, 'KG');
  if (!kgUnitId) return null;
  const kgRow = productUnits.find((pu) => pu.unit_id === kgUnitId);
  if (!kgRow || !Number.isFinite(kgRow.conversion_to_primary) || kgRow.conversion_to_primary <= 0) {
    return null;
  }
  if (!isValidGramsPerPiece(pcsRow.conversion_to_primary)) return null;
  return { gramsPerPiece: pcsRow.conversion_to_primary, pcsUnitId, kgUnitId };
}

/**
 * Next free plain customer number. Thin delegate — customer numbering IS plain
 * document-style numbering scoped to the customers table.
 */
export function suggestCustomerNumber(
  existingNumbers: string[],
  floor = 1,
  maxAttempts = 500
): string {
  return suggestNextPlainNumber(existingNumbers, floor, maxAttempts);
}

/**
 * Holdings-row billing state for consignment quick actions. A row is BILLED
 * only when something was actually billed and nothing billable remains — then
 * no Return is possible (billed goods can't come back as consignment returns)
 * and the row shows a Billed badge instead of action buttons.
 */
export function isHoldingsRowFullyBilled(billedQuantity: number, unbilledQuantity: number): boolean {
  return billedQuantity > 0 && unbilledQuantity <= 0;
}

export type MovementBillingStatus = 'BILLED' | 'PARTIAL' | 'UNBILLED';

/**
 * GST state-code lookup by state name (CBIC codes 01–38). Codes 26 and 28
 * are unassigned — no name maps to them.
 */
const GST_STATE_CODE_BY_STATE: Record<string, string> = {
  'jammu and kashmir': '01',
  'himachal pradesh': '02',
  punjab: '03',
  chandigarh: '04',
  uttarakhand: '05',
  haryana: '06',
  delhi: '07',
  rajasthan: '08',
  'uttar pradesh': '09',
  bihar: '10',
  sikkim: '11',
  'arunachal pradesh': '12',
  nagaland: '13',
  manipur: '14',
  mizoram: '15',
  tripura: '16',
  meghalaya: '17',
  assam: '18',
  'west bengal': '19',
  jharkhand: '20',
  odisha: '21',
  orissa: '21',
  chhattisgarh: '22',
  'madhya pradesh': '23',
  gujarat: '24',
  'dadra and nagar haveli and daman and diu': '25',
  'daman and diu': '25',
  'dadra and nagar haveli': '25',
  maharashtra: '27',
  karnataka: '29',
  goa: '30',
  lakshadweep: '31',
  kerala: '32',
  'tamil nadu': '33',
  puducherry: '34',
  pondicherry: '34',
  'andaman and nicobar islands': '35',
  telangana: '36',
  'andhra pradesh': '37',
  ladakh: '38',
};

/**
 * Customer GST state code, derived because the customers table no longer
 * stores one. Precedence is legally grounded, then compatible:
 * 1. GSTIN prefix — the first 2 digits of a valid GSTIN ARE the state code.
 * 2. State-name map above (covers unregistered customers).
 * 3. '24' default — preserves the historical fallback used across billing.
 */
export function getCustomerStateCode(customer: { gst_number?: string; state?: string }): string {
  const gst = (customer.gst_number || '').trim().toUpperCase();
  const prefix = /^(\d{2})[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.exec(gst)?.[1];
  if (prefix) return prefix;
  const mapped = GST_STATE_CODE_BY_STATE[(customer.state || '').trim().toLowerCase()];
  if (mapped) return mapped;
  return '24';
}

/**
 * Per-dispatch-movement billing status from allocated (non-cancelled) quantity.
 * Both quantities are in the movement's own unit, so direct comparison is valid.
 */
export function getMovementBillingStatus(
  movementQuantity: number,
  allocatedQuantity: number
): MovementBillingStatus {
  if (allocatedQuantity >= movementQuantity && movementQuantity > 0) return 'BILLED';
  if (allocatedQuantity > 0) return 'PARTIAL';
  return 'UNBILLED';
}

