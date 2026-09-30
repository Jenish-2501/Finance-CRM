/**
 * Precision Financial Calculations and UOM Conversion Utilities
 * Guaranteed decimal-safe math for accounting invariants.
 */

import {
  ProductUnit,
  InvoiceItem,
  InvoicePayment,
  BusinessSettings,
  Customer
} from '../types/database';

/**
 * Rounds a number to exactly 2 decimal places to avoid floating point drift.
 */
export function roundCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
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
  gstRate = 18,
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
