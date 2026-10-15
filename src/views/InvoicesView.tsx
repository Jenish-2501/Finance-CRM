import React, { useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { InvoiceStatus } from '../types/database';
import { formatINR } from '../utils/calculations';
import {
  Search,
  Eye
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
                            title={t('invoices.preview')}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>

                          {inv.status === 'FINALIZED' && outstanding > 0 && onOpenPaymentModal && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => onOpenPaymentModal(inv.id)}
                              title={t('invoices.collectTitle')}
                              className="text-[11px] px-2 py-1"
                            >
                              {t('invoices.collect')}
                            </Button>
                          )}
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
