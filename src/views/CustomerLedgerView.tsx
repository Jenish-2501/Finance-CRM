import React, { useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { formatINR } from '../utils/calculations';
import {
  BookOpen,
  Printer,
  Building,
  Calendar,
  ArrowDownLeft,
  ArrowUpRight,
  Download
} from 'lucide-react';

interface CustomerLedgerViewProps {
  initialCustomerId?: string;
  onOpenInvoice?: (invoiceId: string) => void;
}

export const CustomerLedgerView: React.FC<CustomerLedgerViewProps> = ({
  initialCustomerId = 'cust-1',
  onOpenInvoice
}) => {
  const { customers, getCustomerLedger, getCustomerOutstanding, businessSettings } =
    useAccountingStore();

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialCustomerId);
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const allCustomers = Object.values(customers);
  const customer = customers[selectedCustomerId];

  const fullLedger = getCustomerLedger(selectedCustomerId);
  const filteredLedger = fullLedger.filter((entry) => {
    const entryDate = entry.date.split('T')[0];
    return entryDate >= startDate && entryDate <= endDate;
  });

  const totalDebits = filteredLedger.reduce((sum, e) => sum + e.debit, 0);
  const totalCredits = filteredLedger.reduce((sum, e) => sum + e.credit, 0);
  const currentOutstanding = getCustomerOutstanding(selectedCustomerId);

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    const headers = ['Date', 'Reference', 'Type', 'Description', 'Debit (INR)', 'Credit (INR)', 'Balance (INR)'];
    const rows = filteredLedger.map((e) => [
      new Date(e.date).toLocaleDateString(),
      e.referenceNumber,
      e.type,
      `"${e.description.replace(/"/g, '""')}"`,
      e.debit,
      e.credit,
      e.balance
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const filename = `statement_${customer?.customer_name.replace(/\s+/g, '_')}.csv`;
    if (window.electronAPI) {
      window.electronAPI.files.saveCSV(filename, csvContent.replace('data:text/csv;charset=utf-8,', ''));
    } else {
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner (hidden in print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white border border-neutral-200 rounded-lg shadow-2xs no-print">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-950">Customer Statement of Account</h1>
          <p className="text-xs text-neutral-500 font-mono mt-0.5">
            Strict financial ledger • Debit (Invoices) / Credit (Payments) with deterministic running balance
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-300 rounded hover:bg-neutral-50 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-neutral-500" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-3.5 py-1.5 text-xs font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Statement</span>
          </button>
        </div>
      </div>

      {/* Customer & Date Filter Controls (hidden in print) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-white border border-neutral-200 rounded-lg shadow-2xs text-xs no-print">
        <div>
          <label className="block font-semibold text-neutral-700 mb-1 flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-neutral-500" />
            Select Customer Account
          </label>
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="w-full p-2 border border-neutral-300 rounded bg-white text-neutral-900 font-medium"
          >
            {allCustomers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.customer_name} ({c.city})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-semibold text-neutral-700 mb-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-neutral-500" />
            Statement Date Range
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="p-1.5 border border-neutral-300 rounded font-mono"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="p-1.5 border border-neutral-300 rounded font-mono"
            />
          </div>
        </div>

        <div className="p-3 bg-neutral-50 border border-neutral-200 rounded flex flex-col justify-center">
          <div className="text-[11px] text-neutral-500 uppercase tracking-wide font-semibold">
            Current Outstanding Balance
          </div>
          <div className="text-xl font-bold font-mono text-neutral-950 mt-0.5">
            {formatINR(currentOutstanding)}
          </div>
        </div>
      </div>

      {/* Printable Statement Sheet */}
      <div className="print-container bg-white border border-neutral-200 p-8 rounded-lg shadow-2xs space-y-6">
        {/* Statement Header */}
        <div className="border-b-2 border-neutral-900 pb-5">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-lg font-bold text-neutral-950 uppercase">
                {businessSettings.legal_name || businessSettings.business_name}
              </div>
              <div className="text-xs text-neutral-600 mt-0.5">
                {businessSettings.address}, {businessSettings.city}, {businessSettings.state} -{' '}
                {businessSettings.postal_code}
              </div>
              <div className="text-xs font-mono text-neutral-700 mt-1">
                GSTIN: {businessSettings.gst_number} • PAN: {businessSettings.pan}
              </div>
            </div>

            <div className="text-right">
              <div className="text-sm font-bold font-mono uppercase tracking-wider text-neutral-900">
                STATEMENT OF ACCOUNT
              </div>
              <div className="text-xs font-mono text-neutral-500 mt-1">
                Period: {startDate} to {endDate}
              </div>
              <div className="text-xs text-neutral-400 font-mono">
                Generated: {new Date().toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>

        {/* Customer Details Box */}
        {customer && (
          <div className="p-4 bg-neutral-50 border border-neutral-200 rounded text-xs grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] font-semibold text-neutral-500 uppercase">Statement For:</div>
              <div className="font-bold text-sm text-neutral-950 mt-0.5">{customer.customer_name}</div>
              <div className="text-neutral-600 mt-0.5">
                {customer.address}, {customer.city}, {customer.state} - {customer.postal_code}
              </div>
              <div className="font-mono text-neutral-700 mt-1">
                GSTIN: {customer.gst_number || 'Unregistered'} • Phone: {customer.mobile}
              </div>
            </div>

            <div className="text-right font-mono text-xs space-y-1">
              <div>
                <span className="text-neutral-500">Total Invoiced (Debits):</span>{' '}
                <span className="font-semibold text-neutral-900">{formatINR(totalDebits)}</span>
              </div>
              <div>
                <span className="text-neutral-500">Total Receipts (Credits):</span>{' '}
                <span className="font-semibold text-emerald-800">{formatINR(totalCredits)}</span>
              </div>
              <div className="border-t border-neutral-300 pt-1 text-sm font-bold text-neutral-950">
                <span>Closing Balance:</span> <span>{formatINR(currentOutstanding)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Financial Transactions Ledger */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-y border-neutral-800 bg-neutral-100 font-mono text-neutral-700 text-[11px]">
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Reference #</th>
                <th className="py-2.5 px-4">Transaction Narration</th>
                <th className="py-2.5 px-3 text-right">Debit (+)</th>
                <th className="py-2.5 px-3 text-right">Credit (-)</th>
                <th className="py-2.5 px-4 text-right">Running Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 font-mono text-[11px]">
              {filteredLedger.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-neutral-400 font-sans">
                    No transactions found for this customer account in the selected period.
                  </td>
                </tr>
              ) : (
                filteredLedger.map((row, idx) => (
                  <tr key={idx} className="hover:bg-neutral-50/70">
                    <td className="py-2.5 px-3 text-neutral-500">
                      {new Date(row.date).toLocaleDateString()}
                    </td>

                    <td className="py-2.5 px-3">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                          row.type === 'INVOICE'
                            ? 'bg-neutral-100 text-neutral-800 border-neutral-300'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        {row.type}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 font-semibold text-neutral-900">
                      {row.type === 'INVOICE' && onOpenInvoice ? (
                        <button
                          onClick={() => onOpenInvoice(row.referenceId)}
                          className="hover:underline text-neutral-950 font-bold"
                        >
                          {row.referenceNumber}
                        </button>
                      ) : (
                        row.referenceNumber
                      )}
                    </td>

                    <td className="py-2.5 px-4 font-sans text-neutral-700">
                      {row.description}
                    </td>

                    <td className="py-2.5 px-3 text-right font-medium text-neutral-950">
                      {row.debit > 0 ? formatINR(row.debit) : '-'}
                    </td>

                    <td className="py-2.5 px-3 text-right font-medium text-emerald-800">
                      {row.credit > 0 ? formatINR(row.credit) : '-'}
                    </td>

                    <td className="py-2.5 px-4 text-right font-bold text-neutral-950">
                      {formatINR(row.balance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-neutral-800 font-mono text-xs font-bold bg-neutral-50">
                <td colSpan={4} className="py-3 px-4 text-right uppercase text-neutral-600">
                  Period Totals / Net Balance:
                </td>
                <td className="py-3 px-3 text-right text-neutral-950">{formatINR(totalDebits)}</td>
                <td className="py-3 px-3 text-right text-emerald-800">{formatINR(totalCredits)}</td>
                <td className="py-3 px-4 text-right text-neutral-950">{formatINR(currentOutstanding)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Accounting Rule Notice */}
        <div className="pt-4 border-t border-neutral-200 text-neutral-400 text-[10px] font-mono">
          Note: In accordance with Indian accounting standards (AS-9/Ind AS 115), consignment inventory dispatches and returns are operational movements and do not constitute financial debits or credits until invoiced.
        </div>
      </div>
    </div>
  );
};
