import React, { useState, useEffect } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { formatINR, calculateTax, roundCurrency, calculateInvoiceTotals } from '../utils/calculations';
import {
  FileCheck,
  CheckCircle,
  AlertCircle,
  Building,
  Calendar,
  Layers,
  Sparkles,
  ArrowRight,
  FileText
} from 'lucide-react';
import { Badge } from '../components/common/Badge';

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
    products,
    uoms,
    businessSettings,
    getBillableMovementsForCustomer,
    createInvoice
  } = useAccountingStore();

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialCustomerId);
  const [billingPeriodStart, setBillingPeriodStart] = useState('2026-01-01');
  const [billingPeriodEnd, setBillingPeriodEnd] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [otherCharges, setOtherCharges] = useState(0);
  const [billingNotes, setBillingNotes] = useState('');
  const [isFinalizeImmediately, setIsFinalizeImmediately] = useState(true);
  const [creationError, setCreationError] = useState('');

  // Selected movement quantities to bill: { [movementId: string]: number }
  const [selectedAllocations, setSelectedAllocations] = useState<Record<string, number>>({});

  const allCustomers = Object.values(customers);
  const customer = customers[selectedCustomerId];

  // Load unbilled dispatch movements
  const billableMovements = getBillableMovementsForCustomer(selectedCustomerId);

  // Auto-fill allocation map with available quantities when customer changes
  useEffect(() => {
    const initialMap: Record<string, number> = {};
    for (const m of billableMovements) {
      initialMap[m.movementId] = m.availableBillableQuantity;
    }
    setSelectedAllocations(initialMap);
  }, [selectedCustomerId, billableMovements.length]);

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
        customer?.state_code || '24'
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
    setCreationError('');
    if (activeItemsToBill.length === 0) {
      setCreationError('Please allocate at least one unbilled movement quantity.');
      return;
    }

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
      customerId: selectedCustomerId,
      billingPeriodStart,
      billingPeriodEnd,
      items: itemsForStore,
      otherCharges: Number(otherCharges) || 0,
      notes: billingNotes,
      status: isFinalizeImmediately ? 'FINALIZED' : 'DRAFT'
    });

    if (!result.success || !result.invoiceId) {
      setCreationError(result.error || 'Failed to generate invoice.');
    } else {
      onInvoiceCreated(result.invoiceId);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white border border-neutral-200 rounded-lg shadow-2xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-950">Billing Wizard</h1>
          <p className="text-xs text-neutral-500 font-mono mt-0.5">
            Explicit inventory allocation engine • Converts unbilled dispatches into tax invoices
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="neutral" size="md">
            Next Inv #: {businessSettings.invoice_prefix}
            {businessSettings.invoice_next_number}
          </Badge>
        </div>
      </div>

      {/* Customer Selection & Period Config */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-white border border-neutral-200 rounded-lg shadow-2xs text-xs">
        <div>
          <label className="block font-semibold text-neutral-700 mb-1 flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-neutral-500" />
            Customer / Entity
          </label>
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="w-full p-2 border border-neutral-300 rounded bg-white text-neutral-900 font-medium"
          >
            {allCustomers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.customer_name} ({c.city}, {c.state})
              </option>
            ))}
          </select>
          <div className="text-[11px] font-mono text-neutral-500 mt-1">
            GSTIN: {customer?.gst_number || 'N/A'} • State: {customer?.state} (Code: {customer?.state_code})
          </div>
        </div>

        <div>
          <label className="block font-semibold text-neutral-700 mb-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-neutral-500" />
            Billing Period Range
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={billingPeriodStart}
              onChange={(e) => setBillingPeriodStart(e.target.value)}
              className="p-1.5 border border-neutral-300 rounded font-mono"
            />
            <input
              type="date"
              value={billingPeriodEnd}
              onChange={(e) => setBillingPeriodEnd(e.target.value)}
              className="p-1.5 border border-neutral-300 rounded font-mono"
            />
          </div>
          <div className="text-[11px] text-neutral-400 mt-1">
            Period printed on tax invoice
          </div>
        </div>

        <div>
          <label className="block font-semibold text-neutral-700 mb-1">Invoice Generation Status</label>
          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="invStatus"
                checked={isFinalizeImmediately}
                onChange={() => setIsFinalizeImmediately(true)}
              />
              <span className="font-semibold text-neutral-900">Finalize Immediately</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="invStatus"
                checked={!isFinalizeImmediately}
                onChange={() => setIsFinalizeImmediately(false)}
              />
              <span className="text-neutral-700">Save as Draft</span>
            </label>
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">
            Finalized invoices generate financial ledger entries immediately.
          </div>
        </div>
      </div>

      {creationError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{creationError}</span>
        </div>
      )}

      {/* Billable Consignment Movements Allocation Table */}
      <div className="bg-white border border-neutral-200 rounded-lg shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-neutral-200 bg-neutral-50/70 flex justify-between items-center text-xs">
          <div>
            <div className="font-bold text-neutral-950 uppercase tracking-wide text-[11px]">
              Available Unbilled Dispatch Movements ({billableMovements.length})
            </div>
            <div className="text-neutral-500 text-[11px] mt-0.5">
              Specify exact quantities to allocate on this invoice. Partial billing preserves remaining balance for future invoices.
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/80 font-mono text-neutral-600 text-[11px]">
                <th className="py-3 px-4">Dispatch Movement</th>
                <th className="py-3 px-3">Product Description</th>
                <th className="py-3 px-3 text-right">Dispatched</th>
                <th className="py-3 px-3 text-right">Already Billed</th>
                <th className="py-3 px-3 text-right">Available Billable</th>
                <th className="py-3 px-3 text-right">Unit Price</th>
                <th className="py-3 px-4 text-right bg-neutral-100/70">Allocate on This Invoice</th>
                <th className="py-3 px-4 text-right">Line Total (incl Tax)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 font-sans">
              {billableMovements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-neutral-400">
                    No unbilled dispatch movements found for this customer. All movements are fully billed or no dispatches exist.
                  </td>
                </tr>
              ) : (
                billableMovements.map((mov) => {
                  const currentAlloc = selectedAllocations[mov.movementId] || 0;
                  const lineSubtotal = roundCurrency(currentAlloc * mov.applicablePrice);
                  const tax = calculateTax(
                    lineSubtotal,
                    businessSettings.default_gst_rate,
                    businessSettings.state_code,
                    customer?.state_code || '24'
                  );
                  const lineTotal = roundCurrency(lineSubtotal + tax.totalTax);

                  return (
                    <tr key={mov.movementId} className="hover:bg-neutral-50/70">
                      <td className="py-3 px-4 font-mono text-[11px]">
                        <div className="font-semibold text-neutral-900">Challan #{mov.referenceId}</div>
                        <div className="text-neutral-400">
                          {new Date(mov.movementDate).toLocaleDateString()} • #{mov.movementId}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-semibold text-neutral-900">{mov.productName}</div>
                        <div className="text-[11px] font-mono text-neutral-400">{mov.sku}</div>
                      </td>

                      <td className="py-3 px-3 text-right font-mono text-neutral-700">
                        {mov.dispatchedQuantity} {mov.unitCode}
                      </td>

                      <td className="py-3 px-3 text-right font-mono text-neutral-500">
                        {mov.allocatedQuantity} {mov.unitCode}
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold text-neutral-900">
                        {mov.availableBillableQuantity} {mov.unitCode}
                      </td>

                      <td className="py-3 px-3 text-right font-mono">
                        {formatINR(mov.applicablePrice)}
                      </td>

                      {/* Allocator Input */}
                      <td className="py-3 px-4 text-right bg-neutral-50/40">
                        <div className="flex items-center justify-end gap-1.5">
                          <input
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
                            className="w-24 p-1.5 text-right font-mono border border-neutral-300 rounded font-semibold text-neutral-950 focus:ring-1 focus:ring-neutral-900 focus:outline-none bg-white"
                          />
                          <span className="text-[11px] font-mono text-neutral-500">{mov.unitCode}</span>
                        </div>
                        {currentAlloc < mov.availableBillableQuantity && (
                          <div className="text-[10px] font-mono text-amber-700 mt-0.5">
                            Remaining after: {roundCurrency(mov.availableBillableQuantity - currentAlloc)}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-neutral-950">
                        {formatINR(lineTotal)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Totals & Finalization Section */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-white border border-neutral-200 p-6 rounded-lg shadow-2xs">
        <div className="md:col-span-7 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Invoice Remarks / Site Reference
            </label>
            <textarea
              rows={3}
              value={billingNotes}
              onChange={(e) => setBillingNotes(e.target.value)}
              placeholder="e.g. Consignment billing as per purchase order terms. Payment due in 15 days."
              className="w-full p-2.5 text-xs border border-neutral-300 rounded focus:ring-1 focus:ring-neutral-900 focus:outline-none"
            />
          </div>

          <div className="p-3 bg-neutral-50 border border-neutral-200 rounded text-xs space-y-1">
            <div className="font-semibold text-neutral-700">Tax Type Applied:</div>
            <div className="text-neutral-600 font-mono text-[11px]">
              {customer?.state_code === businessSettings.state_code ? (
                <span>Intra-state Supply (Surat → {customer?.city}) • CGST (9%) + SGST (9%)</span>
              ) : (
                <span>Inter-state Supply (Gujarat → {customer?.state}) • IGST (18%)</span>
              )}
            </div>
          </div>
        </div>

        <div className="md:col-span-5 space-y-3 text-xs">
          <div className="flex justify-between py-1 border-b border-neutral-200">
            <span className="text-neutral-600">Subtotal (Taxable):</span>
            <span className="font-mono font-medium">{formatINR(estimatedTotals.taxableAmount)}</span>
          </div>

          {estimatedTotals.cgst > 0 && (
            <div className="flex justify-between py-1 border-b border-neutral-200">
              <span className="text-neutral-600">CGST (9%):</span>
              <span className="font-mono">{formatINR(estimatedTotals.cgst)}</span>
            </div>
          )}

          {estimatedTotals.sgst > 0 && (
            <div className="flex justify-between py-1 border-b border-neutral-200">
              <span className="text-neutral-600">SGST (9%):</span>
              <span className="font-mono">{formatINR(estimatedTotals.sgst)}</span>
            </div>
          )}

          {estimatedTotals.igst > 0 && (
            <div className="flex justify-between py-1 border-b border-neutral-200">
              <span className="text-neutral-600">IGST (18%):</span>
              <span className="font-mono">{formatINR(estimatedTotals.igst)}</span>
            </div>
          )}

          <div className="flex justify-between items-center py-1 border-b border-neutral-200">
            <span className="text-neutral-600">Other / Freight Charges (₹):</span>
            <input
              type="number"
              step="0.01"
              value={otherCharges}
              onChange={(e) => setOtherCharges(Number(e.target.value))}
              className="w-24 p-1 text-right font-mono border border-neutral-300 rounded bg-white"
            />
          </div>

          <div className="flex justify-between py-2 border-t-2 border-b-2 border-neutral-900 text-sm font-bold text-neutral-950">
            <span>Invoice Grand Total:</span>
            <span className="font-mono">{formatINR(estimatedTotals.grandTotal)}</span>
          </div>

          <button
            onClick={handleGenerateInvoice}
            disabled={activeItemsToBill.length === 0}
            className="w-full py-2.5 px-4 bg-neutral-900 text-white font-semibold rounded hover:bg-neutral-800 disabled:opacity-40 transition-colors flex items-center justify-center gap-2 shadow-2xs"
          >
            <CheckCircle className="w-4 h-4" />
            <span>Generate &amp; Save Invoice</span>
          </button>
        </div>
      </div>
    </div>
  );
};
