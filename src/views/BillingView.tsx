import React, { useState, useEffect } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { formatINR, calculateTax, roundCurrency, calculateInvoiceTotals, getFyForDate, getCustomerStateCode } from '../utils/calculations';
import {
  CheckCircle,
  AlertCircle,
  Building,
  Calendar
} from 'lucide-react';
import { Badge } from '../components/common/Badge';
import { PageHeader, Alert, Button, Card, CardHeader, Input, Label, TableShell, Table, THead, TBody, TR, TH, TD, Textarea } from '../components/ui';
import { CustomerPicker, firstCustomerId } from '../components/common/CustomerPicker';

interface BillingViewProps {
  initialCustomerId?: string;
  onInvoiceCreated: (invoiceId: string) => void;
}

export const BillingView: React.FC<BillingViewProps> = ({
  initialCustomerId = 'cust-1',
  onInvoiceCreated
}) => {
  const {
    customers,
    businessSettings,
    invoiceSeries,
    getBillableMovementsForCustomer,
    createInvoice
  } = useAccountingStore();

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialCustomerId);
  // Fall back to the first real customer when the incoming id is gone
  // (e.g. seed-only 'cust-1' in a live database).
  const effectiveCustomerId = firstCustomerId(customers, selectedCustomerId);
  const [billingPeriodStart, setBillingPeriodStart] = useState('2026-01-01');
  const [billingPeriodEnd, setBillingPeriodEnd] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [otherCharges, setOtherCharges] = useState(0);
  const [billingNotes, setBillingNotes] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isCreating, setIsCreating] = useState(false);
  const [isFinalizeImmediately, setIsFinalizeImmediately] = useState(true);
  const [creationError, setCreationError] = useState('');

  // Selected movement quantities to bill: { [movementId: string]: number }
  const [selectedAllocations, setSelectedAllocations] = useState<Record<string, number>>({});

  const customer = customers[effectiveCustomerId];

  // Load unbilled dispatch movements
  const billableMovements = getBillableMovementsForCustomer(effectiveCustomerId);

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

  // Group active allocations by product to construct invoice items
  const activeItemsToBill: Array<{
    movement: typeof billableMovements[0];
    quantityToBill: number;
    subtotal: number;
    taxBreakdown: ReturnType<typeof calculateTax>;
    total: number;
  }> = [];

  for (const m of billableMovements) {
    const qty = selectedAllocations[m.movementId] || 0;
    if (qty > 0) {
      const lineSubtotal = roundCurrency(qty * m.applicablePrice);
      const tax = calculateTax(
        lineSubtotal,
        businessSettings.default_gst_rate,
        businessSettings.state_code,
        customer ? getCustomerStateCode(customer) : '24'
      );
      activeItemsToBill.push({
        movement: m,
        quantityToBill: qty,
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
      quantity: item.quantityToBill,
      unit_price: item.movement.applicablePrice,
      discount: 0,
      taxable_amount: item.subtotal,
      cgst: item.taxBreakdown.cgst,
      sgst: item.taxBreakdown.sgst,
      igst: item.taxBreakdown.igst
    })),
    otherCharges
  );

  const handleGenerateInvoice = () => {
    if (isCreating) return; // double-submit guard: one number per click
    setCreationError('');
    if (activeItemsToBill.length === 0) {
      setCreationError('Please allocate at least one unbilled movement quantity.');
      return;
    }
    setIsCreating(true);

    // Group items by productId for the invoice items table
    // and attach explicit movement allocations!
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
      const pId = item.movement.productId;
      if (!productGroups[pId]) {
        productGroups[pId] = {
          productId: pId,
          unitId: item.movement.unitId,
          quantity: 0,
          unitPrice: item.movement.applicablePrice,
          allocations: []
        };
      }
      productGroups[pId].quantity = roundCurrency(productGroups[pId].quantity + item.quantityToBill);
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
      onInvoiceCreated(result.invoiceId);
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
        title="Billing Wizard"
        subtitle="Explicit inventory allocation engine • Converts unbilled dispatches into tax invoices"
        actions={
          <Badge variant="neutral" size="md">
            FY {previewFy} • Next Inv #: {previewNext}
          </Badge>
        }
      />

      {/* Customer Selection & Period Config */}
      <Card className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 p-4 text-xs shadow-2xs">
        <div>
          <Label className="mb-1 flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-muted-foreground" />
            Customer / Entity
          </Label>
          <CustomerPicker
            value={effectiveCustomerId}
            onChange={(id) => setSelectedCustomerId(id)}
            customers={customers}
          />
          <div className="text-[11px] font-mono text-muted-foreground mt-1">
            GSTIN: {customer?.gst_number || 'N/A'} • State: {customer?.state} (Code: {customer ? getCustomerStateCode(customer) : '—'})
          </div>
        </div>

        <div>
          <Label className="mb-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            Billing Period Range
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
            Period printed on tax invoice
          </div>
        </div>

        <div>
          <Label className="mb-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            Invoice Date
          </Label>
          <Input
            type="date"
            required
            value={invoiceDate}
            max={new Date().toISOString().split('T')[0]}
            onChange={(e) => e.target.value && setInvoiceDate(e.target.value)}
            className="w-full font-mono"
          />
          <div className="text-[11px] text-muted-foreground mt-1">
            FY {previewFy} • backdating allowed, future dates blocked
          </div>
        </div>

        <div>
          <Label className="mb-1">Invoice Generation Status</Label>
          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="invStatus"
                checked={isFinalizeImmediately}
                onChange={() => setIsFinalizeImmediately(true)}
              />
              <span className="font-semibold text-foreground">Finalize Immediately</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="invStatus"
                checked={!isFinalizeImmediately}
                onChange={() => setIsFinalizeImmediately(false)}
              />
              <span className="text-foreground">Save as Draft</span>
            </label>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Finalized invoices generate financial ledger entries immediately.
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
              Available Unbilled Dispatch Movements ({billableMovements.length})
            </div>
            <div className="text-muted-foreground text-[11px] mt-0.5">
              Specify exact quantities to allocate on this invoice. Partial billing preserves remaining balance for future invoices.
            </div>
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          <Table className="text-left border-collapse">
            <caption className="sr-only">Unbilled dispatch movements available for allocation</caption>
            <THead>
              <TR className="hover:bg-transparent">
                <TH scope="col">Dispatch Movement</TH>
                <TH scope="col">Product Description</TH>
                <TH scope="col" className="text-right">Dispatched</TH>
                <TH scope="col" className="text-right">Already Billed</TH>
                <TH scope="col" className="text-right">Available Billable</TH>
                <TH scope="col" className="text-right">Unit Price</TH>
                <TH scope="col" className="text-right px-4 bg-muted/70">Allocate on This Invoice</TH>
                <TH scope="col" className="text-right px-4">Line Total (incl Tax)</TH>
              </TR>
            </THead>
            <TBody>
              {billableMovements.length === 0 ? (
                <tr>
                  <TD colSpan={8} className="py-8 text-center text-muted-foreground">
                    No unbilled dispatch movements found for this customer. All movements are fully billed or no dispatches exist.
                  </TD>
                </tr>
              ) : (
                billableMovements.map((mov) => {
                  const currentAlloc = selectedAllocations[mov.movementId] || 0;
                  const lineSubtotal = roundCurrency(currentAlloc * mov.applicablePrice);
                  const tax = calculateTax(
                    lineSubtotal,
                    businessSettings.default_gst_rate,
                    businessSettings.state_code,
                    customer ? getCustomerStateCode(customer) : '24'
                  );
                  const lineTotal = roundCurrency(lineSubtotal + tax.totalTax);

                  return (
                    <TR key={mov.movementId}>
                      <TD className="font-mono text-[11px]">
                        <div className="font-semibold">Challan #{mov.referenceId}</div>
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
                      </TD>

                      <TD className="text-right font-mono text-muted-foreground">
                        {mov.allocatedQuantity} {mov.unitCode}
                      </TD>

                      <TD className="text-right font-mono font-bold">
                        {mov.availableBillableQuantity} {mov.unitCode}
                      </TD>

                      <TD className="text-right font-mono">
                        {formatINR(mov.applicablePrice)}
                        <span className={`block text-[9px] font-bold ${mov.isCustomPrice ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'}`}>
                          {mov.isCustomPrice ? 'AGREED' : 'BASE'}
                        </span>
                      </TD>

                      {/* Allocator Input */}
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
                        {currentAlloc < mov.availableBillableQuantity && (
                          <div className="text-[10px] font-mono text-amber-700 dark:text-amber-300 mt-0.5">
                            Remaining after: {roundCurrency(mov.availableBillableQuantity - currentAlloc)}
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
              Invoice Remarks / Site Reference
            </Label>
            <Textarea
              rows={3}
              value={billingNotes}
              onChange={(e) => setBillingNotes(e.target.value)}
              placeholder="e.g. Consignment billing as per purchase order terms. Payment due in 15 days."
              className="text-xs"
            />
          </div>

          <div className="p-3 bg-muted border border-border rounded-md text-xs space-y-1">
            <div className="font-semibold text-foreground">Tax Type Applied:</div>
            <div className="text-muted-foreground font-mono text-[11px]">
              {(customer ? getCustomerStateCode(customer) : businessSettings.state_code) === businessSettings.state_code ? (
                <span>Intra-state Supply (Surat → {customer?.city}) • CGST ({halfGstRate}%) + SGST ({halfGstRate}%)</span>
              ) : (
                <span>Inter-state Supply (Gujarat → {customer?.state}) • IGST ({businessSettings.default_gst_rate}%)</span>
              )}
            </div>
          </div>
        </div>

        <div className="md:col-span-5 space-y-3 text-xs">
          <div className="flex justify-between py-1 border-b border-border">
            <span className="text-muted-foreground">Subtotal (Taxable):</span>
            <span className="font-mono font-medium">{formatINR(estimatedTotals.taxableAmount)}</span>
          </div>

          {estimatedTotals.cgst > 0 && (
            <div className="flex justify-between py-1 border-b border-border">
              <span className="text-muted-foreground">CGST ({halfGstRate}%):</span>
              <span className="font-mono">{formatINR(estimatedTotals.cgst)}</span>
            </div>
          )}

          {estimatedTotals.sgst > 0 && (
            <div className="flex justify-between py-1 border-b border-border">
              <span className="text-muted-foreground">SGST ({halfGstRate}%):</span>
              <span className="font-mono">{formatINR(estimatedTotals.sgst)}</span>
            </div>
          )}

          {estimatedTotals.igst > 0 && (
            <div className="flex justify-between py-1 border-b border-border">
              <span className="text-muted-foreground">IGST ({businessSettings.default_gst_rate}%):</span>
              <span className="font-mono">{formatINR(estimatedTotals.igst)}</span>
            </div>
          )}

          <div className="flex justify-between items-center py-1 border-b border-border">
            <span className="text-muted-foreground">Other / Freight Charges (₹):</span>
            <Input
              type="number"
              step="0.01"
              value={otherCharges}
              onChange={(e) => setOtherCharges(Number(e.target.value))}
              className="w-24 text-right font-mono"
            />
          </div>

          <div className="flex justify-between py-2 border-t-2 border-b-2 border-foreground text-sm font-bold text-foreground">
            <span>Invoice Grand Total:</span>
            <span className="font-mono">{formatINR(estimatedTotals.grandTotal)}</span>
          </div>

          <Button
            onClick={handleGenerateInvoice}
            disabled={activeItemsToBill.length === 0 || isCreating}
            variant="primary"
            size="md"
            className="w-full py-2.5 shadow-2xs"
          >
            <CheckCircle className="w-4 h-4" />
            <span>{isCreating ? 'Generating…' : 'Generate & Save Invoice'}</span>
          </Button>
        </div>
      </Card>
    </div>
  );
};
