import React, { useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { formatINR, roundCurrency } from '../utils/calculations';
import {
  BarChart3,
  Download,
  Filter,
  Search,
  FileSpreadsheet,
  TrendingUp,
  Receipt,
  Layers,
  Truck
} from 'lucide-react';
import { Badge } from '../components/common/Badge';

export const ReportsView: React.FC = () => {
  const {
    invoices,
    invoicePayments,
    customers,
    products,
    uoms,
    getCurrentCompanyStock,
    customerInventoryMovements
  } = useAccountingStore();

  const [activeReport, setActiveReport] = useState<
    'sales' | 'receivables' | 'payments' | 'gst' | 'inventory' | 'consignments'
  >('sales');

  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const allInvoices = Object.values(invoices);
  const finalizedInvoices = allInvoices.filter((i) => i.status === 'FINALIZED');
  const activePayments = Object.values(invoicePayments).filter((p) => p.status === 'ACTIVE');

  // CSV Export utility
  const exportToCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join(
        '\n'
      );
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 1. Sales Summary & Register
  const handleExportSales = () => {
    const headers = ['Invoice #', 'Date', 'Customer', 'Taxable (INR)', 'CGST', 'SGST', 'IGST', 'Grand Total (INR)', 'Status'];
    const rows = finalizedInvoices.map((inv) => [
      inv.invoice_number,
      new Date(inv.invoice_date).toLocaleDateString(),
      inv.customer_snapshot.customer_name,
      inv.taxable_amount,
      inv.cgst,
      inv.sgst,
      inv.igst,
      inv.grand_total,
      inv.status
    ]);
    exportToCSV('sales_register_report', headers, rows);
  };

  // 2. Receivables
  const receivablesData = Object.values(customers).map((cust) => {
    const custInvoices = finalizedInvoices.filter((i) => i.customer_id === cust.id);
    const totalBilled = custInvoices.reduce((sum, i) => sum + i.grand_total, 0);
    const totalPaid = activePayments
      .filter((p) => {
        const inv = invoices[p.invoice_id];
        return inv && inv.customer_id === cust.id;
      })
      .reduce((sum, p) => sum + p.amount, 0);
    const outstanding = Math.max(0, roundCurrency(totalBilled - totalPaid));
    return {
      customerId: cust.id,
      customerName: cust.customer_name,
      city: cust.city,
      state: cust.state,
      totalBilled,
      totalPaid,
      outstanding
    };
  });

  const handleExportReceivables = () => {
    const headers = ['Customer', 'City', 'State', 'Total Billed (INR)', 'Total Collected (INR)', 'Outstanding Balance (INR)'];
    const rows = receivablesData.map((r) => [
      r.customerName,
      r.city,
      r.state,
      r.totalBilled,
      r.totalPaid,
      r.outstanding
    ]);
    exportToCSV('receivables_report', headers, rows);
  };

  // 3. GST Tax Summary
  const totalTaxable = finalizedInvoices.reduce((s, i) => s + i.taxable_amount, 0);
  const totalCGST = finalizedInvoices.reduce((s, i) => s + i.cgst, 0);
  const totalSGST = finalizedInvoices.reduce((s, i) => s + i.sgst, 0);
  const totalIGST = finalizedInvoices.reduce((s, i) => s + i.igst, 0);
  const totalTaxCollected = roundCurrency(totalCGST + totalSGST + totalIGST);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white border border-neutral-200 rounded-lg shadow-2xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-950">Financial &amp; Statutory Reports</h1>
          <p className="text-xs text-neutral-500 font-mono mt-0.5">
            Normalized ledger extracts • GST GSTR-1 preparation • Receivables aging &amp; consignment audits
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeReport === 'sales' && (
            <button
              onClick={handleExportSales}
              className="px-3.5 py-1.5 text-xs font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Sales CSV</span>
            </button>
          )}

          {activeReport === 'receivables' && (
            <button
              onClick={handleExportReceivables}
              className="px-3.5 py-1.5 text-xs font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Receivables CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Report Selection Tabs */}
      <div className="flex border-b border-neutral-200 gap-6 text-xs font-medium text-neutral-500 overflow-x-auto">
        {[
          { id: 'sales', label: 'Sales & Invoice Register' },
          { id: 'receivables', label: 'Receivables & Credit Summary' },
          { id: 'gst', label: 'GST / Tax Compliance (GSTR-1)' },
          { id: 'inventory', label: 'Warehouse Stock Valuation' },
          { id: 'consignments', label: 'Customer Consignment Balances' }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveReport(t.id as any)}
            className={`pb-2.5 transition-colors border-b-2 -mb-px whitespace-nowrap ${
              activeReport === t.id
                ? 'border-neutral-900 text-neutral-900 font-semibold'
                : 'border-transparent hover:text-neutral-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Report 1: Sales & Invoice Register */}
      {activeReport === 'sales' && (
        <div className="bg-white border border-neutral-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-neutral-200 bg-neutral-50/70 flex justify-between items-center text-xs">
            <span className="font-bold text-neutral-900 uppercase tracking-wide">
              Finalized Sales Invoices ({finalizedInvoices.length})
            </span>
            <div className="font-mono text-neutral-600">
              Total Sales Volume:{' '}
              <span className="font-bold text-neutral-950">
                {formatINR(finalizedInvoices.reduce((s, i) => s + i.grand_total, 0))}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/80 font-mono text-neutral-600 text-[11px]">
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Customer Entity</th>
                  <th className="py-3 px-3 text-right">Taxable</th>
                  <th className="py-3 px-3 text-right">CGST</th>
                  <th className="py-3 px-3 text-right">SGST</th>
                  <th className="py-3 px-3 text-right">IGST</th>
                  <th className="py-3 px-4 text-right">Grand Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 font-mono text-[11px]">
                {finalizedInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-neutral-50/70">
                    <td className="py-3 px-4 font-bold text-neutral-900">{inv.invoice_number}</td>
                    <td className="py-3 px-3 text-neutral-500">
                      {new Date(inv.invoice_date).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-3 font-sans font-semibold text-neutral-900">
                      {inv.customer_snapshot.customer_name}
                    </td>
                    <td className="py-3 px-3 text-right text-neutral-700">{formatINR(inv.taxable_amount)}</td>
                    <td className="py-3 px-3 text-right text-neutral-600">{formatINR(inv.cgst)}</td>
                    <td className="py-3 px-3 text-right text-neutral-600">{formatINR(inv.sgst)}</td>
                    <td className="py-3 px-3 text-right text-neutral-600">{formatINR(inv.igst)}</td>
                    <td className="py-3 px-4 text-right font-bold text-neutral-950">{formatINR(inv.grand_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report 2: Receivables Summary */}
      {activeReport === 'receivables' && (
        <div className="bg-white border border-neutral-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/80 font-mono text-neutral-600 text-[11px]">
                  <th className="py-3 px-4">Customer Entity</th>
                  <th className="py-3 px-3">Location</th>
                  <th className="py-3 px-3 text-right">Total Invoiced (Debits)</th>
                  <th className="py-3 px-3 text-right">Total Collected (Credits)</th>
                  <th className="py-3 px-4 text-right">Net Outstanding Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 font-sans">
                {receivablesData.map((row) => (
                  <tr key={row.customerId} className="hover:bg-neutral-50/70">
                    <td className="py-3 px-4 font-semibold text-neutral-900">{row.customerName}</td>
                    <td className="py-3 px-3 text-neutral-500 font-mono text-[11px]">
                      {row.city}, {row.state}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-neutral-700">
                      {formatINR(row.totalBilled)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-800">
                      {formatINR(row.totalPaid)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-sm">
                      <span className={row.outstanding > 0 ? 'text-amber-800' : 'text-emerald-800'}>
                        {formatINR(row.outstanding)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report 3: GST Tax Summary */}
      {activeReport === 'gst' && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <div className="p-4 bg-white border border-neutral-200 rounded-lg shadow-2xs">
              <div className="text-[11px] font-semibold text-neutral-500 uppercase">Total Taxable Value</div>
              <div className="mt-1 text-xl font-bold font-mono text-neutral-950">{formatINR(totalTaxable)}</div>
            </div>
            <div className="p-4 bg-white border border-neutral-200 rounded-lg shadow-2xs">
              <div className="text-[11px] font-semibold text-neutral-500 uppercase">Total CGST (Intra-state)</div>
              <div className="mt-1 text-xl font-bold font-mono text-neutral-950">{formatINR(totalCGST)}</div>
            </div>
            <div className="p-4 bg-white border border-neutral-200 rounded-lg shadow-2xs">
              <div className="text-[11px] font-semibold text-neutral-500 uppercase">Total SGST (Intra-state)</div>
              <div className="mt-1 text-xl font-bold font-mono text-neutral-950">{formatINR(totalSGST)}</div>
            </div>
            <div className="p-4 bg-white border border-neutral-200 rounded-lg shadow-2xs">
              <div className="text-[11px] font-semibold text-neutral-500 uppercase">Total IGST (Inter-state)</div>
              <div className="mt-1 text-xl font-bold font-mono text-sky-800">{formatINR(totalIGST)}</div>
            </div>
          </div>

          <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg text-xs space-y-2">
            <div className="font-bold text-neutral-900">Total Statutory Tax Liability: {formatINR(totalTaxCollected)}</div>
            <div className="text-neutral-600 leading-relaxed">
              Inter-state transactions (customers with state code other than 24) are charged IGST 18%. Intra-state supplies within Gujarat are split equally into CGST 9% and SGST 9%.
            </div>
          </div>
        </div>
      )}

      {/* Report 4: Inventory Valuation */}
      {activeReport === 'inventory' && (
        <div className="bg-white border border-neutral-200 rounded-lg shadow-2xs overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/80 font-mono text-neutral-600 text-[11px]">
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-3">SKU</th>
                <th className="py-3 px-3 text-right">Physical Warehouse Stock</th>
                <th className="py-3 px-3 text-right">UOM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 font-sans">
              {Object.values(products).map((p) => {
                const stock = getCurrentCompanyStock(p.id);
                const uom = uoms[p.primary_unit_id];
                return (
                  <tr key={p.id} className="hover:bg-neutral-50/70">
                    <td className="py-3 px-4 font-semibold text-neutral-900">{p.product_name}</td>
                    <td className="py-3 px-3 font-mono text-neutral-500 text-[11px]">{p.sku}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-neutral-950">{stock.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right font-mono text-neutral-600">{uom?.code}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Report 5: Consignments */}
      {activeReport === 'consignments' && (
        <div className="bg-white border border-neutral-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-neutral-200 bg-neutral-50/70 text-xs text-neutral-600">
            Consignment stock physically held across client locations.
          </div>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/80 font-mono text-neutral-600 text-[11px]">
                <th className="py-3 px-4">Client Consignee</th>
                <th className="py-3 px-3">State</th>
                <th className="py-3 px-3">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 font-sans">
              {Object.values(customers).map((c) => (
                <tr key={c.id} className="hover:bg-neutral-50/70">
                  <td className="py-3 px-4 font-semibold text-neutral-900">{c.customer_name}</td>
                  <td className="py-3 px-3 font-mono text-[11px]">{c.state} ({c.state_code})</td>
                  <td className="py-3 px-3 text-neutral-600">{c.city}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
