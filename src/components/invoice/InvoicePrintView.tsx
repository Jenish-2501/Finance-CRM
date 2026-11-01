import React, { useState, useMemo } from 'react';
import { Invoice, InvoiceItem, InvoicePayment, InvoiceCustomerInventoryAllocation } from '../../types/database';
import { useAccountingStore } from '../../store/accountingStore';
import { buildInvoiceModeDoc, invoiceDocFilename, docToBase64, InvoiceDocMode } from '../../utils/invoiceDocs';
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
  /** Which document the preview shows: the tax invoice, the challan ledger,
      or BOTH merged into one document. Defaults to the invoice. */
  mode?: InvoiceDocMode;
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
  mode = 'invoice',
  onClose,
  onFinalize,
  onCancel,
  onOpenPayment
}) => {
  const { t } = useT();
  const { customerInventoryMovements, uoms, getPieceWeightMapping, businessSettings, customers } = useAccountingStore();
  const activePayments = payments.filter((p) => p.status === 'ACTIVE');
  const totalPaid = activePayments.reduce((sum, p) => sum + p.amount, 0);
  const outstanding = invoice.status === 'CANCELLED' ? 0 : Math.max(0, invoice.grand_total - totalPaid);

  // The ONE document object behind preview, download and print — they cannot
  // drift apart because they are literally the same bytes. InvoicePrintView
  // (modal preview) and the Invoices table's direct actions share this builder.
  // Reactive slices stay in the dependency list so zustand updates re-render
  // and rebuild the document.
  const doc: jsPDF = useMemo(
    () => buildInvoiceModeDoc(invoice, items, payments, allocations, mode, useAccountingStore.getState()),
    [invoice, items, payments, allocations, mode, customerInventoryMovements, uoms, getPieceWeightMapping, businessSettings, customers]
  );

  const [downloading, setDownloading] = useState(false);
  const handleDownloadPDF = async () => {
    const filename = invoiceDocFilename(invoice, mode);
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

      {/* Printable document — the EXACT jsPDF output that Download saves and
          the printer receives. One source of truth: the on-screen preview,
          the saved file and the paper are the same bytes, so they can never
          drift apart. */}
      <PdfPreview
        doc={doc}
        ariaLabel={mode === 'ledger' ? `Challan ledger ${invoice.invoice_number}` : `Tax invoice ${invoice.invoice_number}`}
      />
    </div>
  );
};
