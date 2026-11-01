import React, { useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { Invoice, InvoiceStatus } from '../types/database';
import { formatINR } from '../utils/calculations';
import { buildInvoiceModeDoc, invoiceDocFilename, docToBase64, InvoiceDocMode } from '../utils/invoiceDocs';
import {
  Search,
  Eye,
  Download,
  Printer,
  MoreVertical
} from 'lucide-react';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { Button, PageHeader, SearchInput, TableShell, Table, THead, TBody, TR, TH, TD } from '../components/ui';
import { InvoicePrintView } from '../components/invoice/InvoicePrintView';
import { useT } from '../i18n';

interface InvoicesViewProps {
  selectedInvoiceId?: string | null;
  onOpenPaymentModal?: (invoiceId: string) => void;
  onNavigateToBilling?: () => void;
}

// One row's action menu: document downloads/prints (challan ledger, tax
// invoice, or both merged) plus the Collect shortcut. A fixed transparent
// backdrop closes it on any outside click.
const InvoiceActionsCell: React.FC<{
  menuLabel: string;
  items: Array<{ key: string; label: string; icon: React.ReactNode; onClick: () => void }>;
}> = ({ menuLabel, items }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block text-left">
      <Button
        variant="secondary"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-label={menuLabel}
        aria-expanded={open}
        title={menuLabel}
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            className="absolute right-0 z-30 mt-1 w-60 rounded-md border border-border bg-card shadow-lg py-1 text-xs"
            role="menu"
          >
            {items.map((it) => (
              <button
                key={it.key}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted transition-colors"
              >
                {it.icon}
                <span>{it.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export const InvoicesView: React.FC<InvoicesViewProps> = ({
  selectedInvoiceId = null,
  onOpenPaymentModal,
  onNavigateToBilling
}) => {
  const { t } = useT();
  const {
    invoices,
    invoiceItems,
    invoiceAllocations,
    invoicePayments,
    finalizeInvoice,
    cancelInvoice,
    getInvoiceOutstanding
  } = useAccountingStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | InvoiceStatus>('ALL');
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(selectedInvoiceId);

  const allInvoices = Object.values(invoices).sort(
    (a, b) => new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime()
  );

  const filteredInvoices = allInvoices.filter((inv) => {
    const matchesSearch =
      inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.customer_snapshot.customer_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeInvoice = activeInvoiceId ? invoices[activeInvoiceId] : null;
  const activeItems = activeInvoiceId
    ? Object.values(invoiceItems).filter((i) => i.invoice_id === activeInvoiceId)
    : [];
  const activeAllocations = activeInvoiceId
    ? Object.values(invoiceAllocations).filter((a) => a.invoice_id === activeInvoiceId)
    : [];
  const activePayments = activeInvoiceId
    ? Object.values(invoicePayments).filter((p) => p.invoice_id === activeInvoiceId)
    : [];

  const handleFinalize = (id: string) => {
    finalizeInvoice(id);
  };

  const handleCancel = (id: string, reason: string) => {
    cancelInvoice(id, reason);
  };

  // Direct document actions — same builder/bytes as the preview modal.
  const buildDocFor = (inv: Invoice, mode: InvoiceDocMode) => {
    const state = useAccountingStore.getState();
    const items = Object.values(state.invoiceItems).filter((i) => i.invoice_id === inv.id);
    const pays = Object.values(state.invoicePayments).filter((p) => p.invoice_id === inv.id);
    const allocs = Object.values(state.invoiceAllocations).filter((a) => a.invoice_id === inv.id);
    return buildInvoiceModeDoc(inv, items, pays, allocs, mode, state);
  };

  const handleDownload = async (inv: Invoice, mode: InvoiceDocMode) => {
    const doc = buildDocFor(inv, mode);
    const filename = invoiceDocFilename(inv, mode);
    // Web fallback: direct jsPDF download. Electron: save dialog to chosen folder.
    if (!window.electronAPI?.files?.savePDFBytes) {
      doc.save(filename);
      return;
    }
    await window.electronAPI.files.savePDFBytes(filename, docToBase64(doc));
  };

  const handlePrint = async (inv: Invoice, mode: InvoiceDocMode) => {
    const doc = buildDocFor(inv, mode);
    if (!window.electronAPI?.printing) {
      window.print();
      return;
    }
    await window.electronAPI.printing.printPdf({ pdfBase64: docToBase64(doc), silent: false });
  };

  const menuItemsFor = (inv: Invoice, outstanding: number) => {
    return [
      {
        key: 'dl-ledger',
        label: t('invoices.dlLedger'),
        icon: <Download className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />,
        onClick: () => void handleDownload(inv, 'ledger')
      },
      {
        key: 'dl-invoice',
        label: t('invoices.dlInvoice'),
        icon: <Download className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />,
        onClick: () => void handleDownload(inv, 'invoice')
      },
      {
        key: 'dl-both',
        label: t('invoices.dlBoth'),
        icon: <Download className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />,
        onClick: () => void handleDownload(inv, 'both')
      },
      {
        key: 'pr-ledger',
        label: t('invoices.prLedger'),
        icon: <Printer className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />,
        onClick: () => void handlePrint(inv, 'ledger')
      },
      {
        key: 'pr-invoice',
        label: t('invoices.prInvoice'),
        icon: <Printer className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />,
        onClick: () => void handlePrint(inv, 'invoice')
      },
      {
        key: 'pr-both',
        label: t('invoices.prBoth'),
        icon: <Printer className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />,
        onClick: () => void handlePrint(inv, 'both')
      },
      ...(inv.status === 'FINALIZED' && outstanding > 0 && onOpenPaymentModal
        ? [
            {
              key: 'collect',
              label: t('invoices.collect'),
              icon: <span className="w-3.5 text-center font-mono font-bold" aria-hidden="true">₹</span>,
              onClick: () => onOpenPaymentModal(inv.id)
            }
          ]
        : [])
    ];
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <PageHeader
        title={t('invoices.title')}
        subtitle={t('invoices.subtitle')}
        actions={
          <>
            <SearchInput
              icon={<Search className="w-4 h-4" />}
              type="text"
              placeholder={t('invoices.searchPh')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="flex items-center border border-input rounded-md bg-card p-0.5 text-xs font-mono">
              {(['ALL', 'FINALIZED', 'DRAFT', 'CANCELLED'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    statusFilter === st
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
            {onNavigateToBilling && (
              <Button variant="primary" size="md" onClick={onNavigateToBilling}>
                {t('invoices.create')}
              </Button>
            )}
          </>
        }
      />

      {/* Invoices Table */}
      <TableShell>
        <div className="overflow-x-auto">
          <Table className="text-left border-collapse">
            <caption className="sr-only">{t('invoices.caption')}</caption>
            <THead>
              <TR className="hover:bg-transparent">
                <TH scope="col" className="py-3">{t('invoices.thNumber')}</TH>
                <TH scope="col">{t('invoices.thDate')}</TH>
                <TH scope="col">{t('invoices.thCustomer')}</TH>
                <TH scope="col">{t('invoices.thStatus')}</TH>
                <TH scope="col" className="text-right">{t('invoices.thGrand')}</TH>
                <TH scope="col" className="text-right">{t('invoices.thPaid')}</TH>
                <TH scope="col" className="text-right">{t('invoices.thOutstanding')}</TH>
                <TH scope="col" className="text-right px-4">{t('invoices.thActions')}</TH>
              </TR>
            </THead>
            <TBody>
              {filteredInvoices.length === 0 ? (
                <tr>
                  <TD colSpan={8} className="py-8 text-center text-muted-foreground">
                    {t('invoices.empty')}
                  </TD>
                </tr>
              ) : (
                filteredInvoices.map((inv) => {
                  const { totalPaid, outstanding } = getInvoiceOutstanding(inv.id);
                  const statusVariant = {
                    DRAFT: 'warning' as const,
                    FINALIZED: 'success' as const,
                    CANCELLED: 'danger' as const
                  };

                  return (
                    <TR
                      key={inv.id}
                      className="group cursor-pointer"
                      onClick={() => setActiveInvoiceId(inv.id)}
                    >
                      <TD className="font-mono font-bold group-hover:text-foreground">
                        {inv.invoice_number}
                      </TD>

                      <TD className="font-mono text-muted-foreground text-[11px]">
                        {new Date(inv.invoice_date).toLocaleDateString()}
                      </TD>

                      <TD>
                        <div className="font-semibold text-foreground">
                          {inv.customer_snapshot.customer_name}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground">
                          GST: {inv.customer_snapshot.gst_number || 'Unregistered'}
                        </div>
                      </TD>

                      <TD>
                        <Badge variant={statusVariant[inv.status]}>{inv.status}</Badge>
                      </TD>

                      <TD className="text-right font-mono font-bold">
                        {formatINR(inv.grand_total)}
                      </TD>

                      <TD className="text-right font-mono text-emerald-800 dark:text-emerald-300">
                        {formatINR(totalPaid)}
                      </TD>

                      <TD className="text-right font-mono font-bold">
                        <span
                          className={
                            inv.status === 'CANCELLED'
                              ? 'text-muted-foreground line-through'
                              : outstanding > 0
                              ? 'text-amber-800 dark:text-amber-300'
                              : 'text-emerald-800 dark:text-emerald-300'
                          }
                        >
                          {formatINR(outstanding)}
                        </span>
                      </TD>

                      <TD className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="icon"
                            onClick={() => setActiveInvoiceId(inv.id)}
                            title={t('invoices.view')}
                            aria-label={t('invoices.view')}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>

                          <InvoiceActionsCell
                            menuLabel={t('invoices.actionsMenu')}
                            items={menuItemsFor(inv, outstanding)}
                          />
                        </div>
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
        </div>
      </TableShell>

      {/* Invoice Full Detail & Printable View Modal */}
      {activeInvoice && (
        <Modal
          isOpen={Boolean(activeInvoiceId)}
          onClose={() => setActiveInvoiceId(null)}
          title={t('invoices.modalTitle', { number: activeInvoice.invoice_number })}
          subtitle={t('invoices.modalSubtitle', { name: activeInvoice.customer_snapshot.customer_name })}
          maxWidth="full"
        >
          <InvoicePrintView
            invoice={activeInvoice}
            items={activeItems}
            payments={activePayments}
            allocations={activeAllocations}
            onClose={() => setActiveInvoiceId(null)}
            onFinalize={() => handleFinalize(activeInvoice.id)}
            onCancel={(reason) => handleCancel(activeInvoice.id, reason)}
            onOpenPayment={
              onOpenPaymentModal
                ? () => {
                    const id = activeInvoice.id;
                    setActiveInvoiceId(null);
                    onOpenPaymentModal(id);
                  }
                : undefined
            }
          />
        </Modal>
      )}
    </div>
  );
};
