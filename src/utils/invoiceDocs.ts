// ---------------------------------------------------------------------------
// Invoice document assembly — ONE source of truth for every exit path
// (print-preview modal, table download actions, table print actions), so the
// bytes can never drift apart between them.
//
// mode 'invoice' → the tax invoice (allocation annex included)
// mode 'ledger'  → the challan ledger (per-invoice justification sheet)
// mode 'both'    → ONE merged document: ledger pages first, invoice appended
// ---------------------------------------------------------------------------
import type jsPDF from 'jspdf';
import { Invoice, InvoiceItem, InvoicePayment, InvoiceCustomerInventoryAllocation } from '../types/database';
import { useAccountingStore } from '../store/accountingStore';
import { roundCurrency, toDisplayWeight } from './calculations';
import { buildInvoicePdf, buildInvoiceLedgerPdf, buildInvoiceWithLedgerPdf, docToBase64 } from './pdfDocuments';
import { buildInvoiceLedgerModel } from './invoiceLedger';

export type InvoiceDocMode = 'invoice' | 'ledger' | 'both';

type StoreState = ReturnType<typeof useAccountingStore.getState>;

/** Allocation annex lines grouped per challan: "Challan #CH-501: 4 PCS (= 1 KG)". */
export function invoiceAllocChallanLines(
  allocations: InvoiceCustomerInventoryAllocation[],
  state: Pick<StoreState, 'customerInventoryMovements' | 'uoms' | 'getPieceWeightMapping'>
): string[] {
  const groups = new Map<string, { ref: string; qty: number; unitCode: string; grams: number | null }>();
  for (const a of allocations) {
    const mov = state.customerInventoryMovements[a.customer_inventory_movement_id];
    if (!mov) continue;
    const unitCode = state.uoms[mov.unit_id]?.code || '';
    const key = `${mov.reference_id}::${mov.unit_id}`;
    const g = groups.get(key) || { ref: mov.reference_id, qty: 0, unitCode, grams: null as number | null };
    g.qty = roundCurrency(g.qty + a.allocated_quantity);
    const mapping = state.getPieceWeightMapping(mov.product_id);
    if (mapping && mov.unit_id === mapping.pcsUnitId) {
      g.grams = roundCurrency((g.grams ?? 0) + a.allocated_quantity * mapping.gramsPerPiece);
    }
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => {
    const base = `Challan #${g.ref}: ${g.qty}${g.unitCode ? ` ${g.unitCode}` : ''}`;
    if (g.grams === null) return base;
    const w = toDisplayWeight(g.grams);
    return `${base} (= ${w.qty} ${w.unit})`;
  });
}

export function buildInvoiceModeDoc(
  invoice: Invoice,
  items: InvoiceItem[],
  payments: InvoicePayment[],
  allocations: InvoiceCustomerInventoryAllocation[],
  mode: InvoiceDocMode,
  state: StoreState
): jsPDF {
  // Gujarati nickname under the legal name: frozen snapshot first, live
  // master record as fallback for invoices billed before it was captured.
  const customerGuName =
    invoice.customer_snapshot.gujarati_name?.trim() ||
    state.customers[invoice.customer_id]?.gujarati_name?.trim() ||
    '';
  const logoDataUrl = state.businessSettings.logo_data ?? undefined;

  const invoiceInput = {
    invoice,
    items,
    payments,
    allocations,
    allocationLines: invoiceAllocChallanLines(allocations, state),
    logoDataUrl,
    customerGujaratiName: customerGuName || undefined
  };

  if (mode === 'invoice') return buildInvoicePdf(invoiceInput);

  const ledgerInput = {
    model: buildInvoiceLedgerModel({
      invoice,
      items,
      allocations,
      movements: state.customerInventoryMovements,
      products: state.products,
      uoms: state.uoms,
      productUnits: state.productUnits,
      getPieceWeightMapping: state.getPieceWeightMapping
    }),
    invoice,
    business: state.businessSettings,
    customerMeta: [
      invoice.customer_snapshot.gst_number ? `GSTIN: ${invoice.customer_snapshot.gst_number}` : '',
      invoice.customer_snapshot.mobile ? `Mobile: ${invoice.customer_snapshot.mobile}` : '',
      invoice.customer_snapshot.city || ''
    ].filter(Boolean).join('  |  '),
    customerGujaratiName: customerGuName || undefined,
    logoDataUrl
  };

  if (mode === 'ledger') return buildInvoiceLedgerPdf(ledgerInput);
  return buildInvoiceWithLedgerPdf(ledgerInput, invoiceInput);
}

export function invoiceDocFilename(invoice: Invoice, mode: InvoiceDocMode): string {
  const safeNumber = invoice.invoice_number.replace(/[^a-z0-9-_]+/gi, '-');
  if (mode === 'ledger') return `ChallanLedger-${safeNumber}.pdf`;
  if (mode === 'both') return `Invoice-Ledger-${safeNumber}.pdf`;
  return `Invoice-${safeNumber}.pdf`;
}

export { docToBase64 };
