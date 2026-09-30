import React, { useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { Invoice, InvoiceStatus } from '../types/database';
import { formatINR } from '../utils/calculations';
import {
  FileText,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Printer,
  CreditCard,
  Building,
  ArrowRight,
  Eye
} from 'lucide-react';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { InvoicePrintView } from '../components/invoice/InvoicePrintView';

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white border border-neutral-200 rounded-lg shadow-2xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-950">Invoices &amp; Tax Register</h1>
          <p className="text-xs text-neutral-500 font-mono mt-0.5">
            Immutable snapshot preservation • Multi-tier GST taxation • Real-time receivables reconciliation
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search invoice # or customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs border border-neutral-300 rounded focus:ring-1 focus:ring-neutral-900 focus:outline-none w-64 bg-white"
            />
          </div>

          <div className="flex items-center border border-neutral-300 rounded bg-white p-0.5 text-xs font-mono">
            {(['ALL', 'FINALIZED', 'DRAFT', 'CANCELLED'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded transition-colors ${
                  statusFilter === st
                    ? 'bg-neutral-900 text-white font-semibold'
                    : 'text-neutral-600 hover:text-neutral-950'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {onNavigateToBilling && (
            <button
              onClick={onNavigateToBilling}
              className="px-3.5 py-1.5 text-xs font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors shadow-2xs"
            >
              + Create Invoice
            </button>
          )}
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white border border-neutral-200 rounded-lg shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/80 font-mono text-neutral-600 text-[11px]">
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Billed Customer (Snapshot)</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3 text-right">Grand Total</th>
                <th className="py-3 px-3 text-right">Amount Paid</th>
                <th className="py-3 px-3 text-right">Outstanding</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 font-sans">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-neutral-400">
                    No invoices match the selected filter.
                  </td>
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
                    <tr
                      key={inv.id}
                      className="hover:bg-neutral-50/70 transition-colors group cursor-pointer"
                      onClick={() => setActiveInvoiceId(inv.id)}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-neutral-900 group-hover:text-black">
                        {inv.invoice_number}
                      </td>

                      <td className="py-3 px-3 font-mono text-neutral-500 text-[11px]">
                        {new Date(inv.invoice_date).toLocaleDateString()}
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-semibold text-neutral-900">
                          {inv.customer_snapshot.customer_name}
                        </div>
                        <div className="text-[10px] font-mono text-neutral-400">
                          GST: {inv.customer_snapshot.gst_number || 'Unregistered'}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <Badge variant={statusVariant[inv.status]}>{inv.status}</Badge>
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold text-neutral-950">
                        {formatINR(inv.grand_total)}
                      </td>

                      <td className="py-3 px-3 text-right font-mono text-emerald-800">
                        {formatINR(totalPaid)}
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold">
                        <span
                          className={
                            inv.status === 'CANCELLED'
                              ? 'text-neutral-400 line-through'
                              : outstanding > 0
                              ? 'text-amber-800'
                              : 'text-emerald-800'
                          }
                        >
                          {formatINR(outstanding)}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setActiveInvoiceId(inv.id)}
                            className="p-1 text-neutral-600 hover:text-neutral-900 border border-neutral-300 rounded bg-white hover:bg-neutral-100"
                            title="Preview / Print Tax Invoice"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {inv.status === 'FINALIZED' && outstanding > 0 && onOpenPaymentModal && (
                            <button
                              onClick={() => onOpenPaymentModal(inv.id)}
                              className="px-2 py-1 text-[11px] font-medium bg-neutral-900 text-white rounded hover:bg-neutral-800"
                              title="Record payment collection"
                            >
                              Collect
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Full Detail & Printable View Modal */}
      {activeInvoice && (
        <Modal
          isOpen={Boolean(activeInvoiceId)}
          onClose={() => setActiveInvoiceId(null)}
          title={`Tax Invoice: ${activeInvoice.invoice_number}`}
          subtitle={`Immutable Snapshot Data • Customer: ${activeInvoice.customer_snapshot.customer_name}`}
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
