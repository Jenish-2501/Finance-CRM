import React, { useEffect, useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { PaymentMethod } from '../types/database';
import { formatINR, roundCurrency, kolkataCalendarDay } from '../utils/calculations';
import {
  Plus,
  Search,
  AlertCircle
} from 'lucide-react';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { Alert, Button, Input, Label, PageHeader, SearchInput, Select, TableShell, Table, THead, TBody, TR, TH, TD } from '../components/ui';
import { useT } from '../i18n';

interface PaymentsViewProps {
  initialInvoiceId?: string | null;
  onOpenInvoice?: (invoiceId: string) => void;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  initialInvoiceId = null,
  onOpenInvoice
}) => {
  const { t } = useT();
  const {
    invoicePayments,
    invoices,
    createInvoicePayment,
    cancelInvoicePayment,
    getInvoiceOutstanding,
    getCustomerReturnCredit
  } = useAccountingStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(Boolean(initialInvoiceId));
  const [paymentError, setPaymentError] = useState('');

  // Payment form state
  const [formInvoiceId, setFormInvoiceId] = useState<string>(initialInvoiceId || '');
  const [formAmount, setFormAmount] = useState<number>(0);
  const [formMethod, setFormMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [formDate, setFormDate] = useState(kolkataCalendarDay(new Date()));
  const [formReference, setFormReference] = useState('');
  const [formNotes, setFormNotes] = useState('');
  // Return credit auto-used inside the payment modal: prefilled with
  // min(customer's unspent credit, outstanding) when the invoice changes;
  // cash auto-covers the remainder while the cash field is untouched.
  const [formUseCredit, setFormUseCredit] = useState(0);

  const finalizedInvoicesWithOutstanding = Object.values(invoices).filter((i) => {
    if (i.status !== 'FINALIZED') return false;
    const { outstanding } = getInvoiceOutstanding(i.id);
    return outstanding > 0;
  });

  // When selected invoice changes in the payment modal, auto-fill full
  // remaining outstanding — split into return credit (up to the customer's
  // unspent balance) and cash for the rest.
  const handleSelectInvoiceInForm = (invId: string) => {
    setFormInvoiceId(invId);
    const { outstanding } = getInvoiceOutstanding(invId);
    const inv = invoices[invId];
    const credit = inv ? getCustomerReturnCredit(inv.customer_id) : 0;
    const useCredit = roundCurrency(Math.min(credit, outstanding));
    setFormUseCredit(useCredit);
    setFormAmount(roundCurrency(outstanding - useCredit));
    setPaymentError('');
  };

  // Editing the credit keeps cash = outstanding − credit as long as the cash
  // field itself hasn't been hand-edited away from the synced value.
  const handleUseCreditChange = (val: number) => {
    const next = roundCurrency(Math.max(0, val));
    const prev = formUseCredit;
    setFormUseCredit(next);
    if (selectedInvOutstanding && formAmount === roundCurrency(selectedInvOutstanding.outstanding - prev)) {
      setFormAmount(roundCurrency(selectedInvOutstanding.outstanding - next));
    }
  };

  // Prefill whenever the modal opens or the selected invoice changes — this
  // also covers the Collect path (initialInvoiceId), which never fires the
  // select's onChange.
  useEffect(() => {
    if (!isRecordModalOpen || !formInvoiceId) return;
    const { outstanding } = getInvoiceOutstanding(formInvoiceId);
    const inv = invoices[formInvoiceId];
    const credit = inv ? getCustomerReturnCredit(inv.customer_id) : 0;
    const useCredit = roundCurrency(Math.min(credit, outstanding));
    setFormUseCredit(useCredit);
    setFormAmount(roundCurrency(outstanding - useCredit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecordModalOpen, formInvoiceId]);

  const handleOpenRecord = () => {
    setPaymentError('');
    const firstInv = finalizedInvoicesWithOutstanding[0];
    if (firstInv) {
      handleSelectInvoiceInForm(firstInv.id);
    } else {
      setFormInvoiceId('');
      setFormAmount(0);
      setFormUseCredit(0);
    }
    setFormReference(`REF-${Math.floor(100000 + Math.random() * 900000)}`);
    setFormNotes('Payment receipt remittance');
    setIsRecordModalOpen(true);
  };

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError('');

    if (!formInvoiceId) {
      setPaymentError(t('payments.errNoInvoice'));
      return;
    }

    const res = createInvoicePayment({
      invoiceId: formInvoiceId,
      amount: Number(formAmount),
      paymentMethod: formMethod,
      referenceNumber: formReference.trim(),
      notes: formNotes.trim(),
      paymentDate: new Date(formDate).toISOString(),
      returnCredit: formUseCredit > 0 ? Number(formUseCredit) : undefined
    });

    if (!res.success) {
      setPaymentError(res.error || t('payments.errFailed'));
    } else {
      setIsRecordModalOpen(false);
    }
  };

  const handleCancelPayment = (paymentId: string) => {
    const reason = prompt(t('payments.reverseReason'));
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
  const selectedCredit = formInvoiceId && invoices[formInvoiceId]
    ? getCustomerReturnCredit(invoices[formInvoiceId].customer_id)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <PageHeader
        title={t('payments.title')}
        actions={
          <>
            <SearchInput
              icon={<Search className="w-4 h-4" />}
              type="text"
              placeholder={t('payments.searchPh')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Button variant="primary" size="md" onClick={handleOpenRecord}>
              <Plus className="w-3.5 h-3.5" />
              <span>{t('payments.record')}</span>
            </Button>
          </>
        }
      />

      {/* Payments Register Table */}
      <TableShell>
        <div className="overflow-x-auto">
          <Table className="text-left border-collapse">
            <caption className="sr-only">{t('payments.caption')}</caption>
            <THead>
              <TR className="hover:bg-transparent">
                <TH scope="col">{t('payments.thDate')}</TH>
                <TH scope="col">{t('payments.thInvoice')}</TH>
                <TH scope="col">{t('payments.thCustomer')}</TH>
                <TH scope="col">{t('payments.thMethod')}</TH>
                <TH scope="col">{t('payments.thRef')}</TH>
                <TH scope="col" className="text-right">{t('payments.thAmount')}</TH>
                <TH scope="col" className="text-center">{t('payments.thStatus')}</TH>
                <TH scope="col" className="text-right px-4">{t('payments.thActions')}</TH>
              </TR>
            </THead>
            <TBody>
              {filteredPayments.length === 0 ? (
                <tr>
                  <TD colSpan={8} className="py-8 text-center text-muted-foreground">
                    {t('payments.empty')}
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
                          t('payments.unknownInvoice')
                        )}
                      </TD>

                      <TD className="font-sans">
                        {inv?.customer_snapshot?.customer_name || t('common.na')}
                      </TD>

                      <TD>
                        <Badge variant="neutral">{pay.payment_method}</Badge>
                      </TD>

                      <TD className="text-muted-foreground">
                        <div>{pay.reference_number || t('common.na')}</div>
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
                          <Button variant="ghost" size="sm" onClick={() => handleCancelPayment(pay.id)} title={t('payments.cancelTitle')}>
                            {t('payments.cancelBtn')}
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
        title={t('payments.modalTitle')}
        subtitle={t('payments.modalSubtitle')}
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
              {t('payments.selectInvoice')}
            </Label>
            <Select
              value={formInvoiceId}
              onChange={(e) => handleSelectInvoiceInForm(e.target.value)}
              className="w-full font-mono"
            >
              <option value="">{t('payments.chooseInvoice')}</option>
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
                <span className="text-muted-foreground">{t('payments.invoiceTotal')}</span>{' '}
                <span className="font-semibold text-foreground">
                  {formatINR(invoices[formInvoiceId]?.grand_total || 0)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">{t('payments.remainingOutstanding')}</span>{' '}
                <span className="font-bold text-amber-800 dark:text-amber-300">
                  {formatINR(selectedInvOutstanding.outstanding)}
                </span>
              </div>
            </div>
          )}

          {/* Return credit: auto-used up to the unspent balance, cash covers the rest */}
          {selectedCredit > 0 && selectedInvOutstanding && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded grid grid-cols-2 gap-3">
              <div className="font-mono text-[11px]">
                <div className="text-muted-foreground">{t('payments.creditAvailable')}</div>
                <div className="font-bold text-emerald-700 dark:text-emerald-300">
                  {formatINR(selectedCredit)}
                </div>
              </div>
              <div>
                <Label className="block mb-1">{t('payments.useCredit')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={Math.min(selectedCredit, selectedInvOutstanding.outstanding)}
                  value={formUseCredit}
                  onChange={(e) => handleUseCreditChange(Number(e.target.value))}
                  className="w-full font-mono"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="block mb-1">{t('payments.amount')}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max={selectedInvOutstanding?.outstanding || undefined}
                required
                value={formAmount}
                onChange={(e) => setFormAmount(Number(e.target.value))}
                className="w-full font-mono font-bold"
              />
              <span className="text-[10px] text-muted-foreground">
                {formUseCredit > 0
                  ? t('payments.creditCashSplit', { credit: formatINR(formUseCredit), total: formatINR(roundCurrency(Number(formAmount) + Number(formUseCredit))) })
                  : t('payments.overpayRule')}
              </span>
            </div>

            <div>
              <Label className="block mb-1">{t('payments.method')}</Label>
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
              <Label className="block mb-1">{t('payments.receiptDate')}</Label>
              <Input
                type="date"
                required
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full font-mono"
              />
            </div>

            <div>
              <Label className="block mb-1">{t('payments.refLabel')}</Label>
              <Input
                type="text"
                required
                value={formReference}
                onChange={(e) => setFormReference(e.target.value)}
                className="w-full font-mono"
                placeholder={t('payments.refPh')}
              />
            </div>
          </div>

          <div>
            <Label className="block mb-1">{t('payments.notes')}</Label>
            <Input
              type="text"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              className="w-full"
              placeholder={t('payments.notesPh')}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsRecordModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" size="sm">
              {t('payments.post')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
