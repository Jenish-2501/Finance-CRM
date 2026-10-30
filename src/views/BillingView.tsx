import React, { useState, useEffect } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { formatINR, calculateTax, roundCurrency, calculateInvoiceTotals, convertQuantity, getFyForDate, getCustomerStateCode, kolkataCalendarDay } from '../utils/calculations';
import {
  CheckCircle,
  AlertCircle,
  Building,
  Calendar,
  Printer
} from 'lucide-react';
import { Badge } from '../components/common/Badge';
import { PageHeader, Alert, Button, Card, CardHeader, Input, Label, TableShell, Table, THead, TBody, TR, TH, TD, Textarea } from '../components/ui';
import { CustomerPicker, firstCustomerId } from '../components/common/CustomerPicker';
import { useT } from '../i18n';

interface BillingViewProps {
  initialCustomerId?: string;
  /** openPreview: also open the print preview (print icon path). */
  onInvoiceCreated: (invoiceId: string, openPreview?: boolean) => void;
}

export const BillingView: React.FC<BillingViewProps> = ({
  initialCustomerId = 'cust-1',
  onInvoiceCreated
}) => {
  const { t } = useT();
  const {
    customers,
    businessSettings,
    invoiceSeries,
    productUnits,
    getBillableMovementsForCustomer,
    resolvePriceForCustomer,
    getPieceWeightMapping,
    createInvoice
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

  // Selected movement quantities to bill: { [movementId: string]: number }
  const [selectedAllocations, setSelectedAllocations] = useState<Record<string, number>>({});

  const customer = customers[effectiveCustomerId];

  // Load unbilled dispatch movements
  const billableMovements = getBillableMovementsForCustomer(effectiveCustomerId);

  // Billing basis per movement. Piece-mapped products (PCS dispatch, KG billing)
  // bill in KG at the KG price (base or customer-agreed); everything else bills
  // in its dispatch unit exactly as before. Allocations below always stay in
  // movement (PCS) units — only the invoice line converts to KG.
  interface BillBasis {
    isPiece: boolean;
    unitId: string;
    unitCode: string;
    price: number;
    isCustom: boolean;
    pcsUnitId: string | null;
  }
  const billBasisFor = (
    m: (typeof billableMovements)[number]
  ): BillBasis => {
    const mapping = getPieceWeightMapping(m.productId);
    if (!mapping) {
      return {
        isPiece: false,
        unitId: m.unitId,
        unitCode: m.unitCode,
        price: m.applicablePrice,
        isCustom: m.isCustomPrice,
        pcsUnitId: null
      };
    }
    const resolved = resolvePriceForCustomer(m.productId, mapping.kgUnitId, effectiveCustomerId);
    return {
      isPiece: true,
      unitId: mapping.kgUnitId,
      unitCode: 'KG',
      price: resolved.price,
      isCustom: resolved.isCustom,
      pcsUnitId: mapping.pcsUnitId
    };
  };
  const toBillingQty = (m: (typeof billableMovements)[number], basis: BillBasis, pcsQty: number): number => {
    if (!basis.isPiece || !basis.pcsUnitId) return pcsQty;
    const pus = Object.values(productUnits).filter((pu) => pu.product_id === m.productId);
    return convertQuantity(pcsQty, basis.pcsUnitId, basis.unitId, pus);
  };

  // Auto-fill allocation map with available quantities when customer changes
  useEffect(() => {
    const initialMap: Record<string, number> = {};
    for (const m of billableMovements) {
      initialMap[m.movementId] = m.availableBillableQuantity;
    }
    setSelectedAllocations(initialMap);
  }, [effectiveCustomerId, billableMovements.length]);

  const handleQuantityChange = (movementId: string, maxQty: number, value: number) => {
    const validQty = Math.max(0, Math.min(maxQty, roundCurrency(value)));
    setSelectedAllocations((prev) => ({
      ...prev,
      [movementId]: validQty
    }));
  };

  // Group active allocations by product to construct invoice items.
  // quantityToBill stays in movement units (PCS) for the allocation rows;
  // billingQty is the invoice-line quantity in the billing unit (KG if mapped).
  const activeItemsToBill: Array<{
    movement: typeof billableMovements[0];
    quantityToBill: number;
    billingQty: number;
    billingUnitId: string;
    billingPrice: number;
    subtotal: number;
    taxBreakdown: ReturnType<typeof calculateTax>;
    total: number;
  }> = [];

  for (const m of billableMovements) {
    const qty = selectedAllocations[m.movementId] || 0;
    if (qty > 0) {
      const basis = billBasisFor(m);
      const billingQty = toBillingQty(m, basis, qty);
      const lineSubtotal = roundCurrency(billingQty * basis.price);
      const tax = calculateTax(
        lineSubtotal,
        businessSettings.default_gst_rate,
        businessSettings.state_code,
        customer ? getCustomerStateCode(customer) : '24'
      );
      activeItemsToBill.push({
        movement: m,
        quantityToBill: qty,
        billingQty,
        billingUnitId: basis.unitId,
        billingPrice: basis.price,
        subtotal: lineSubtotal,
        taxBreakdown: tax,
        total: roundCurrency(lineSubtotal + tax.totalTax)
      });
    }
  }

  // Live GST labels: total rate from settings, split equally into CGST/SGST
  const halfGstRate = businessSettings.default_gst_rate / 2;

  // Pre-calculate invoice totals preview
  const estimatedTotals = calculateInvoiceTotals(
    activeItemsToBill.map((item) => ({
      quantity: item.billingQty,
      unit_price: item.billingPrice,
      discount: 0,
      taxable_amount: item.subtotal,
      cgst: item.taxBreakdown.cgst,
      sgst: item.taxBreakdown.sgst,
      igst: item.taxBreakdown.igst
    })),
    otherCharges
  );

  const handleGenerateInvoice = (openPreview = false) => {
    if (isCreating) return; // double-submit guard: one number per click
    setCreationError('');
    if (activeItemsToBill.length === 0) {
      setCreationError('Please allocate at least one unbilled movement quantity.');
      return;
    }
    setIsCreating(true);

    // Group items by productId for the invoice items table
    // and attach explicit movement allocations!
    // Mapped products: invoice line in KG (converted), allocations in PCS.
    const productGroups: Record<
      string,
      {
        productId: string;
        unitId: string;
        quantity: number;
        unitPrice: number;
        allocations: Array<{ movementId: string; allocatedQuantity: number }>;
      }
    > = {};

    for (const item of activeItemsToBill) {
      const basis = billBasisFor(item.movement);
      if (basis.isPiece && !(basis.price > 0)) {
        setIsCreating(false);
        setCreationError(t('billing.errNoKgPrice', { product: item.movement.productName }));
        return;
      }
      const pId = item.movement.productId;
      if (!productGroups[pId]) {
        productGroups[pId] = {
          productId: pId,
          unitId: item.billingUnitId,
          quantity: 0,
          unitPrice: item.billingPrice,
          allocations: []
        };
      }
      productGroups[pId].quantity = roundCurrency(productGroups[pId].quantity + item.billingQty);
      productGroups[pId].allocations.push({
        movementId: item.movement.movementId,
        allocatedQuantity: item.quantityToBill
      });
    }

    const itemsForStore = Object.values(productGroups).map((g) => ({
      productId: g.productId,
      unitId: g.unitId,
      quantity: g.quantity,
      unitPrice: g.unitPrice,
      discount: 0,
      movementAllocations: g.allocations
    }));

    const result = createInvoice({
      customerId: effectiveCustomerId,
      billingPeriodStart,
      billingPeriodEnd,
      items: itemsForStore,
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
            {t('billing.periodPrinted')}
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

      {/* Billable Consignment Movements Allocation Table */}
      <TableShell>
        <CardHeader>
          <div>
            <div className="font-bold text-foreground uppercase tracking-wide text-[11px]">
              {t('billing.movementsTitle', { count: billableMovements.length })}
            </div>
            <div className="text-muted-foreground text-[11px] mt-0.5">
              {t('billing.movementsSub')}
            </div>
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          <Table className="text-left border-collapse">
            <caption className="sr-only">{t('billing.movementsCaption')}</caption>
            <THead>
              <TR className="hover:bg-transparent">
                <TH scope="col">{t('billing.thDispatch')}</TH>
                <TH scope="col">{t('billing.thProduct')}</TH>
                <TH scope="col" className="text-right">{t('billing.thDispatched')}</TH>
                <TH scope="col" className="text-right">{t('billing.thBilled')}</TH>
                <TH scope="col" className="text-right">{t('billing.thAvailable')}</TH>
                <TH scope="col" className="text-right">{t('billing.thPrice')}</TH>
                <TH scope="col" className="text-right px-4 bg-muted/70">{t('billing.thAllocate')}</TH>
                <TH scope="col" className="text-right px-4">{t('billing.thLineTotal')}</TH>
              </TR>
            </THead>
            <TBody>
              {billableMovements.length === 0 ? (
                <tr>
                  <TD colSpan={8} className="py-8 text-center text-muted-foreground">
                    {t('billing.noMovements')}
                  </TD>
                </tr>
              ) : (
                billableMovements.map((mov) => {
                  const currentAlloc = selectedAllocations[mov.movementId] || 0;
                  const basis = billBasisFor(mov);
                  const currentBillingQty = toBillingQty(mov, basis, currentAlloc);
                  const lineSubtotal = roundCurrency(currentBillingQty * basis.price);
                  const tax = calculateTax(
                    lineSubtotal,
                    businessSettings.default_gst_rate,
                    businessSettings.state_code,
                    customer ? getCustomerStateCode(customer) : '24'
                  );
                  const lineTotal = roundCurrency(lineSubtotal + tax.totalTax);
                  const availBillingQty = toBillingQty(mov, basis, mov.availableBillableQuantity);
                  const billedBillingQty = toBillingQty(mov, basis, mov.allocatedQuantity);
                  const dispatchedBillingQty = toBillingQty(mov, basis, mov.dispatchedQuantity);

                  return (
                    <TR key={mov.movementId}>
                      <TD className="font-mono text-[11px]">
                        <div className="font-semibold">{t('billing.challanRef', { ref: mov.referenceId })}</div>
                        <div className="text-muted-foreground">
                          {new Date(mov.movementDate).toLocaleDateString()} • #{mov.movementId}
                        </div>
                      </TD>

                      <TD>
                        <div className="font-semibold">{mov.productName}</div>
                        <div className="text-[11px] font-mono text-muted-foreground">{mov.sku}</div>
                      </TD>

                      <TD className="text-right font-mono">
                        {mov.dispatchedQuantity} {mov.unitCode}
                        {basis.isPiece && (
                          <span className="block text-[10px] text-muted-foreground">
                            {t('billing.pieceDualQty', { pcs: mov.dispatchedQuantity, kg: dispatchedBillingQty })}
                          </span>
                        )}
                      </TD>

                      <TD className="text-right font-mono text-muted-foreground">
                        {mov.allocatedQuantity} {mov.unitCode}
                        {basis.isPiece && (
                          <span className="block text-[10px]">
                            {t('billing.pieceDualQty', { pcs: mov.allocatedQuantity, kg: billedBillingQty })}
                          </span>
                        )}
                      </TD>

                      <TD className="text-right font-mono font-bold">
                        {mov.availableBillableQuantity} {mov.unitCode}
                        {basis.isPiece && (
                          <span className="block text-[10px] font-normal text-muted-foreground">
                            {t('billing.pieceDualQty', { pcs: mov.availableBillableQuantity, kg: availBillingQty })}
                          </span>
                        )}
                      </TD>

                      <TD className="text-right font-mono">
                        {formatINR(basis.price)}
                        {basis.isPiece && (
                          <span className="block text-[9px] text-muted-foreground">
                            {t('billing.priceUnitSuffix', { unit: basis.unitCode })}
                          </span>
                        )}
                        <span className={`block text-[9px] font-bold ${basis.isCustom ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'}`}>
                          {basis.isCustom ? t('billing.agreedRate') : t('billing.baseRate')}
                        </span>
                      </TD>

                      {/* Allocator Input (movement units — PCS for mapped products) */}
                      <TD className="text-right bg-muted/40">
                        <div className="flex items-center justify-end gap-1.5">
                          <Input
                            type="number"
                            min="0"
                            max={mov.availableBillableQuantity}
                            step="any"
                            value={currentAlloc}
                            onChange={(e) =>
                              handleQuantityChange(
                                mov.movementId,
                                mov.availableBillableQuantity,
                                Number(e.target.value)
                              )
                            }
                            className="w-24 text-right font-mono font-semibold"
                          />
                          <span className="text-[11px] font-mono text-muted-foreground">{mov.unitCode}</span>
                        </div>
                        {basis.isPiece && currentAlloc > 0 && (
                          <div className="text-[10px] font-mono text-emerald-700 dark:text-emerald-300 mt-0.5">
                            {t('billing.pieceDualQty', { pcs: currentAlloc, kg: currentBillingQty })}
                          </div>
                        )}
                        {currentAlloc < mov.availableBillableQuantity && (
                          <div className="text-[10px] font-mono text-amber-700 dark:text-amber-300 mt-0.5">
                            {t('billing.remainingAfter', { qty: roundCurrency(mov.availableBillableQuantity - currentAlloc) })}
                            {basis.isPiece && (
                              <> {t('billing.remainingKg', { kg: roundCurrency(availBillingQty - currentBillingQty) })}</>
                            )}
                          </div>
                        )}
                      </TD>

                      <TD className="text-right font-mono font-bold">
                        {formatINR(lineTotal)}
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
        </div>
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

          <div className="flex justify-between items-center py-1 border-b border-border">
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

          <div className="flex gap-2">
            <Button
              onClick={() => handleGenerateInvoice(false)}
              disabled={activeItemsToBill.length === 0 || isCreating}
              variant="primary"
              size="md"
              className="flex-1 py-2.5 shadow-2xs"
            >
              <CheckCircle className="w-4 h-4" />
              <span>{isCreating ? t('billing.generating') : t('billing.generate')}</span>
            </Button>
            <Button
              onClick={() => handleGenerateInvoice(true)}
              disabled={activeItemsToBill.length === 0 || isCreating}
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
