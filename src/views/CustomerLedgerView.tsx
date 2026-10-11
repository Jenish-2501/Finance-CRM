import React, { useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { formatINR } from '../utils/calculations';
import {
  Printer,
  Building,
  Calendar,
  Download
} from 'lucide-react';
import { CustomerPicker, firstCustomerId } from '../components/common/CustomerPicker';
import { Button, Card, Input, Label, PageHeader } from '../components/ui';

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
  // Fall back to the first real customer when the incoming id is gone
  // (e.g. seed-only 'cust-1' in a live database).
  const effectiveCustomerId = firstCustomerId(customers, selectedCustomerId);
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const customer = customers[effectiveCustomerId];

  const fullLedger = getCustomerLedger(effectiveCustomerId);
  const filteredLedger = fullLedger.filter((entry) => {
    const entryDate = entry.date.split('T')[0];
    return entryDate >= startDate && entryDate <= endDate;
  });

  const totalDebits = filteredLedger.reduce((sum, e) => sum + e.debit, 0);
  const totalCredits = filteredLedger.reduce((sum, e) => sum + e.credit, 0);
  const currentOutstanding = getCustomerOutstanding(effectiveCustomerId);

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
      <div className="no-print">
        <PageHeader
          title="Customer Statement of Account"
          subtitle="Strict financial ledger • Debit (Invoices) / Credit (Payments) with deterministic running balance"
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={handleExportCSV}>
                <Download className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Export CSV</span>
              </Button>
              <Button variant="primary" size="md" onClick={handlePrint}>
                <Printer className="w-3.5 h-3.5" />
                <span>Print Statement</span>
              </Button>
            </>
          }
        />
      </div>

      {/* Customer & Date Filter Controls (hidden in print) */}
      <Card className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 text-xs shadow-2xs no-print">
        <div>
          <Label className="mb-1 flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-muted-foreground" />
            Select Customer Account
          </Label>
          <CustomerPicker
            value={effectiveCustomerId}
            onChange={(id) => setSelectedCustomerId(id)}
            customers={customers}
          />
        </div>

        <div>
          <Label className="mb-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            Statement Date Range
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="font-mono"
            />
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="font-mono"
            />
          </div>
        </div>

        <div className="p-3 bg-muted border border-border rounded-md flex flex-col justify-center">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">
            Current Outstanding Balance
          </div>
          <div className="text-xl font-bold font-mono text-foreground mt-0.5">
            {formatINR(currentOutstanding)}
          </div>
        </div>
      </Card>

      {/* Printable Statement Sheet */}
      <div className="print-container bg-card border border-border p-8 rounded-lg shadow-2xs space-y-6">
        {/* Statement Header */}
        <div className="border-b-2 border-neutral-900 pb-5">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-lg font-bold text-foreground uppercase">
                {businessSettings.legal_name || businessSettings.business_name}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {businessSettings.address}, {businessSettings.city}, {businessSettings.state} -{' '}
                {businessSettings.postal_code}
              </div>
              <div className="text-xs font-mono text-foreground mt-1">
                GSTIN: {businessSettings.gst_number} • PAN: {businessSettings.pan}
              </div>
            </div>

            <div className="text-right">
              <div className="text-sm font-bold font-mono uppercase tracking-wider text-foreground">
                STATEMENT OF ACCOUNT
              </div>
              <div className="text-xs font-mono text-muted-foreground mt-1">
                Period: {startDate} to {endDate}
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                Generated: {new Date().toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>

        {/* Customer Details Box */}
        {customer && (
          <div className="p-4 bg-muted border border-border rounded text-xs grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase">Statement For:</div>
              <div className="font-bold text-sm text-foreground mt-0.5">{customer.customer_name}</div>
              <div className="text-muted-foreground mt-0.5">
                {customer.address}, {customer.city}, {customer.state} - {customer.postal_code}
              </div>
              <div className="font-mono text-foreground mt-1">
                GSTIN: {customer.gst_number || 'Unregistered'} • Phone: {customer.mobile}
              </div>
            </div>

            <div className="text-right font-mono text-xs space-y-1">
              <div>
                <span className="text-muted-foreground">Total Invoiced (Debits):</span>{' '}
                <span className="font-semibold text-foreground">{formatINR(totalDebits)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Total Receipts (Credits):</span>{' '}
                <span className="font-semibold text-emerald-800 dark:text-emerald-300">{formatINR(totalCredits)}</span>
              </div>
              <div className="border-t border-input pt-1 text-sm font-bold text-foreground">
                <span>Closing Balance:</span> <span>{formatINR(currentOutstanding)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Financial Transactions Ledger */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <caption className="sr-only">Customer financial transactions ledger</caption>
            <thead>
              <tr className="border-y border-foreground bg-muted font-mono text-foreground text-[11px]">
                <th scope="col" className="py-2.5 px-3">Date</th>
                <th scope="col" className="py-2.5 px-3">Type</th>
                <th scope="col" className="py-2.5 px-3">Reference #</th>
                <th scope="col" className="py-2.5 px-4">Transaction Narration</th>
                <th scope="col" className="py-2.5 px-3 text-right">Debit (+)</th>
                <th scope="col" className="py-2.5 px-3 text-right">Credit (-)</th>
                <th scope="col" className="py-2.5 px-4 text-right">Running Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono text-[11px]">
              {filteredLedger.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground font-sans">
                    No transactions found for this customer account in the selected period.
                  </td>
                </tr>
              ) : (
                filteredLedger.map((row, idx) => (
                  <tr key={idx} className="hover:bg-muted/70">
                    <td className="py-2.5 px-3 text-muted-foreground">
                      {new Date(row.date).toLocaleDateString()}
                    </td>

                    <td className="py-2.5 px-3">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                          row.type === 'INVOICE'
                            ? 'bg-muted text-foreground border-input'
                            : 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/25'
                        }`}
                      >
                        {row.type}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 font-semibold text-foreground">
                      {row.type === 'INVOICE' && onOpenInvoice ? (
                        <button
                          onClick={() => onOpenInvoice(row.referenceId)}
                          className="hover:underline text-foreground font-bold"
                        >
                          {row.referenceNumber}
                        </button>
                      ) : (
                        row.referenceNumber
                      )}
                    </td>

                    <td className="py-2.5 px-4 font-sans text-foreground">
                      {row.description}
                    </td>

                    <td className="py-2.5 px-3 text-right font-medium text-foreground">
                      {row.debit > 0 ? formatINR(row.debit) : '-'}
                    </td>

                    <td className="py-2.5 px-3 text-right font-medium text-emerald-800 dark:text-emerald-300">
                      {row.credit > 0 ? formatINR(row.credit) : '-'}
                    </td>

                    <td className="py-2.5 px-4 text-right font-bold text-foreground">
                      {formatINR(row.balance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-foreground font-mono text-xs font-bold bg-muted">
                <td colSpan={4} className="py-3 px-4 text-right uppercase text-muted-foreground">
                  Period Totals / Net Balance:
                </td>
                <td className="py-3 px-3 text-right text-foreground">{formatINR(totalDebits)}</td>
                <td className="py-3 px-3 text-right text-emerald-800 dark:text-emerald-300">{formatINR(totalCredits)}</td>
                <td className="py-3 px-4 text-right text-foreground">{formatINR(currentOutstanding)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Accounting Rule Notice */}
        <div className="pt-4 border-t border-border text-muted-foreground text-[10px] font-mono">
          Note: In accordance with Indian accounting standards (AS-9/Ind AS 115), consignment inventory dispatches and returns are operational movements and do not constitute financial debits or credits until invoiced.
        </div>
      </div>
    </div>
  );
};
