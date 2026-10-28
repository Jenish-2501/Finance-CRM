import React, { useState, useMemo } from 'react';
import { Invoice, InvoiceItem, InvoicePayment, InvoiceCustomerInventoryAllocation } from '../../types/database';
import { useAccountingStore } from '../../store/accountingStore';
import { roundCurrency, toDisplayWeight } from '../../utils/calculations';
import { buildInvoicePdf, docToBase64 } from '../../utils/pdfDocuments';
import type jsPDF from 'jspdf';
import { Printer, X, CheckCircle, Download } from 'lucide-react';
import { Badge } from '../common/Badge';
import { PdfPreview } from '../common/PdfPreview';
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
  const { customerInventoryMovements, uoms, getPieceWeightMapping, businessSettings, customers } = useAccountingStore();
  // Gujarati nickname under the legal name: frozen snapshot first, live
  // master record as fallback for invoices billed before it was captured.
  const customerGuName =
    invoice.customer_snapshot.gujarati_name?.trim() ||
    customers[invoice.customer_id]?.gujarati_name?.trim() ||
    '';
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

  // The ONE document object behind preview, download and print — they cannot
  // drift apart because they are literally the same bytes.
  const doc: jsPDF = useMemo(
    () => buildInvoicePdf({
      invoice,
      items,
      payments,
      allocations,
      pcsRef: pcsByItem,
      allocationLines: allocChallanLines,
      logoDataUrl: businessSettings.logo_data ?? undefined,
      customerGujaratiName: customerGuName || undefined
    }),
    [invoice, items, payments, allocations, pcsByItem, allocChallanLines, businessSettings, customerGuName]
  );

  const [downloading, setDownloading] = useState(false);
  const handleDownloadPDF = async () => {
    const safeNumber = invoice.invoice_number.replace(/[^a-z0-9-_]+/gi, '-');
    const filename = `Invoice-${safeNumber}.pdf`;
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

  // Prints the preview's exact PDF bytes (the main process renders the PDF
  // itself in a hidden window — the paper matches the preview 1:1).
  // No desktop shell: system print of the embedded PDF page.
  const handlePrint = async () => {
    if (!window.electronAPI?.printing) {
      window.print();
      return;
    }
    await window.electronAPI.printing.printPdf({ pdfBase64: docToBase64(doc), silent: false });
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

      {/* Printable Invoice — the EXACT jsPDF output that Download saves and
          the printer receives. One source of truth: the on-screen preview,
          the saved file and the paper are the same bytes, so they can never
          drift apart. */}
      <PdfPreview
        doc={doc}
        ariaLabel={`Tax invoice ${invoice.invoice_number}`}
      />
    </div>
  );
};
