import React, { useState, useMemo } from 'react';
import { Invoice, InvoiceItem, InvoicePayment, InvoiceCustomerInventoryAllocation } from '../../types/database';
import { useAccountingStore } from '../../store/accountingStore';
import { formatINR, roundCurrency, toDisplayWeight } from '../../utils/calculations';
import { buildInvoicePdf, docToBase64 } from '../../utils/pdfDocuments';
import { Printer, X, CheckCircle, Download } from 'lucide-react';
import { Badge } from '../common/Badge';
import { PrintWatermark } from '../common/PrintWatermark';
import { Button, Toolbar } from '../ui';
import { useT } from '../../i18n';

interface InvoicePrintViewProps {
  invoice: Invoice;
  items: InvoiceItem[];
  payments: InvoicePayment[];
  allocations: InvoiceCustomerInventoryAllocation[];
  onClose?: () => void;
  onFinalize?: () => void;
  onCancel?: (reason: string) => void;
  onOpenPayment?: () => void;
}

export const InvoicePrintView: React.FC<InvoicePrintViewProps> = ({
  invoice,
  items,
  payments,
  allocations,
  onClose,
  onFinalize,
  onCancel,
  onOpenPayment
}) => {
  const { t } = useT();
  const { customerInventoryMovements, uoms, getPieceWeightMapping, businessSettings } = useAccountingStore();
  const activePayments = payments.filter((p) => p.status === 'ACTIVE');
  const totalPaid = activePayments.reduce((sum, p) => sum + p.amount, 0);
  const outstanding = invoice.status === 'CANCELLED' ? 0 : Math.max(0, invoice.grand_total - totalPaid);

  // Piece-mapped lines (KG/GRAM invoice line, PCS allocations): total PCS per
  // invoice item for the "(≈ N PCS)" reference inside the Qty column.
  // Only PCS-unit allocations count — a GRAM allocation behind a KG line is
  // weight, not pieces, and must never wear the PCS label.
  const pcsByItem = useMemo(() => {
    const out: Record<string, number> = {};
    for (const item of items) {
      let pcs = 0;
      for (const a of allocations) {
        const mov = customerInventoryMovements[a.customer_inventory_movement_id];
        if (!mov || mov.product_id !== item.product_id) continue;
        if (uoms[mov.unit_id]?.code !== 'PCS') continue;
        pcs = roundCurrency(pcs + a.allocated_quantity);
      }
      if (pcs > 0) out[item.id] = pcs;
    }
    return out;
  }, [items, allocations, customerInventoryMovements, uoms]);

  // Allocation audit lines grouped by challan (not raw movement ids):
  // "Challan #CH-501: 4 PCS (= 1 KG)". Shared by the preview and the PDF.
  const allocChallanLines = useMemo(() => {
    const groups = new Map<string, { ref: string; qty: number; unitCode: string; grams: number | null }>();
    for (const a of allocations) {
      const mov = customerInventoryMovements[a.customer_inventory_movement_id];
      if (!mov) continue;
      const unitCode = uoms[mov.unit_id]?.code || '';
      const key = `${mov.reference_id}::${mov.unit_id}`;
      const g = groups.get(key) || { ref: mov.reference_id, qty: 0, unitCode, grams: null as number | null };
      g.qty = roundCurrency(g.qty + a.allocated_quantity);
      const mapping = getPieceWeightMapping(mov.product_id);
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
  }, [allocations, customerInventoryMovements, uoms, getPieceWeightMapping]);

  const handlePrint = () => {
    window.print();
  };

  const [downloading, setDownloading] = useState(false);
  const handleDownloadPDF = async () => {
    const safeNumber = invoice.invoice_number.replace(/[^a-z0-9-_]+/gi, '-');
    const filename = `Invoice-${safeNumber}.pdf`;
    const doc = buildInvoicePdf({ invoice, items, payments, allocations, pcsRef: pcsByItem, allocationLines: allocChallanLines, logoDataUrl: businessSettings.logo_data ?? undefined });
    // Web fallback: direct jsPDF download. Electron: save dialog to chosen folder.
    if (!window.electronAPI?.files?.savePDFBytes) {
      doc.save(filename);
      return;
    }
    setDownloading(true);
    try {
      await window.electronAPI.files.savePDFBytes(filename, docToBase64(doc));
    } finally {
      setDownloading(false);
    }
  };

  const statusVariant = {
    DRAFT: 'warning' as const,
    FINALIZED: 'success' as const,
    CANCELLED: 'danger' as const
  };

  return (
    <div className="space-y-6">
      {/* Control bar (hidden during print) */}
      <Toolbar>
        <div className="flex items-center gap-3">
          <Badge variant={statusVariant[invoice.status]} size="md">
            {invoice.status}
          </Badge>
          <span className="text-xs text-muted-foreground font-mono">
            {t('printBar.invCreated', { number: invoice.invoice_number, date: new Date(invoice.created_at).toLocaleDateString() })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {invoice.status === 'DRAFT' && onFinalize && (
            <Button variant="success" size="sm" onClick={onFinalize}>
              <CheckCircle className="w-3.5 h-3.5" />
              {t('printBar.finalize')}
            </Button>
          )}

          {invoice.status === 'FINALIZED' && outstanding > 0 && onOpenPayment && (
            <Button variant="primary" size="sm" onClick={onOpenPayment}>
              {t('printBar.recordPayment')}
            </Button>
          )}

          {invoice.status !== 'CANCELLED' && onCancel && (
            <Button
              variant="destructive-outline"
              size="sm"
              onClick={() => {
                const reason = prompt(t('printBar.cancelReason'));
                if (reason) onCancel(reason);
              }}
            >
              {t('printBar.cancelInvoice')}
            </Button>
          )}

          <Button variant="primary" size="sm" onClick={handleDownloadPDF} disabled={downloading} aria-label={t('printBar.downloadPdfAria')} className="px-3.5">
            <Download className="w-4 h-4" aria-hidden="true" />
            {downloading ? t('printBar.preparingPdf') : t('printBar.downloadPdf')}
          </Button>

          <Button variant="secondary" size="sm" onClick={handlePrint} className="px-3.5">
            <Printer className="w-4 h-4 text-muted-foreground" />
            {t('printBar.print')}
          </Button>

          {onClose && (
            <Button variant="icon-ghost" size="icon" onClick={onClose} aria-label={t('printBar.closePreview')} title={t('printBar.closeTitle')}>
              <X className="w-5 h-5" aria-hidden="true" />
            </Button>
          )}
        </div>
      </Toolbar>

      {/* Actual Printable Invoice Container */}
      <div className="print-container bg-white border border-neutral-300 p-8 rounded-lg shadow-sm text-neutral-900 font-sans max-w-4xl mx-auto space-y-6">
        <PrintWatermark logoDataUrl={businessSettings.logo_data} />
        {/* Header: Company & Tax Invoice Title */}
        <div className="border-b-2 border-neutral-900 pb-5">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xl font-bold tracking-tight text-neutral-950 uppercase">
                {invoice.business_snapshot.business_name || invoice.business_snapshot.legal_name}
              </div>
              <div className="text-xs text-neutral-600 mt-1 max-w-sm leading-relaxed">
                {invoice.business_snapshot.address}, {invoice.business_snapshot.city},{' '}
                {invoice.business_snapshot.state} - {invoice.business_snapshot.postal_code},{' '}
                {invoice.business_snapshot.country}
              </div>
              <div className="text-xs font-mono text-neutral-700 mt-2 space-y-0.5">
                <div>
                  <span className="font-semibold text-neutral-900">GSTIN:</span>{' '}
                  {invoice.business_snapshot.gst_number}
                </div>
                <div>
                  <span className="font-semibold text-neutral-900">PAN:</span>{' '}
                  {invoice.business_snapshot.pan}
                </div>
                <div>
                  <span className="font-semibold text-neutral-900">Phone:</span>{' '}
                  {invoice.business_snapshot.phone} |{' '}
                  <span className="font-semibold text-neutral-900">Email:</span>{' '}
                  {invoice.business_snapshot.email}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="inline-block bg-neutral-900 text-white font-mono text-xs uppercase font-bold tracking-widest px-3 py-1 rounded">
                TAX INVOICE
              </div>
              <div className="mt-3 text-right font-mono space-y-1 text-xs">
                <div>
                  <span className="text-neutral-500">Invoice No:</span>{' '}
                  <span className="font-bold text-neutral-900 text-sm">{invoice.invoice_number}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Date:</span>{' '}
                  <span className="font-medium text-neutral-800">
                    {new Date(invoice.invoice_date).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500">Billing Period:</span>{' '}
                  <span className="text-neutral-800">
                    {invoice.billing_period_start} to {invoice.billing_period_end}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500">Place of Supply:</span>{' '}
                  <span className="font-medium text-neutral-800">
                    {invoice.customer_snapshot.state} (Code: {invoice.customer_snapshot.state_code})
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bill To & Dispatch Snapshot */}
        <div className="grid grid-cols-2 gap-6 bg-neutral-50 p-4 border border-neutral-200 rounded text-xs">
          <div>
            <div className="font-semibold text-neutral-500 uppercase tracking-wider text-[10px] mb-1">
              Billed To (Customer Snapshot):
            </div>
            <div className="font-bold text-sm text-neutral-950">
              {invoice.customer_snapshot.customer_name}
            </div>
            <div className="text-neutral-600 mt-1 leading-relaxed">
              {invoice.customer_snapshot.address}, {invoice.customer_snapshot.city},{' '}
              {invoice.customer_snapshot.state} - {invoice.customer_snapshot.postal_code},{' '}
              {invoice.customer_snapshot.country}
            </div>
            <div className="mt-2 font-mono text-neutral-700 space-y-0.5">
              <div>
                <span className="font-semibold text-neutral-900">GSTIN:</span>{' '}
                {invoice.customer_snapshot.gst_number || 'N/A / Unregistered'}
              </div>
              <div>
                <span className="font-semibold text-neutral-900">PAN:</span>{' '}
                {invoice.customer_snapshot.pan || 'N/A'}
              </div>
              <div>
                <span className="font-semibold text-neutral-900">Contact:</span>{' '}
                {invoice.customer_snapshot.mobile} | {invoice.customer_snapshot.email}
              </div>
            </div>
          </div>

          <div className="border-l border-neutral-200 pl-6">
            <div className="font-semibold text-neutral-500 uppercase tracking-wider text-[10px] mb-1">
              Inventory Allocation Audit Link:
            </div>
            <div className="text-neutral-600 leading-relaxed text-[11px]">
              Explicitly allocated against customer inventory movements:
            </div>
            <div className="mt-2 space-y-1">
              {allocations.length === 0 ? (
                <span className="text-neutral-400 italic">Direct billed / No explicit dispatch links</span>
              ) : (
                allocChallanLines.map((line, idx) => (
                  <div
                    key={idx}
                    className="bg-white px-2.5 py-1 border border-neutral-200 rounded font-mono text-[11px] text-neutral-600"
                  >
                    <span className="font-bold text-neutral-900">{line}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <caption className="sr-only">Invoice line items with GST breakdown</caption>
            <thead>
              <tr className="border-y-2 border-neutral-800 bg-neutral-100 font-mono text-neutral-700 text-[11px]">
                <th scope="col" className="py-2.5 px-2">#</th>
                <th scope="col" className="py-2.5 px-3">Item Description</th>
                <th scope="col" className="py-2.5 px-2">SKU</th>
                <th scope="col" className="py-2.5 px-2 text-right">Qty</th>
                <th scope="col" className="py-2.5 px-2 text-right">UOM</th>
                <th scope="col" className="py-2.5 px-3 text-right">Unit Price</th>
                <th scope="col" className="py-2.5 px-3 text-right">Taxable</th>
                <th scope="col" className="py-2.5 px-2 text-right">GST %</th>
                <th scope="col" className="py-2.5 px-3 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 font-sans">
              {items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-neutral-50/50">
                  <td className="py-2.5 px-2 font-mono text-neutral-500">{idx + 1}</td>
                  <td className="py-2.5 px-3 font-semibold text-neutral-900">
                    {item.product_name_snapshot}
                  </td>
                  <td className="py-2.5 px-2 font-mono text-neutral-500 text-[11px]">
                    {item.sku_snapshot}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono font-medium">
                    {item.quantity}
                    {pcsByItem[item.id] ? (
                      <span className="block text-[10px] font-normal text-neutral-500">
                        (≈ {pcsByItem[item.id]} PCS)
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-neutral-600">
                    {item.uom_snapshot}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono">
                    {formatINR(item.unit_price)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono">
                    {formatINR(item.taxable_amount)}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-neutral-600">
                    {item.gst_rate}%
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-neutral-950">
                    {formatINR(item.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Financial Summary & Bank Information */}
        <div className="grid grid-cols-12 gap-6 pt-4 border-t border-neutral-300">
          {/* Left: Bank Snapshot & Terms */}
          <div className="col-span-7 space-y-4">
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded text-xs space-y-1">
              <div className="font-semibold text-neutral-700 text-[11px] uppercase tracking-wide">
                Bank Remittance Details (Persisted Snapshot)
              </div>
              <div className="font-mono text-neutral-800 space-y-0.5 pt-1 text-[11px]">
                <div>
                  <span className="text-neutral-500">Bank Name:</span>{' '}
                  <span className="font-semibold">{invoice.bank_snapshot.bank_name}</span>
                </div>
                <div>
                  <span className="text-neutral-500">A/C Number:</span>{' '}
                  <span className="font-semibold">{invoice.bank_snapshot.bank_account_number}</span>
                </div>
                <div>
                  <span className="text-neutral-500">IFSC Code:</span>{' '}
                  <span className="font-semibold">{invoice.bank_snapshot.ifsc}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Branch:</span>{' '}
                  <span>{invoice.bank_snapshot.branch}</span>
                </div>
              </div>
            </div>

            {invoice.notes && (
              <div className="text-xs text-neutral-600 italic">
                <span className="font-semibold text-neutral-800 not-italic">Notes:</span>{' '}
                {invoice.notes}
              </div>
            )}
          </div>

          {/* Right: Tax breakdown & Grand Total */}
          <div className="col-span-5 space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-neutral-200">
              <span className="text-neutral-600">Taxable Amount:</span>
              <span className="font-mono font-medium">{formatINR(invoice.taxable_amount)}</span>
            </div>

            {invoice.cgst > 0 && (
              <div className="flex justify-between py-1 border-b border-neutral-200">
                <span className="text-neutral-600">CGST:</span>
                <span className="font-mono">{formatINR(invoice.cgst)}</span>
              </div>
            )}

            {invoice.sgst > 0 && (
              <div className="flex justify-between py-1 border-b border-neutral-200">
                <span className="text-neutral-600">SGST:</span>
                <span className="font-mono">{formatINR(invoice.sgst)}</span>
              </div>
            )}

            {invoice.igst > 0 && (
              <div className="flex justify-between py-1 border-b border-neutral-200">
                <span className="text-neutral-600">IGST (Inter-state):</span>
                <span className="font-mono">{formatINR(invoice.igst)}</span>
              </div>
            )}

            {invoice.other_charges > 0 && (
              <div className="flex justify-between py-1 border-b border-neutral-200">
                <span className="text-neutral-600">Other / Freight Charges:</span>
                <span className="font-mono">{formatINR(invoice.other_charges)}</span>
              </div>
            )}

            <div className="flex justify-between py-2 border-t-2 border-b-2 border-neutral-900 text-sm font-bold text-neutral-950">
              <span>Grand Total:</span>
              <span className="font-mono">{formatINR(invoice.grand_total)}</span>
            </div>

            <div className="pt-2 space-y-1 font-mono text-[11px]">
              <div className="flex justify-between text-emerald-800">
                <span>Total Amount Paid:</span>
                <span className="font-semibold">{formatINR(totalPaid)}</span>
              </div>
              <div className="flex justify-between text-neutral-900 text-xs font-bold pt-1 border-t border-neutral-200">
                <span>Outstanding Balance:</span>
                <span>{formatINR(outstanding)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Payments ledger summary for this invoice */}
        {activePayments.length > 0 && (
          <div className="pt-4 border-t border-neutral-200">
            <div className="text-[11px] font-semibold text-neutral-700 uppercase tracking-wide mb-2">
              Payment Receipts Applied Against This Invoice
            </div>
            <div className="space-y-1">
              {activePayments.map((p) => (
                <div
                  key={p.id}
                  className="flex justify-between items-center text-xs py-1.5 px-3 bg-neutral-50 border border-neutral-200 rounded font-mono"
                >
                  <span className="text-neutral-600">
                    {new Date(p.payment_date).toLocaleDateString()} • {p.payment_method} (Ref: #{p.reference_number})
                  </span>
                  <span className="font-bold text-emerald-800">{formatINR(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer sign-off */}
        <div className="pt-10 flex justify-between items-end text-xs text-neutral-500">
          <div>
            This is a computer generated invoice requiring no physical signature.
            <div className="text-[10px] font-mono text-neutral-400 mt-0.5">
              AccuLedger Enterprise Prototype • PostgreSQL Schema Contract
            </div>
          </div>
          <div className="text-center font-mono">
            <div className="h-10 border-b border-neutral-400 w-48 mb-1"></div>
            <div className="text-neutral-800 font-semibold">Authorised Signatory</div>
            <div className="text-[10px]">{invoice.business_snapshot.business_name}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
