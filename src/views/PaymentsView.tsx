import React, { useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { PaymentMethod } from '../types/database';
import { formatINR } from '../utils/calculations';
import {
  Plus,
  Search,
  AlertCircle
} from 'lucide-react';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { Alert, Button, Input, Label, PageHeader, SearchInput, Select, TableShell, Table, THead, TBody, TR, TH, TD } from '../components/ui';

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
      <PageHeader
        title="Payment Collections & Receipts"
        subtitle="Credit ledger postings • Overpayment invariant enforcement • Multi-mode remittances"
        actions={
          <>
            <SearchInput
              icon={<Search className="w-4 h-4" />}
              type="text"
              placeholder="Search reference # or customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Button variant="primary" size="md" onClick={handleOpenRecord}>
              <Plus className="w-3.5 h-3.5" />
              <span>Record Payment</span>
            </Button>
          </>
        }
      />

      {/* Payments Register Table */}
      <TableShell>
        <div className="overflow-x-auto">
          <Table className="text-left border-collapse">
            <caption className="sr-only">Payments register</caption>
            <THead>
              <TR className="hover:bg-transparent">
                <TH scope="col">Receipt Date</TH>
                <TH scope="col">Against Invoice</TH>
                <TH scope="col">Customer (Payer)</TH>
                <TH scope="col">Payment Method</TH>
                <TH scope="col">Reference / UTR</TH>
                <TH scope="col" className="text-right">Amount Collected</TH>
                <TH scope="col" className="text-center">Status</TH>
                <TH scope="col" className="text-right px-4">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filteredPayments.length === 0 ? (
                <tr>
                  <TD colSpan={8} className="py-8 text-center text-muted-foreground">
                    No payment collections recorded.
                  </TD>
                </tr>
              ) : (
                filteredPayments.map((pay) => {
                  const inv = invoices[pay.invoice_id];
                  const isCancelled = pay.status === 'CANCELLED';

                  return (
                    <TR key={pay.id} className="font-mono text-[11px]">
                      <TD className="text-muted-foreground">
                        {new Date(pay.payment_date).toLocaleDateString()}
                      </TD>

                      <TD className="font-semibold">
                        {inv ? (
                          <button
                            onClick={() => onOpenInvoice && onOpenInvoice(inv.id)}
                            className="hover:underline flex items-center gap-1 text-foreground font-bold"
                          >
                            <span>{inv.invoice_number}</span>
                          </button>
                        ) : (
                          'Unknown Invoice'
                        )}
                      </TD>

                      <TD className="font-sans">
                        {inv?.customer_snapshot?.customer_name || 'N/A'}
                      </TD>

                      <TD>
                        <Badge variant="neutral">{pay.payment_method}</Badge>
                      </TD>

                      <TD className="text-muted-foreground">
                        <div>{pay.reference_number || 'N/A'}</div>
                        {pay.notes && <div className="text-[10px] text-muted-foreground truncate max-w-xs">{pay.notes}</div>}
                      </TD>

                      <TD className="text-right font-bold text-emerald-800 dark:text-emerald-300">
                        <span className={isCancelled ? 'line-through text-muted-foreground' : ''}>
                          {formatINR(pay.amount)}
                        </span>
                      </TD>

                      <TD className="text-center">
                        <Badge variant={isCancelled ? 'danger' : 'success'}>
                          {pay.status}
                        </Badge>
                      </TD>

                      <TD className="text-right">
                        {!isCancelled && (
                          <Button variant="ghost" size="sm" onClick={() => handleCancelPayment(pay.id)} title="Reverse or cancel this payment">
                            Cancel
                          </Button>
                        )}
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
        </div>
      </TableShell>

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
            <Alert tone="destructive">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{paymentError}</span>
              </div>
            </Alert>
          )}

          <div>
            <Label className="block mb-1">
              Select Finalized Invoice with Outstanding Balance *
            </Label>
            <Select
              value={formInvoiceId}
              onChange={(e) => handleSelectInvoiceInForm(e.target.value)}
              className="w-full font-mono"
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
            </Select>
          </div>

          {selectedInvOutstanding && (
            <div className="p-3 bg-muted border border-border rounded font-mono text-[11px] grid grid-cols-2 gap-2">
              <div>
                <span className="text-muted-foreground">Invoice Total:</span>{' '}
                <span className="font-semibold text-foreground">
                  {formatINR(invoices[formInvoiceId]?.grand_total || 0)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Remaining Outstanding:</span>{' '}
                <span className="font-bold text-amber-800 dark:text-amber-300">
                  {formatINR(selectedInvOutstanding.outstanding)}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="block mb-1">Amount Received (₹) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={selectedInvOutstanding?.outstanding || undefined}
                required
                value={formAmount}
                onChange={(e) => setFormAmount(Number(e.target.value))}
                className="w-full font-mono font-bold"
              />
              <span className="text-[10px] text-muted-foreground">
                Rule 35: Overpayment &gt; outstanding is disallowed
              </span>
            </div>

            <div>
              <Label className="block mb-1">Payment Method</Label>
              <Select
                value={formMethod}
                onChange={(e) => setFormMethod(e.target.value as PaymentMethod)}
                className="w-full font-mono"
              >
                <option value="BANK_TRANSFER">BANK TRANSFER (NEFT/RTGS)</option>
                <option value="UPI">UPI (Unified Payments Interface)</option>
                <option value="CHEQUE">CHEQUE</option>
                <option value="CASH">CASH</option>
                <option value="OTHER">OTHER</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="block mb-1">Receipt Date</Label>
              <Input
                type="date"
                required
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full font-mono"
              />
            </div>

            <div>
              <Label className="block mb-1">Transaction Ref / UTR / Cheque #</Label>
              <Input
                type="text"
                required
                value={formReference}
                onChange={(e) => setFormReference(e.target.value)}
                className="w-full font-mono"
                placeholder="e.g. UTR-HDFC2601992"
              />
            </div>
          </div>

          <div>
            <Label className="block mb-1">Remittance Remarks / Notes</Label>
            <Input
              type="text"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              className="w-full"
              placeholder="e.g. RTGS settlement cleared from ICICI Bank"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsRecordModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Post Payment
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
