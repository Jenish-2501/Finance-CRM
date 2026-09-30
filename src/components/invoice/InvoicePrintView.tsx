import React from 'react';
import { Invoice, InvoiceItem, InvoicePayment, InvoiceCustomerInventoryAllocation } from '../../types/database';
import { formatINR } from '../../utils/calculations';
import { Printer, X, CheckCircle, AlertTriangle, Download } from 'lucide-react';
import { Badge } from '../common/Badge';

interface InvoicePrintViewProps {
  invoice: Invoice;
  items: InvoiceItem[];
  payments: InvoicePayment[];
  allocations: InvoiceCustomerInventoryAllocation[];
  onClose?: () => void;
  onFinalize?: () => void;
  onCancel?: (reason: string) => void;
  onOpenPayment?: () => void;
}

export const InvoicePrintView: React.FC<InvoicePrintViewProps> = ({
  invoice,
  items,
  payments,
  allocations,
  onClose,
  onFinalize,
  onCancel,
  onOpenPayment
}) => {
  const activePayments = payments.filter((p) => p.status === 'ACTIVE');
  const totalPaid = activePayments.reduce((sum, p) => sum + p.amount, 0);
  const outstanding = invoice.status === 'CANCELLED' ? 0 : Math.max(0, invoice.grand_total - totalPaid);

  const handlePrint = () => {
    window.print();
  };

  const statusVariant = {
    DRAFT: 'warning' as const,
    FINALIZED: 'success' as const,
    CANCELLED: 'danger' as const
  };

  return (
    <div className="space-y-6">
      {/* Control bar (hidden during print) */}
      <div className="flex items-center justify-between p-4 bg-neutral-100 border border-neutral-300 rounded-lg no-print">
        <div className="flex items-center gap-3">
          <Badge variant={statusVariant[invoice.status]} size="md">
            {invoice.status}
          </Badge>
          <span className="text-xs text-neutral-600 font-mono">
            {invoice.invoice_number} • Created: {new Date(invoice.created_at).toLocaleDateString()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {invoice.status === 'DRAFT' && onFinalize && (
            <button
              onClick={onFinalize}
              className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700 flex items-center gap-1.5 shadow-2xs"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Finalize Invoice
            </button>
          )}

          {invoice.status === 'FINALIZED' && outstanding > 0 && onOpenPayment && (
            <button
              onClick={onOpenPayment}
              className="px-3 py-1.5 text-xs font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 flex items-center gap-1.5 shadow-2xs"
            >
              Record Payment
            </button>
          )}

          {invoice.status !== 'CANCELLED' && onCancel && (
            <button
              onClick={() => {
                const reason = prompt('Please enter cancellation reason:');
                if (reason) onCancel(reason);
              }}
              className="px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded hover:bg-rose-100"
            >
              Cancel Invoice
            </button>
          )}

          <button
            onClick={handlePrint}
            className="px-3.5 py-1.5 text-xs font-medium bg-white text-neutral-800 border border-neutral-300 rounded hover:bg-neutral-50 flex items-center gap-1.5 shadow-2xs"
          >
            <Printer className="w-4 h-4 text-neutral-600" />
            Print / Save PDF
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-500 hover:text-neutral-800 rounded"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Actual Printable Invoice Container */}
      <div className="print-container bg-white border border-neutral-300 p-8 rounded-lg shadow-sm text-neutral-900 font-sans max-w-4xl mx-auto space-y-6">
        {/* Header: Company & Tax Invoice Title */}
        <div className="border-b-2 border-neutral-900 pb-5">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xl font-bold tracking-tight text-neutral-950 uppercase">
                {invoice.business_snapshot.legal_name || invoice.business_snapshot.business_name}
              </div>
              <div className="text-xs text-neutral-600 mt-1 max-w-sm leading-relaxed">
                {invoice.business_snapshot.address}, {invoice.business_snapshot.city},{' '}
                {invoice.business_snapshot.state} - {invoice.business_snapshot.postal_code},{' '}
                {invoice.business_snapshot.country}
              </div>
              <div className="text-xs font-mono text-neutral-700 mt-2 space-y-0.5">
                <div>
                  <span className="font-semibold text-neutral-900">GSTIN:</span>{' '}
                  {invoice.business_snapshot.gst_number}
                </div>
                <div>
                  <span className="font-semibold text-neutral-900">PAN:</span>{' '}
                  {invoice.business_snapshot.pan}
                </div>
                <div>
                  <span className="font-semibold text-neutral-900">Phone:</span>{' '}
                  {invoice.business_snapshot.phone} |{' '}
                  <span className="font-semibold text-neutral-900">Email:</span>{' '}
                  {invoice.business_snapshot.email}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="inline-block bg-neutral-900 text-white font-mono text-xs uppercase font-bold tracking-widest px-3 py-1 rounded">
                TAX INVOICE
              </div>
              <div className="mt-3 text-right font-mono space-y-1 text-xs">
                <div>
                  <span className="text-neutral-500">Invoice No:</span>{' '}
                  <span className="font-bold text-neutral-900 text-sm">{invoice.invoice_number}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Date:</span>{' '}
                  <span className="font-medium text-neutral-800">
                    {new Date(invoice.invoice_date).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500">Billing Period:</span>{' '}
                  <span className="text-neutral-800">
                    {invoice.billing_period_start} to {invoice.billing_period_end}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500">Place of Supply:</span>{' '}
                  <span className="font-medium text-neutral-800">
                    {invoice.customer_snapshot.state} (Code: {invoice.customer_snapshot.state_code})
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bill To & Dispatch Snapshot */}
        <div className="grid grid-cols-2 gap-6 bg-neutral-50 p-4 border border-neutral-200 rounded text-xs">
          <div>
            <div className="font-semibold text-neutral-500 uppercase tracking-wider text-[10px] mb-1">
              Billed To (Customer Snapshot):
            </div>
            <div className="font-bold text-sm text-neutral-950">
              {invoice.customer_snapshot.customer_name}
            </div>
            <div className="text-neutral-600 mt-1 leading-relaxed">
              {invoice.customer_snapshot.address}, {invoice.customer_snapshot.city},{' '}
              {invoice.customer_snapshot.state} - {invoice.customer_snapshot.postal_code},{' '}
              {invoice.customer_snapshot.country}
            </div>
            <div className="mt-2 font-mono text-neutral-700 space-y-0.5">
              <div>
                <span className="font-semibold text-neutral-900">GSTIN:</span>{' '}
                {invoice.customer_snapshot.gst_number || 'N/A / Unregistered'}
              </div>
              <div>
                <span className="font-semibold text-neutral-900">PAN:</span>{' '}
                {invoice.customer_snapshot.pan || 'N/A'}
              </div>
              <div>
                <span className="font-semibold text-neutral-900">Contact:</span>{' '}
                {invoice.customer_snapshot.mobile} | {invoice.customer_snapshot.email}
              </div>
            </div>
          </div>

          <div className="border-l border-neutral-200 pl-6">
            <div className="font-semibold text-neutral-500 uppercase tracking-wider text-[10px] mb-1">
              Inventory Allocation Audit Link:
            </div>
            <div className="text-neutral-600 leading-relaxed text-[11px]">
              Explicitly allocated against customer inventory movements:
            </div>
            <div className="mt-2 space-y-1">
              {allocations.length === 0 ? (
                <span className="text-neutral-400 italic">Direct billed / No explicit dispatch links</span>
              ) : (
                allocations.map((a) => (
                  <div
                    key={a.id}
                    className="flex justify-between items-center bg-white px-2.5 py-1 border border-neutral-200 rounded font-mono text-[11px]"
                  >
                    <span className="text-neutral-600">Movement Ref: #{a.customer_inventory_movement_id}</span>
                    <span className="font-bold text-neutral-900">{a.allocated_quantity} Units</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-y-2 border-neutral-800 bg-neutral-100 font-mono text-neutral-700 text-[11px]">
                <th className="py-2.5 px-2">#</th>
                <th className="py-2.5 px-3">Item Description</th>
                <th className="py-2.5 px-2">SKU</th>
                <th className="py-2.5 px-2 text-right">Qty</th>
                <th className="py-2.5 px-2 text-right">UOM</th>
                <th className="py-2.5 px-3 text-right">Unit Price</th>
                <th className="py-2.5 px-3 text-right">Taxable</th>
                <th className="py-2.5 px-2 text-right">GST %</th>
                <th className="py-2.5 px-3 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 font-sans">
              {items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-neutral-50/50">
                  <td className="py-2.5 px-2 font-mono text-neutral-500">{idx + 1}</td>
                  <td className="py-2.5 px-3 font-semibold text-neutral-900">
                    {item.product_name_snapshot}
                  </td>
                  <td className="py-2.5 px-2 font-mono text-neutral-500 text-[11px]">
                    {item.sku_snapshot}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono font-medium">
                    {item.quantity}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-neutral-600">
                    {item.uom_snapshot}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono">
                    {formatINR(item.unit_price)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono">
                    {formatINR(item.taxable_amount)}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-neutral-600">
                    {item.gst_rate}%
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-neutral-950">
                    {formatINR(item.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Financial Summary & Bank Information */}
        <div className="grid grid-cols-12 gap-6 pt-4 border-t border-neutral-300">
          {/* Left: Bank Snapshot & Terms */}
          <div className="col-span-7 space-y-4">
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded text-xs space-y-1">
              <div className="font-semibold text-neutral-700 text-[11px] uppercase tracking-wide">
                Bank Remittance Details (Persisted Snapshot)
              </div>
              <div className="font-mono text-neutral-800 space-y-0.5 pt-1 text-[11px]">
                <div>
                  <span className="text-neutral-500">Bank Name:</span>{' '}
                  <span className="font-semibold">{invoice.bank_snapshot.bank_name}</span>
                </div>
                <div>
                  <span className="text-neutral-500">A/C Number:</span>{' '}
                  <span className="font-semibold">{invoice.bank_snapshot.bank_account_number}</span>
                </div>
                <div>
                  <span className="text-neutral-500">IFSC Code:</span>{' '}
                  <span className="font-semibold">{invoice.bank_snapshot.ifsc}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Branch:</span>{' '}
                  <span>{invoice.bank_snapshot.branch}</span>
                </div>
              </div>
            </div>

            {invoice.notes && (
              <div className="text-xs text-neutral-600 italic">
                <span className="font-semibold text-neutral-800 not-italic">Notes:</span>{' '}
                {invoice.notes}
              </div>
            )}
          </div>

          {/* Right: Tax breakdown & Grand Total */}
          <div className="col-span-5 space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-neutral-200">
              <span className="text-neutral-600">Taxable Amount:</span>
              <span className="font-mono font-medium">{formatINR(invoice.taxable_amount)}</span>
            </div>

            {invoice.cgst > 0 && (
              <div className="flex justify-between py-1 border-b border-neutral-200">
                <span className="text-neutral-600">CGST:</span>
                <span className="font-mono">{formatINR(invoice.cgst)}</span>
              </div>
            )}

            {invoice.sgst > 0 && (
              <div className="flex justify-between py-1 border-b border-neutral-200">
                <span className="text-neutral-600">SGST:</span>
                <span className="font-mono">{formatINR(invoice.sgst)}</span>
              </div>
            )}

            {invoice.igst > 0 && (
              <div className="flex justify-between py-1 border-b border-neutral-200">
                <span className="text-neutral-600">IGST (Inter-state):</span>
                <span className="font-mono">{formatINR(invoice.igst)}</span>
              </div>
            )}

            {invoice.other_charges > 0 && (
              <div className="flex justify-between py-1 border-b border-neutral-200">
                <span className="text-neutral-600">Other / Freight Charges:</span>
                <span className="font-mono">{formatINR(invoice.other_charges)}</span>
              </div>
            )}

            <div className="flex justify-between py-2 border-t-2 border-b-2 border-neutral-900 text-sm font-bold text-neutral-950">
              <span>Grand Total:</span>
              <span className="font-mono">{formatINR(invoice.grand_total)}</span>
            </div>

            <div className="pt-2 space-y-1 font-mono text-[11px]">
              <div className="flex justify-between text-emerald-800">
                <span>Total Amount Paid:</span>
                <span className="font-semibold">{formatINR(totalPaid)}</span>
              </div>
              <div className="flex justify-between text-neutral-900 text-xs font-bold pt-1 border-t border-neutral-200">
                <span>Outstanding Balance:</span>
                <span>{formatINR(outstanding)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Payments ledger summary for this invoice */}
        {activePayments.length > 0 && (
          <div className="pt-4 border-t border-neutral-200">
            <div className="text-[11px] font-semibold text-neutral-700 uppercase tracking-wide mb-2">
              Payment Receipts Applied Against This Invoice
            </div>
            <div className="space-y-1">
              {activePayments.map((p) => (
                <div
                  key={p.id}
                  className="flex justify-between items-center text-xs py-1.5 px-3 bg-neutral-50 border border-neutral-200 rounded font-mono"
                >
                  <span className="text-neutral-600">
                    {new Date(p.payment_date).toLocaleDateString()} • {p.payment_method} (Ref: #{p.reference_number})
                  </span>
                  <span className="font-bold text-emerald-800">{formatINR(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer sign-off */}
        <div className="pt-10 flex justify-between items-end text-xs text-neutral-500">
          <div>
            This is a computer generated invoice requiring no physical signature.
            <div className="text-[10px] font-mono text-neutral-400 mt-0.5">
              AccuLedger Enterprise Prototype • PostgreSQL Schema Contract
            </div>
          </div>
          <div className="text-center font-mono">
            <div className="h-10 border-b border-neutral-400 w-48 mb-1"></div>
            <div className="text-neutral-800 font-semibold">Authorised Signatory</div>
            <div className="text-[10px]">{invoice.business_snapshot.business_name}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
