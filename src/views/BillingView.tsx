import React, { Fragment, useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { formatINR, calculateTax, roundCurrency, calculateInvoiceTotals, getFyForDate, getCustomerStateCode, kolkataCalendarDay } from '../utils/calculations';
import {
  CheckCircle,
  AlertCircle,
  Building,
  Calendar,
  Printer
} from 'lucide-react';
import { Badge } from '../components/common/Badge';
import { PageHeader, Alert, Button, Card, Input, Label, TableShell, Table, THead, TBody, TR, TH, TD, Textarea } from '../components/ui';
import { CustomerPicker, firstCustomerId } from '../components/common/CustomerPicker';
import { useT } from '../i18n';

interface BillingViewProps {
  initialCustomerId?: string;
  /** openPreview: also open the print preview (print icon path). */
  onInvoiceCreated: (invoiceId: string, openPreview?: boolean) => void;
}

// Challan-based period billing: pick a from/to window and the invoice is
// generated on the NET of every delivery and return challan inside it
// (500 PCS delivered - 200 PCS returned = 300 PCS billed). Returns never
// touch money directly — they reduce the bill. The invoice's allocations
// link both kinds of challan, so the per-invoice ledger document is
// reproducible forever (Invoices view: Download/Print Ledger).
export const BillingView: React.FC<BillingViewProps> = ({
  initialCustomerId = 'cust-1',
  onInvoiceCreated
}) => {
  const { t } = useT();
  const {
    customers,
    businessSettings,
    invoiceSeries,
    previewPeriodNetting,
    createInvoiceFromPeriod
  } = useAccountingStore();

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialCustomerId);
  // Fall back to the first real customer when the incoming id is gone
  // (e.g. seed-only 'cust-1' in a live database).
  const effectiveCustomerId = firstCustomerId(customers, selectedCustomerId);
  const [billingPeriodStart, setBillingPeriodStart] = useState('2026-01-01');
  const [billingPeriodEnd, setBillingPeriodEnd] = useState(() => kolkataCalendarDay(new Date()));
  const [otherCharges, setOtherCharges] = useState(0);
  const [billingNotes, setBillingNotes] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => kolkataCalendarDay(new Date()));
  const [isCreating, setIsCreating] = useState(false);
  const [isFinalizeImmediately, setIsFinalizeImmediately] = useState(true);
  const [creationError, setCreationError] = useState('');

  const customer = customers[effectiveCustomerId];

  // Live netting for the selected customer + window. Products whose net is
  // zero or negative stay off the invoice — their unattached returns carry
  // forward to the next period automatically.
  const netting = previewPeriodNetting(effectiveCustomerId, billingPeriodStart, billingPeriodEnd);
  const billableLines = netting.billableLines;
  const unpriced = billableLines.filter((l) => !(l.rate > 0));

  // Live GST labels: total rate from settings, split equally into CGST/SGST
  const halfGstRate = businessSettings.default_gst_rate / 2;

  // Pre-calculate invoice totals preview (mirrors the store's per-line math).
  const estimatedTotals = calculateInvoiceTotals(
    billableLines.map((line) => {
      const tax = calculateTax(
        line.lineSubtotal,
        businessSettings.default_gst_rate,
        businessSettings.state_code,
        customer ? getCustomerStateCode(customer) : '24'
      );
      return {
        quantity: line.billQty,
        unit_price: line.rate,
        discount: 0,
        taxable_amount: line.lineSubtotal,
        cgst: tax.cgst,
        sgst: tax.sgst,
        igst: tax.igst
      };
    }),
    otherCharges
  );

  const handleGenerateInvoice = (openPreview = false) => {
    if (isCreating) return; // double-submit guard: one number per click
    setCreationError('');
    if (unpriced.length > 0) {
      setCreationError(
        t('billing.errMissingPrice', { products: unpriced.map((l) => l.productName).join(', ') })
      );
      return;
    }
    if (billableLines.length === 0) {
      setCreationError(t('billing.errNothingBillable'));
      return;
    }
    setIsCreating(true);
    const result = createInvoiceFromPeriod({
      customerId: effectiveCustomerId,
      periodStart: billingPeriodStart,
      periodEnd: billingPeriodEnd,
      otherCharges: Number(otherCharges) || 0,
      notes: billingNotes,
      status: isFinalizeImmediately ? 'FINALIZED' : 'DRAFT',
      invoiceDate: new Date(`${invoiceDate}T12:00:00`).toISOString()
    });
    setIsCreating(false);

    if (!result.success || !result.invoiceId) {
      setCreationError(result.error || 'Failed to generate invoice.');
    } else {
      onInvoiceCreated(result.invoiceId, openPreview);
    }
  };

  // Next number follows the invoice date's FY (backdated bills draw from that FY).
  const previewFy = getFyForDate(new Date(`${invoiceDate}T12:00:00`).toISOString());
  const previewSeries = Object.values(invoiceSeries).find((s) => s.fy === previewFy);
  const previewNext = previewSeries ? previewSeries.next_number : businessSettings.invoice_start_number;

  // Challan breakdown rows (brought-forward group first, then period challans).
  const challanRows = netting.lines.flatMap((line) => [
    ...line.broughtForwardChallans.map((c) => ({ ...c, productName: line.productName, broughtForward: true })),
    ...line.challans.map((c) => ({ ...c, productName: line.productName, broughtForward: false }))
  ]).sort((a, b) => a.date.localeCompare(b.date));
  // Every movement of the SAME challan shares one visual row: the Date /
  // Challan No. / Type cells span the challan's product rows, so the table
  // reads as "in this challan these products moved" instead of repeating
  // the header info on every line.
  type ChallanRow = (typeof challanRows)[number];
  const challanGroups: Array<{ key: string; rows: ChallanRow[] }> = [];
  for (const row of challanRows) {
    const key = `${row.challanRef}|${row.kind}`;
    const lastGroup = challanGroups[challanGroups.length - 1];
    if (lastGroup && lastGroup.key === key) {
      lastGroup.rows.push(row);
    } else {
      challanGroups.push({ key, rows: [row] });
    }
  }
  const hasExcluded = netting.excluded.length > 0;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <PageHeader
        title={t('billing.title')}
        subtitle={t('billing.subtitle')}
        actions={
          <Badge variant="neutral" size="md">
            {t('billing.fyNext', { fy: previewFy, next: previewNext })}
          </Badge>
        }
      />

      {/* Customer Selection & Period Config */}
      <Card className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 p-4 text-xs shadow-2xs">
        <div>
          <Label className="mb-1 flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-muted-foreground" />
            {t('billing.customer')}
          </Label>
          <CustomerPicker
            value={effectiveCustomerId}
            onChange={(id) => setSelectedCustomerId(id)}
            customers={customers}
          />
          <div className="text-[11px] font-mono text-muted-foreground mt-1">
            {t('billing.gstStateLine', { gstin: customer?.gst_number || t('common.na'), state: customer?.state ?? '', code: customer ? getCustomerStateCode(customer) : '—' })}
          </div>
        </div>

        <div>
          <Label className="mb-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            {t('billing.period')}
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="date"
              value={billingPeriodStart}
              onChange={(e) => setBillingPeriodStart(e.target.value)}
              className="font-mono"
            />
            <Input
              type="date"
              value={billingPeriodEnd}
              onChange={(e) => setBillingPeriodEnd(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {t('billing.periodNetsHint')}
          </div>
        </div>

        <div>
          <Label className="mb-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            {t('billing.invoiceDate')}
          </Label>
          <Input
            type="date"
            required
            value={invoiceDate}
            max={kolkataCalendarDay(new Date())}
            onChange={(e) => e.target.value && setInvoiceDate(e.target.value)}
            className="w-full font-mono"
          />
          <div className="text-[11px] text-muted-foreground mt-1">
            {t('billing.fyBackdate', { fy: previewFy })}
          </div>
        </div>

        <div>
          <Label className="mb-1">{t('billing.genStatus')}</Label>
          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="invStatus"
                checked={isFinalizeImmediately}
                onChange={() => setIsFinalizeImmediately(true)}
              />
              <span className="font-semibold text-foreground">{t('billing.finalizeNow')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="invStatus"
                checked={!isFinalizeImmediately}
                onChange={() => setIsFinalizeImmediately(false)}
              />
              <span className="text-foreground">{t('billing.saveDraft')}</span>
            </label>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {t('billing.finalizeHint')}
          </div>
        </div>
      </Card>

      {creationError && (
        <Alert tone="destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{creationError}</span>
          </div>
        </Alert>
      )}

      {/* Period challans: deliveries minus returns, challan by challan */}
      <TableShell>
        <div className="p-4 pb-0">
          <div className="font-bold text-foreground uppercase tracking-wide text-[11px]">
            {t('billing.netTitle', { count: netting.lines.length })}
          </div>
          <div className="text-muted-foreground text-[11px] mt-0.5">
            {t('billing.netSub')}
          </div>
        </div>
        <div className="overflow-x-auto mt-3">
          <Table className="text-left border-collapse">
            <caption className="sr-only">{t('billing.netCaption')}</caption>
            <THead>
              <TR className="hover:bg-transparent">
                <TH scope="col">{t('billing.thChallan')}</TH>
                <TH scope="col">{t('billing.thDate')}</TH>
                <TH scope="col">{t('billing.thType')}</TH>
                <TH scope="col">{t('billing.thProduct')}</TH>
                <TH scope="col" className="text-right">{t('billing.thQty')}</TH>
              </TR>
            </THead>
            <TBody>
              {challanRows.length === 0 ? (
                <tr>
                  <TD colSpan={5} className="py-8 text-center text-muted-foreground">
                    {t('billing.noChallans', { start: billingPeriodStart, end: billingPeriodEnd })}
                  </TD>
                </tr>
              ) : (
                challanGroups.map((g) => {
                  const head = g.rows[0];
                  return (
                    <Fragment key={head.movementId}>
                      <TR>
                        <TD rowSpan={g.rows.length} className="font-mono text-[11px] font-semibold align-top">
                          {head.challanRef}
                          {head.broughtForward && (
                            <span className="block text-[10px] font-normal text-muted-foreground">
                              {t('billing.broughtForwardTag')}
                            </span>
                          )}
                        </TD>
                        <TD rowSpan={g.rows.length} className="font-mono text-[11px] text-muted-foreground align-top">
                          {new Date(head.date).toLocaleDateString()}
                        </TD>
                        <TD rowSpan={g.rows.length} className="align-top">
                          <Badge variant={head.kind === 'RETURN' ? 'warning' : 'success'} size="sm">
                            {head.kind === 'RETURN' ? t('billing.kindReturn') : t('billing.kindDelivery')}
                          </Badge>
                        </TD>
                        <TD>
                          <div className="font-semibold">{head.productName}</div>
                        </TD>
                        <TD className="text-right font-mono font-bold">
                          {head.kind === 'RETURN' ? '− ' : ''}{head.quantity} {head.unitCode}
                        </TD>
                      </TR>
                      {g.rows.slice(1).map((r) => (
                        <TR key={r.movementId}>
                          <TD>
                            <div className="font-semibold">{r.productName}</div>
                          </TD>
                          <TD className="text-right font-mono font-bold">
                            {r.kind === 'RETURN' ? '− ' : ''}{r.quantity} {r.unitCode}
                          </TD>
                        </TR>
                      ))}
                    </Fragment>
                  );
                })
              )}
            </TBody>
          </Table>
        </div>
      </TableShell>

      {/* Net summary — what the invoice will bill */}
      <TableShell>
        <div className="p-4 pb-0">
          <div className="font-bold text-foreground uppercase tracking-wide text-[11px]">
            {t('billing.netSummaryTitle')}
          </div>
          <div className="text-muted-foreground text-[11px] mt-0.5">
            {t('billing.netSummarySub')}
          </div>
        </div>
        <div className="overflow-x-auto mt-3">
          <Table className="text-left border-collapse">
            <caption className="sr-only">{t('billing.netSummaryCaption')}</caption>
            <THead>
              <TR className="hover:bg-transparent">
                <TH scope="col">{t('billing.thProduct')}</TH>
                <TH scope="col" className="text-right">{t('billing.thDelivered')}</TH>
                <TH scope="col" className="text-right">{t('billing.thReturned')}</TH>
                <TH scope="col" className="text-right">{t('billing.thBF')}</TH>
                <TH scope="col" className="text-right">{t('billing.thNet')}</TH>
                <TH scope="col" className="text-right">{t('billing.thPrice')}</TH>
                <TH scope="col" className="text-right px-4 bg-muted/70">{t('billing.thLineTotal')}</TH>
              </TR>
            </THead>
            <TBody>
              {netting.lines.length === 0 ? (
                <tr>
                  <TD colSpan={7} className="py-8 text-center text-muted-foreground">
                    {t('billing.noChallans', { start: billingPeriodStart, end: billingPeriodEnd })}
                  </TD>
                </tr>
              ) : (
                netting.lines.map((line) => {
                  const tax = calculateTax(
                    line.lineSubtotal,
                    businessSettings.default_gst_rate,
                    businessSettings.state_code,
                    customer ? getCustomerStateCode(customer) : '24'
                  );
                  const lineTotal = roundCurrency(line.lineSubtotal + tax.totalTax);
                  const billed = line.billQty > 0;
                  return (
                    <TR key={line.productId} className={billed ? '' : 'opacity-50'}>
                      <TD>
                        <div className="font-semibold">{line.productName}</div>
                        <div className="text-[11px] font-mono text-muted-foreground">{line.sku}</div>
                      </TD>
                      <TD className="text-right font-mono">{line.deliveredQty} {line.billingUnitCode}</TD>
                      <TD className="text-right font-mono text-amber-800 dark:text-amber-300">− {line.returnedQty} {line.billingUnitCode}</TD>
                      <TD className={`text-right font-mono ${line.broughtForwardQty < 0 ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground'}`}>
                        {line.broughtForwardQty !== 0 ? `${line.broughtForwardQty < 0 ? '− ' : '+ '}${Math.abs(line.broughtForwardQty)} ${line.billingUnitCode}` : '—'}
                      </TD>
                      <TD className={`text-right font-mono font-bold ${billed ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {line.billQty} {line.billingUnitCode}
                        {!billed && (
                          <span className="block text-[10px] font-normal text-muted-foreground">
                            {t('billing.carriesForward')}
                          </span>
                        )}
                      </TD>
                      <TD className="text-right font-mono">
                        {formatINR(line.rate)}
                        <span className={`block text-[9px] font-bold ${line.isCustomRate ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'}`}>
                          {line.isCustomRate ? t('billing.agreedRate') : t('billing.baseRate')}
                        </span>
                      </TD>
                      <TD className="text-right font-mono font-bold bg-muted/40 px-4">
                        {formatINR(lineTotal)}
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
        </div>
        {hasExcluded && (
          <div className="p-4 pt-3">
            <Alert tone="neutral">
              <span className="text-[11px]">
                {t('billing.excludedNote', { count: netting.excluded.length })}{' '}
                {netting.excluded.map((x) => `#${x.challanRef} (${x.billedOnInvoiceNumber})`).join(', ')}
              </span>
            </Alert>
          </div>
        )}
      </TableShell>

      {/* Invoice Totals & Finalization Section */}
      <Card className="grid grid-cols-1 md:grid-cols-12 gap-6 p-6 shadow-2xs">
        <div className="md:col-span-7 space-y-4">
          <div>
            <Label className="mb-1 text-xs">
              {t('billing.remarks')}
            </Label>
            <Textarea
              rows={3}
              value={billingNotes}
              onChange={(e) => setBillingNotes(e.target.value)}
              placeholder={t('billing.remarksPh')}
              className="text-xs"
            />
          </div>

          <div className="p-3 bg-muted border border-border rounded-md text-xs space-y-1">
            <div className="font-semibold text-foreground">{t('billing.taxType')}</div>
            <div className="text-muted-foreground font-mono text-[11px]">
              {(customer ? getCustomerStateCode(customer) : businessSettings.state_code) === businessSettings.state_code ? (
                <span>{t('billing.intraState', { city: customer?.city ?? '', a: halfGstRate, b: halfGstRate })}</span>
              ) : (
                <span>{t('billing.interState', { state: customer?.state ?? '', rate: businessSettings.default_gst_rate })}</span>
              )}
            </div>
          </div>
        </div>

        <div className="md:col-span-5 space-y-3 text-xs">
          <div className="flex justify-between py-1 border-b border-border">
            <span className="text-muted-foreground">{t('billing.subtotal')}</span>
            <span className="font-mono font-medium">{formatINR(estimatedTotals.taxableAmount)}</span>
          </div>

          {estimatedTotals.cgst > 0 && (
            <div className="flex justify-between py-1 border-b border-border">
              <span className="text-muted-foreground">{t('billing.cgst', { rate: halfGstRate })}</span>
              <span className="font-mono">{formatINR(estimatedTotals.cgst)}</span>
            </div>
          )}

          {estimatedTotals.sgst > 0 && (
            <div className="flex justify-between py-1 border-b border-border">
              <span className="text-muted-foreground">{t('billing.sgst', { rate: halfGstRate })}</span>
              <span className="font-mono">{formatINR(estimatedTotals.sgst)}</span>
            </div>
          )}

          {estimatedTotals.igst > 0 && (
            <div className="flex justify-between py-1 border-b border-border">
              <span className="text-muted-foreground">{t('billing.igst', { rate: businessSettings.default_gst_rate })}</span>
              <span className="font-mono">{formatINR(estimatedTotals.igst)}</span>
            </div>
          )}

          <div className="flex justify-between py-1 border-b border-border">
            <span className="text-muted-foreground">{t('billing.freight')}</span>
            <Input
              type="number"
              step="0.01"
              value={otherCharges}
              onChange={(e) => setOtherCharges(Number(e.target.value))}
              className="w-24 text-right font-mono"
            />
          </div>

          <div className="flex justify-between py-2 border-t-2 border-b-2 border-foreground text-sm font-bold text-foreground">
            <span>{t('billing.grandTotal')}</span>
            <span className="font-mono">{formatINR(estimatedTotals.grandTotal)}</span>
          </div>

          {unpriced.length > 0 && (
            <Alert tone="destructive">
              <span className="text-[11px]">
                {t('billing.errMissingPrice', { products: unpriced.map((l) => l.productName).join(', ') })}
              </span>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button
              onClick={() => handleGenerateInvoice(false)}
              disabled={billableLines.length === 0 || unpriced.length > 0 || isCreating}
              variant="primary"
              size="md"
              className="flex-1 py-2.5 shadow-2xs"
            >
              <CheckCircle className="w-4 h-4" />
              <span>{isCreating ? t('billing.generating') : t('billing.generate')}</span>
            </Button>
            <Button
              onClick={() => handleGenerateInvoice(true)}
              disabled={billableLines.length === 0 || unpriced.length > 0 || isCreating}
              variant="secondary"
              size="md"
              className="py-2.5 px-3 shadow-2xs"
              title={t('billing.generatePrint')}
              aria-label={t('billing.generatePrint')}
            >
              <Printer className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
