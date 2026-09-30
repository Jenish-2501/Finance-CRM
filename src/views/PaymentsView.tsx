import React, { useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { PaymentMethod } from '../types/database';
import { formatINR, roundCurrency } from '../utils/calculations';
import {
  CreditCard,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  FileText,
  RotateCcw,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';

interface PaymentsViewProps {
  initialInvoiceId?: string | null;
  onOpenInvoice?: (invoiceId: string) => void;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  initialInvoiceId = null,
  onOpenInvoice
}) => {
  const {
    invoicePayments,
    invoices,
    customers,
    createInvoicePayment,
    cancelInvoicePayment,
    getInvoiceOutstanding
  } = useAccountingStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(Boolean(initialInvoiceId));
  const [paymentError, setPaymentError] = useState('');

  // Payment form state
  const [formInvoiceId, setFormInvoiceId] = useState<string>(initialInvoiceId || '');
  const [formAmount, setFormAmount] = useState<number>(0);
  const [formMethod, setFormMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formReference, setFormReference] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const finalizedInvoicesWithOutstanding = Object.values(invoices).filter((i) => {
    if (i.status !== 'FINALIZED') return false;
    const { outstanding } = getInvoiceOutstanding(i.id);
    return outstanding > 0;
  });

  // When selected invoice changes in the payment modal, auto-fill full remaining outstanding
  const handleSelectInvoiceInForm = (invId: string) => {
    setFormInvoiceId(invId);
    const { outstanding } = getInvoiceOutstanding(invId);
    setFormAmount(outstanding);
    setPaymentError('');
  };

  const handleOpenRecord = () => {
    setPaymentError('');
    const firstInv = finalizedInvoicesWithOutstanding[0];
    if (firstInv) {
      handleSelectInvoiceInForm(firstInv.id);
    } else {
      setFormInvoiceId('');
      setFormAmount(0);
    }
    setFormReference(`REF-${Math.floor(100000 + Math.random() * 900000)}`);
    setFormNotes('Payment receipt remittance');
    setIsRecordModalOpen(true);
  };

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError('');

    if (!formInvoiceId) {
      setPaymentError('Please select a finalized invoice.');
      return;
    }

    const res = createInvoicePayment({
      invoiceId: formInvoiceId,
      amount: Number(formAmount),
      paymentMethod: formMethod,
      referenceNumber: formReference.trim(),
      notes: formNotes.trim(),
      paymentDate: new Date(formDate).toISOString()
    });

    if (!res.success) {
      setPaymentError(res.error || 'Payment failed.');
    } else {
      setIsRecordModalOpen(false);
    }
  };

  const handleCancelPayment = (paymentId: string) => {
    const reason = prompt('Please enter reversal reason for audit trail:');
    if (reason) {
      cancelInvoicePayment(paymentId, reason);
    }
  };

  const allPayments = Object.values(invoicePayments).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const filteredPayments = allPayments.filter((p) => {
    const inv = invoices[p.invoice_id];
    const q = searchQuery.toLowerCase();
    return (
      p.reference_number.toLowerCase().includes(q) ||
      (inv && inv.invoice_number.toLowerCase().includes(q)) ||
      (inv && inv.customer_snapshot.customer_name.toLowerCase().includes(q))
    );
  });

  const selectedInvOutstanding = formInvoiceId ? getInvoiceOutstanding(formInvoiceId) : null;

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white border border-neutral-200 rounded-lg shadow-2xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-950">Payment Collections &amp; Receipts</h1>
          <p className="text-xs text-neutral-500 font-mono mt-0.5">
            Credit ledger postings • Overpayment invariant enforcement • Multi-mode remittances
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search reference # or customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs border border-neutral-300 rounded focus:ring-1 focus:ring-neutral-900 focus:outline-none w-64 bg-white"
            />
          </div>

          <button
            onClick={handleOpenRecord}
            className="px-3.5 py-1.5 text-xs font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Record Payment</span>
          </button>
        </div>
      </div>

      {/* Payments Register Table */}
      <div className="bg-white border border-neutral-200 rounded-lg shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/80 font-mono text-neutral-600 text-[11px]">
                <th className="py-3 px-4">Receipt Date</th>
                <th className="py-3 px-3">Against Invoice</th>
                <th className="py-3 px-3">Customer (Payer)</th>
                <th className="py-3 px-3">Payment Method</th>
                <th className="py-3 px-3">Reference / UTR</th>
                <th className="py-3 px-3 text-right">Amount Collected</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 font-sans">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-neutral-400">
                    No payment collections recorded.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((pay) => {
                  const inv = invoices[pay.invoice_id];
                  const isCancelled = pay.status === 'CANCELLED';

                  return (
                    <tr key={pay.id} className="hover:bg-neutral-50/70 font-mono text-[11px]">
                      <td className="py-3 px-4 text-neutral-500">
                        {new Date(pay.payment_date).toLocaleDateString()}
                      </td>

                      <td className="py-3 px-3 font-semibold text-neutral-900">
                        {inv ? (
                          <button
                            onClick={() => onOpenInvoice && onOpenInvoice(inv.id)}
                            className="hover:underline flex items-center gap-1 text-neutral-900 font-bold"
                          >
                            <span>{inv.invoice_number}</span>
                          </button>
                        ) : (
                          'Unknown Invoice'
                        )}
                      </td>

                      <td className="py-3 px-3 font-sans text-neutral-800">
                        {inv?.customer_snapshot?.customer_name || 'N/A'}
                      </td>

                      <td className="py-3 px-3">
                        <Badge variant="neutral">{pay.payment_method}</Badge>
                      </td>

                      <td className="py-3 px-3 text-neutral-600">
                        <div>{pay.reference_number || 'N/A'}</div>
                        {pay.notes && <div className="text-[10px] text-neutral-400 truncate max-w-xs">{pay.notes}</div>}
                      </td>

                      <td className="py-3 px-3 text-right font-bold text-emerald-800">
                        <span className={isCancelled ? 'line-through text-neutral-400' : ''}>
                          {formatINR(pay.amount)}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <Badge variant={isCancelled ? 'danger' : 'success'}>
                          {pay.status}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 text-right">
                        {!isCancelled && (
                          <button
                            onClick={() => handleCancelPayment(pay.id)}
                            className="text-neutral-400 hover:text-rose-600 font-medium font-sans text-xs"
                            title="Reverse or cancel this payment"
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Payment Modal */}
      <Modal
        isOpen={isRecordModalOpen}
        onClose={() => setIsRecordModalOpen(false)}
        title="Record Invoice Payment Collection"
        subtitle="Credits customer financial ledger and reduces invoice outstanding"
        maxWidth="lg"
      >
        <form onSubmit={handleSavePayment} className="space-y-4 text-xs">
          {paymentError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{paymentError}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-neutral-700 mb-1">
              Select Finalized Invoice with Outstanding Balance *
            </label>
            <select
              value={formInvoiceId}
              onChange={(e) => handleSelectInvoiceInForm(e.target.value)}
              className="w-full p-2 border border-neutral-300 rounded bg-white text-xs font-mono"
            >
              <option value="">-- Choose Invoice --</option>
              {finalizedInvoicesWithOutstanding.map((inv) => {
                const { outstanding } = getInvoiceOutstanding(inv.id);
                return (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoice_number} • {inv.customer_snapshot.customer_name} (Outstanding: {formatINR(outstanding)})
                  </option>
                );
              })}
            </select>
          </div>

          {selectedInvOutstanding && (
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded font-mono text-[11px] grid grid-cols-2 gap-2">
              <div>
                <span className="text-neutral-500">Invoice Total:</span>{' '}
                <span className="font-semibold text-neutral-900">
                  {formatINR(invoices[formInvoiceId]?.grand_total || 0)}
                </span>
              </div>
              <div>
                <span className="text-neutral-500">Remaining Outstanding:</span>{' '}
                <span className="font-bold text-amber-800">
                  {formatINR(selectedInvOutstanding.outstanding)}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">
                Amount Received (₹) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={selectedInvOutstanding?.outstanding || undefined}
                required
                value={formAmount}
                onChange={(e) => setFormAmount(Number(e.target.value))}
                className="w-full p-2 border border-neutral-300 rounded font-mono font-bold text-neutral-950"
              />
              <span className="text-[10px] text-neutral-400">
                Rule 35: Overpayment &gt; outstanding is disallowed
              </span>
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Payment Method</label>
              <select
                value={formMethod}
                onChange={(e) => setFormMethod(e.target.value as PaymentMethod)}
                className="w-full p-2 border border-neutral-300 rounded bg-white font-mono"
              >
                <option value="BANK_TRANSFER">BANK TRANSFER (NEFT/RTGS)</option>
                <option value="UPI">UPI (Unified Payments Interface)</option>
                <option value="CHEQUE">CHEQUE</option>
                <option value="CASH">CASH</option>
                <option value="OTHER">OTHER</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Receipt Date</label>
              <input
                type="date"
                required
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Transaction Ref / UTR / Cheque #</label>
              <input
                type="text"
                required
                value={formReference}
                onChange={(e) => setFormReference(e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded font-mono"
                placeholder="e.g. UTR-HDFC2601992"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-neutral-700 mb-1">Remittance Remarks / Notes</label>
            <input
              type="text"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              className="w-full p-2 border border-neutral-300 rounded"
              placeholder="e.g. RTGS settlement cleared from ICICI Bank"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => setIsRecordModalOpen(false)}
              className="px-3.5 py-1.5 text-neutral-700 border border-neutral-300 rounded hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800"
            >
              Post Payment
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
