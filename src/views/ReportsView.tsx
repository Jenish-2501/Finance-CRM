import React, { useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { formatINR, roundCurrency, getCustomerStateCode } from '../utils/calculations';
import {
  Download
} from 'lucide-react';
import { Button, CardHeader, KpiCard, PageHeader, TableShell, Table, THead, TBody, TR, TH, TD, Well, Tabs } from '../components/ui';

export const ReportsView: React.FC = () => {
  const {
    invoices,
    invoicePayments,
    customers,
    products,
    uoms,
    getCurrentCompanyStock,
    businessSettings
  } = useAccountingStore();

  const [activeReport, setActiveReport] = useState<
    'sales' | 'receivables' | 'payments' | 'gst' | 'inventory' | 'consignments'
  >('sales');

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
    if (window.electronAPI) {
      // Strip out the URI prefix before sending raw CSV to Electron FS
      window.electronAPI.files.saveCSV(`${filename}.csv`, csvContent.replace('data:text/csv;charset=utf-8,', ''));
    } else {
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `${filename}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
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
      <PageHeader
        title="Financial & Statutory Reports"
        subtitle="Normalized ledger extracts • GST GSTR-1 preparation • Receivables aging & consignment audits"
        actions={
          <>
            {activeReport === 'sales' && (
              <Button variant="primary" size="sm" onClick={handleExportSales}>
                <Download className="w-3.5 h-3.5" />
                <span>Export Sales CSV</span>
              </Button>
            )}
            {activeReport === 'receivables' && (
              <Button variant="primary" size="sm" onClick={handleExportReceivables}>
                <Download className="w-3.5 h-3.5" />
                <span>Export Receivables CSV</span>
              </Button>
            )}
          </>
        }
      />

      {/* Report Selection Tabs */}
      <Tabs
        ariaLabel="Reports"
        activeId={activeReport}
        onSelect={(id) => setActiveReport(id as 'sales' | 'receivables' | 'gst' | 'inventory' | 'consignments')}
        tabs={[
          { id: 'sales', label: 'Sales & Invoice Register' },
          { id: 'receivables', label: 'Receivables & Credit Summary' },
          { id: 'gst', label: 'GST / Tax Compliance (GSTR-1)' },
          { id: 'inventory', label: 'Warehouse Stock Valuation' },
          { id: 'consignments', label: 'Customer Consignment Balances' },
        ]}
      />

      {/* Report 1: Sales & Invoice Register */}
      {activeReport === 'sales' && (
        <TableShell>
          <CardHeader>
            <span className="font-bold text-foreground uppercase tracking-wide text-xs">
              Finalized Sales Invoices ({finalizedInvoices.length})
            </span>
            <div className="font-mono text-muted-foreground text-xs">
              Total Sales Volume:{' '}
              <span className="font-bold text-foreground">
                {formatINR(finalizedInvoices.reduce((s, i) => s + i.grand_total, 0))}
              </span>
            </div>
          </CardHeader>

          <div className="overflow-x-auto">
            <Table className="text-left border-collapse">
            <caption className="sr-only">Sales and invoice register report</caption>
            <THead>
              <TR className="hover:bg-transparent">
                <TH scope="col">Invoice #</TH>
                  <TH scope="col">Date</TH>
                  <TH scope="col">Customer Entity</TH>
                  <TH scope="col" className="text-right">Taxable</TH>
                  <TH scope="col" className="text-right">CGST</TH>
                  <TH scope="col" className="text-right">SGST</TH>
                  <TH scope="col" className="text-right">IGST</TH>
                  <TH scope="col" className="text-right px-4">Grand Total</TH>
              </TR>
            </THead>
            <TBody className="font-mono text-[11px]">
                {finalizedInvoices.map((inv) => (
                  <TR key={inv.id}>
                    <TD className="font-bold">{inv.invoice_number}</TD>
                    <TD className="text-muted-foreground">
                      {new Date(inv.invoice_date).toLocaleDateString()}
                    </TD>
                    <TD className="font-sans font-semibold">
                      {inv.customer_snapshot.customer_name}
                    </TD>
                    <TD className="text-right">{formatINR(inv.taxable_amount)}</TD>
                    <TD className="text-right text-muted-foreground">{formatINR(inv.cgst)}</TD>
                    <TD className="text-right text-muted-foreground">{formatINR(inv.sgst)}</TD>
                    <TD className="text-right text-muted-foreground">{formatINR(inv.igst)}</TD>
                    <TD className="text-right font-bold">{formatINR(inv.grand_total)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </TableShell>
      )}

      {/* Report 2: Receivables Summary */}
      {activeReport === 'receivables' && (
        <TableShell>
          <div className="overflow-x-auto">
            <Table className="text-left border-collapse">
            <caption className="sr-only">Receivables and credit summary report</caption>
            <THead>
              <TR className="hover:bg-transparent">
                <TH scope="col">Customer Entity</TH>
                  <TH scope="col">Location</TH>
                  <TH scope="col" className="text-right">Total Invoiced (Debits)</TH>
                  <TH scope="col" className="text-right">Total Collected (Credits)</TH>
                  <TH scope="col" className="text-right px-4">Net Outstanding Balance</TH>
              </TR>
            </THead>
            <TBody>
                {receivablesData.map((row) => (
                  <TR key={row.customerId}>
                    <TD className="font-semibold">{row.customerName}</TD>
                    <TD className="text-muted-foreground font-mono text-[11px]">
                      {row.city}, {row.state}
                    </TD>
                    <TD className="text-right font-mono">
                      {formatINR(row.totalBilled)}
                    </TD>
                    <TD className="text-right font-mono text-emerald-800 dark:text-emerald-300">
                      {formatINR(row.totalPaid)}
                    </TD>
                    <TD className="text-right font-mono font-bold text-sm">
                      <span className={row.outstanding > 0 ? 'text-amber-800 dark:text-amber-300' : 'text-emerald-800 dark:text-emerald-300'}>
                        {formatINR(row.outstanding)}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </TableShell>
      )}

      {/* Report 3: GST Tax Summary */}
      {activeReport === 'gst' && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <KpiCard label="Total Taxable Value" value={formatINR(totalTaxable)} />
            <KpiCard label="Total CGST (Intra-state)" value={formatINR(totalCGST)} />
            <KpiCard label="Total SGST (Intra-state)" value={formatINR(totalSGST)} />
            <KpiCard
              label="Total IGST (Inter-state)"
              value={formatINR(totalIGST)}
              tone="info"
              valueClassName="text-sky-800 dark:text-sky-300"
            />
          </div>

          <Well className="text-xs space-y-2">
            <div className="font-bold text-foreground">Total Statutory Tax Liability: {formatINR(totalTaxCollected)}</div>
            <div className="text-muted-foreground leading-relaxed">
              Inter-state transactions (customers with state code other than 24) are charged IGST {businessSettings.default_gst_rate}%. Intra-state supplies within Gujarat are split equally into CGST {businessSettings.default_gst_rate / 2}% and SGST {businessSettings.default_gst_rate / 2}%.
            </div>
          </Well>
        </div>
      )}

      {/* Report 4: Inventory Valuation */}
      {activeReport === 'inventory' && (
        <TableShell>
          <Table className="text-left border-collapse">
            <caption className="sr-only">Warehouse stock valuation report</caption>
            <THead>
              <TR className="hover:bg-transparent">
                <TH scope="col">Product Name</TH>
                <TH scope="col">SKU</TH>
                <TH scope="col" className="text-right">Physical Warehouse Stock</TH>
                <TH scope="col" className="text-right">UOM</TH>
              </TR>
            </THead>
            <TBody>
              {Object.values(products).map((p) => {
                const stock = getCurrentCompanyStock(p.id);
                const uom = uoms[p.primary_unit_id];
                return (
                  <TR key={p.id}>
                    <TD className="font-semibold">{p.product_name}</TD>
                    <TD className="font-mono text-muted-foreground text-[11px]">{p.sku}</TD>
                    <TD className="text-right font-mono font-bold">{stock.toLocaleString()}</TD>
                    <TD className="text-right font-mono text-muted-foreground">{uom?.code}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableShell>
      )}

      {/* Report 5: Consignments */}
      {activeReport === 'consignments' && (
        <TableShell>
          <CardHeader>
            <span className="text-xs text-muted-foreground">
              Consignment stock physically held across client locations.
            </span>
          </CardHeader>
          <Table className="text-left border-collapse">
            <caption className="sr-only">Customer consignment balances report</caption>
            <THead>
              <TR className="hover:bg-transparent">
                <TH scope="col">Client Consignee</TH>
                <TH scope="col">State</TH>
                <TH scope="col">Location</TH>
              </TR>
            </THead>
            <TBody>
              {Object.values(customers).map((c) => (
                <TR key={c.id}>
                  <TD className="font-semibold">{c.customer_name}</TD>
                  <TD className="font-mono text-[11px]">{c.state} ({getCustomerStateCode(c)})</TD>
                  <TD className="text-muted-foreground">{c.city}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableShell>
      )}
    </div>
  );
};
