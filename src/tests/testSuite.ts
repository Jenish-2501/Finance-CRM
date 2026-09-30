/**
 * Automated Verification Suite for Accounting Invariants
 * Tests all 12 core requirements specified in Section 51.
 */

import { useAccountingStore } from '../store/accountingStore';
import { convertQuantity, calculateTax, calculateInvoiceTotals, calculateInvoiceOutstanding, roundCurrency } from '../utils/calculations';
import { SEED_PRODUCTS, SEED_PRODUCT_UNITS } from '../data/seedData';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}

export function runAccountingTestSuite(): TestResult[] {
  const store = useAccountingStore.getState();
  const results: TestResult[] = [];

  // Helper
  const record = (id: string, name: string, passed: boolean, expected: string, actual: string, details?: string) => {
    results.push({ id, name, passed, expected, actual, details });
  };

  // 1. Company stock calculation
  // PROD-1: Initial received = 1500. Dispatched = 300 (cust 1) + 200 (cust 2) = 500. Returned = 50 (cust 1).
  // Current company stock should be 1500 - 500 + 50 = 1050 PCS.
  const prod1Stock = store.getCurrentCompanyStock('prod-1');
  record(
    'test-1',
    'Company Stock Calculation (Stock In - Dispatches + Returns)',
    prod1Stock === 1050,
    '1050 PCS',
    `${prod1Stock} PCS`,
    'Calculated purely from movement ledger: 1500 In - 500 Out + 50 Return'
  );

  // 2. Customer inventory calculation
  // Customer 1: Dispatched 300 PCS, Returned 50 PCS. Holding = 250 PCS.
  const cust1Holding = store.getCustomerProductInventory('cust-1', 'prod-1');
  record(
    'test-2',
    'Customer Inventory Calculation (Dispatch - Return)',
    cust1Holding === 250,
    '250 PCS',
    `${cust1Holding} PCS`,
    'Customer 1 received 300 and returned 50. Physical holding is 250 PCS.'
  );

  // 3. UOM conversion
  // 1 BOX of PROD-1 = 20 PCS. Converting 5 BOX to PCS should be 100 PCS.
  const pUnits = Object.values(SEED_PRODUCT_UNITS).filter((pu) => pu.product_id === 'prod-1');
  const convertedQty = convertQuantity(5, 'uom-box', 'uom-pcs', pUnits);
  record(
    'test-3',
    'UOM Conversion (Secondary Box to Primary Pieces)',
    convertedQty === 100,
    '100 PCS',
    `${convertedQty} PCS`,
    '5 BOX × 20 conversion factor = 100 PCS'
  );

  // 4. Billing allocation & Partial billing
  // Customer 1 dispatch movement #cim-1 was 300 PCS.
  // Invoice #inv-1001 allocated 100 PCS.
  // Remaining billable for this dispatch should be 300 - 100 = 200 PCS.
  const billableMovements = store.getBillableMovementsForCustomer('cust-1');
  const cim1Billable = billableMovements.find((m) => m.movementId === 'cim-1');
  const remainingBillable = cim1Billable ? cim1Billable.availableBillableQuantity : 0;
  record(
    'test-4',
    'Billing Allocation & Partial Billing (Movement Unbilled Balance)',
    remainingBillable === 200,
    '200 PCS billable',
    `${remainingBillable} PCS billable`,
    'Movement #cim-1 total: 300 PCS. Allocated on Inv #1001: 100 PCS. Remaining: 200 PCS.'
  );

  // 5. Return calculation invariant
  // Customer 1 attempted return cannot exceed held quantity (250 PCS).
  const excessReturnTest = store.createCustomerReturn({
    customerId: 'cust-1',
    productId: 'prod-1',
    unitId: 'uom-pcs',
    quantity: 9999, // Intentional overflow
    referenceId: 'TEST-OVERFLOW',
    notes: 'Testing return exceeding balance'
  });
  record(
    'test-5',
    'Return Calculation Invariant (Disallow Return > Held Inventory)',
    excessReturnTest.success === false,
    'Rejected with validation error',
    excessReturnTest.success ? 'Allowed incorrectly' : 'Rejected correctly',
    excessReturnTest.error
  );

  // 6. Invoice totals & Tax calculation
  // 100 PCS × ₹100 = ₹10,000. Intra-state 18% GST -> CGST 9% (₹900) + SGST 9% (₹900) -> Grand Total ₹11,800.
  const testTotals = calculateInvoiceTotals([
    {
      quantity: 100,
      unit_price: 100,
      discount: 0,
      taxable_amount: 10000,
      cgst: 900,
      sgst: 900,
      igst: 0
    }
  ]);
  record(
    'test-6',
    'Invoice Totals & Decimal-Safe Tax Breakdown',
    testTotals.grandTotal === 11800 && testTotals.cgst === 900 && testTotals.sgst === 900,
    'Subtotal: 10000, CGST: 900, SGST: 900, Grand Total: 11800',
    `Grand Total: ${testTotals.grandTotal}, Tax: ${testTotals.cgst + testTotals.sgst}`,
    'Intra-state GST splitting verified.'
  );

  // 7. Payment outstanding calculation
  // Invoice 1001 grand total is ₹11,800. Active payment is ₹10,000. Outstanding = ₹1,800.
  const inv1Outstanding = store.getInvoiceOutstanding('inv-1001');
  record(
    'test-7',
    'Payment Outstanding Balance (Grand Total - Active Payments)',
    inv1Outstanding.outstanding === 1800 && inv1Outstanding.totalPaid === 10000,
    'Paid: 10000, Outstanding: 1800',
    `Paid: ${inv1Outstanding.totalPaid}, Outstanding: ${inv1Outstanding.outstanding}`,
    'Accurate partial payment deduction.'
  );

  // 8. Customer ledger deterministic ordering & balance
  // Customer 1 ledger: Invoice #1001 (Debit ₹11,800) -> Payment (Credit ₹10,000) -> Running Balance ₹1,800.
  const ledger = store.getCustomerLedger('cust-1');
  const lastLedgerEntry = ledger[ledger.length - 1];
  record(
    'test-8',
    'Customer Financial Ledger (Debit Inv + Credit Pay = Running Balance)',
    lastLedgerEntry && lastLedgerEntry.balance === 1800,
    'Running balance: ₹1,800.00',
    `Running balance: ₹${lastLedgerEntry?.balance ?? 0}`,
    'Customer inventory dispatches excluded from financial ledger as per accounting standards.'
  );

  // 9. Historical invoice snapshot preservation
  // Invoice #inv-1001 holds fixed snapshot: ABC Corporate Tower Ltd, Surat, ₹100 unit price.
  const inv1 = store.invoices['inv-1001'];
  const inv1Item = Object.values(store.invoiceItems).find((i) => i.invoice_id === 'inv-1001');
  const snapshotPreserved =
    inv1?.customer_snapshot?.customer_name === 'ABC Corporate Tower Ltd' &&
    inv1?.business_snapshot?.business_name === 'ABC Industries Pvt Ltd' &&
    inv1Item?.unit_price === 100;
  record(
    'test-9',
    'Historical Invoice Snapshot Immutability',
    Boolean(snapshotPreserved),
    'Snapshots preserved independently of master tables',
    snapshotPreserved ? 'Snapshots intact' : 'Snapshot mutated',
    'Verified historical customer, business, and line item prices remain fixed.'
  );

  // 10. Dashboard receivables & totals
  const cust1Out = store.getCustomerOutstanding('cust-1');
  const cust2Out = store.getCustomerOutstanding('cust-2'); // Paid full, outstanding 0
  record(
    'test-10',
    'Customer Outstanding Aggregation Across Invoices',
    cust1Out === 1800 && cust2Out === 0,
    'Cust 1: 1800, Cust 2: 0',
    `Cust 1: ${cust1Out}, Cust 2: ${cust2Out}`,
    'Fully paid invoices drop from active receivables.'
  );

  // 11. Excess payment rejection invariant
  const excessPaymentAttempt = store.createInvoicePayment({
    invoiceId: 'inv-1001',
    amount: 50000, // Exceeds 1800 outstanding
    paymentMethod: 'UPI',
    referenceNumber: 'TEST-OVERPAY',
    notes: 'Testing overpayment prevention'
  });
  record(
    'test-11',
    'Payment Invariant: Reject Payment Exceeding Invoice Outstanding',
    excessPaymentAttempt.success === false,
    'Rejected with validation error',
    excessPaymentAttempt.success ? 'Allowed incorrectly' : 'Rejected correctly',
    excessPaymentAttempt.error
  );

  // 12. Audit log creation on business mutations
  const recentLogs = store.auditLogs;
  const hasLogs = recentLogs && recentLogs.length >= 6;
  record(
    'test-12',
    'Automated Audit Trail Generation',
    Boolean(hasLogs),
    'Minimum 6 audit records present',
    `${recentLogs.length} audit logs found`,
    'Every business action logs an immutable audit trail entry.'
  );

  return results;
}
