import React, { useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { formatINR, roundCurrency, toPcsDisplayQty, toDisplayWeight, getCustomerStateCode } from '../utils/calculations';
import {
  Download
} from 'lucide-react';
import { Button, CardHeader, Input, KpiCard, Label, PageHeader, TableShell, Table, THead, TBody, TR, TH, TD, Well, Tabs } from '../components/ui';
import { CustomerPicker, firstCustomerId } from '../components/common/CustomerPicker';
import { buildMovementLedgerPdf, docToBase64 } from '../utils/pdfDocuments';
import { useT } from '../i18n';

export const ReportsView: React.FC = () => {
  const { t } = useT();
  const {
    invoices,
    invoicePayments,
    customers,
    products,
    uoms,
    productUnits,
    customerInventoryMovements,
    getCurrentCompanyStock,
    getPieceWeightMapping,
    businessSettings
  } = useAccountingStore();

  const [activeReport, setActiveReport] = useState<
    'sales' | 'receivables' | 'payments' | 'gst' | 'inventory' | 'consignments' | 'movements'
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

  // 4. Customer Movement Ledger (deliveries + returns for one customer).
  const [movCustomerId, setMovCustomerId] = useState('cust-1');
  const [movFrom, setMovFrom] = useState('');
  const [movTo, setMovTo] = useState('');
  const [movBusy, setMovBusy] = useState(false);
  const effectiveMovCustomerId = firstCustomerId(customers, movCustomerId);
  const movCustomer = customers[effectiveMovCustomerId];

  interface MovLedgerRow {
    id: string;
    date: string;
    docNo: string;
    isReturn: boolean;
    productId: string;
    productName: string;
    signedQty: number;
    unitCode: string;
    isPcs: boolean;
    signedGrams: number | null;
  }
  const movRows: MovLedgerRow[] = Object.values(customerInventoryMovements)
    .filter((m) => {
      if (m.customer_id !== effectiveMovCustomerId) return false;
      if (m.movement_type !== 'DISPATCH' && m.movement_type !== 'RETURN') return false;
      const day = (m.movement_date || '').slice(0, 10);
      if (movFrom && day < movFrom) return false;
      if (movTo && day > movTo) return false;
      return true;
    })
    .sort((a, b) => new Date(a.movement_date).getTime() - new Date(b.movement_date).getTime())
    .map((m) => {
      const isReturn = m.movement_type === 'RETURN';
      const signedQty = roundCurrency(isReturn ? -m.quantity : m.quantity);
      const mapping = getPieceWeightMapping(m.product_id);
      const isPcs = !!mapping && m.unit_id === mapping.pcsUnitId;
      const signedGrams = isPcs ? roundCurrency(signedQty * mapping!.gramsPerPiece) : null;
      return {
        id: m.id,
        date: m.movement_date,
        docNo: m.reference_id,
        isReturn,
        productId: m.product_id,
        productName: products[m.product_id]?.product_name || m.product_id,
        signedQty,
        unitCode: uoms[m.unit_id]?.code || '',
        isPcs,
        signedGrams
      };
    });

  interface MovLedgerTotal {
    productId: string;
    productName: string;
    unitCode: string;
    dispatched: number;
    returned: number;
    net: number;
    netGrams: number | null;
  }
  const movTotals: MovLedgerTotal[] = (() => {
    const byKey = new Map<string, MovLedgerTotal & { gramsPerPiece: number | null }>();
    for (const r of movRows) {
      const key = `${r.productId}::${r.unitCode}`;
      let t = byKey.get(key);
      if (!t) {
        const prod = products[r.productId];
        const mapping = getPieceWeightMapping(r.productId);
        t = {
          productId: r.productId,
          productName: prod?.product_name || r.productId,
          unitCode: r.unitCode,
          dispatched: 0,
          returned: 0,
          net: 0,
          netGrams: null,
          gramsPerPiece: r.isPcs && mapping ? mapping.gramsPerPiece : null
        };
        byKey.set(key, t);
      }
      if (r.signedQty >= 0) t.dispatched = roundCurrency(t.dispatched + r.signedQty);
      else t.returned = roundCurrency(t.returned - r.signedQty);
      t.net = roundCurrency(t.dispatched - t.returned);
      t.netGrams = t.gramsPerPiece !== null ? roundCurrency(t.net * t.gramsPerPiece) : null;
    }
    return [...byKey.values()]
      .map(({ gramsPerPiece: _g, ...rest }) => rest)
      .sort((a, b) => a.productName.localeCompare(b.productName));
  })();

  const movPeriodLabel =
    movFrom || movTo ? `${movFrom || '…'} to ${movTo || '…'}` : 'All time';

  const handleExportMovements = () => {
    const headers = ['Date', 'Challan / Slip No.', 'Type', 'Product', 'Quantity', 'Unit', 'Weight'];
    const rows = movRows.map((r) => {
      const w = r.signedGrams !== null ? toDisplayWeight(Math.abs(r.signedGrams)) : null;
      return [
        new Date(r.date).toLocaleDateString(),
        r.docNo,
        r.isReturn ? t('reports.movReturn') : t('reports.movDelivery'),
        r.productName,
        r.signedQty,
        r.unitCode,
        w ? `${r.signedGrams! < 0 ? '-' : ''}${w.qty} ${w.unit}` : ''
      ];
    });
    const custNo = movCustomer?.customer_number || effectiveMovCustomerId;
    exportToCSV(`movement_ledger_${custNo}_${movFrom || 'all'}_${movTo || 'all'}`, headers, rows);
  };

  const handleDownloadMovementsPdf = async () => {
    if (movBusy || movRows.length === 0) return;
    setMovBusy(true);
    try {
      const custLabel = movCustomer
        ? `${movCustomer.customer_name} (${movCustomer.city || ''}${movCustomer.state ? `, ${movCustomer.state}` : ''})`
        : effectiveMovCustomerId;
      const doc = buildMovementLedgerPdf({
        business: businessSettings,
        logoDataUrl: businessSettings.logo_data ?? undefined,
        customerName: movCustomer?.customer_name || effectiveMovCustomerId,
        customerMeta: custLabel,
        periodLabel: movPeriodLabel,
        rows: movRows.map((r) => {
          const w = r.signedGrams !== null ? toDisplayWeight(Math.abs(r.signedGrams)) : null;
          const sign = r.signedQty < 0 ? '-' : '+';
          return {
            date: new Date(r.date).toLocaleDateString(),
            docNo: r.docNo,
            type: r.isReturn ? t('reports.movReturn') : t('reports.movDelivery'),
            productName: r.productName,
            qty: `${sign}${Math.abs(r.signedQty)}`,
            unitCode: r.unitCode,
            weight: w ? `${r.signedGrams! < 0 ? '-' : ''}${w.qty} ${w.unit}` : '-'
          };
        }),
        totals: movTotals.map((x) => {
          const w = x.netGrams !== null ? toDisplayWeight(Math.abs(x.netGrams)) : null;
          return {
            productName: x.productName,
            dispatched: `${x.dispatched}`,
            returned: `${x.returned}`,
            net: `${x.net}`,
            unitCode: x.unitCode,
            netWeight: w ? `${x.netGrams! < 0 ? '-' : ''}${w.qty} ${w.unit}` : '-'
          };
        })
      });
      const filename = `Movement-Ledger-${movCustomer?.customer_number || effectiveMovCustomerId}-${movFrom || 'all'}-${movTo || 'all'}.pdf`;
      if (!window.electronAPI?.files?.savePDFBytes) {
        doc.save(filename);
        return;
      }
      await window.electronAPI.files.savePDFBytes(filename, docToBase64(doc));
    } finally {
      setMovBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <PageHeader
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
        actions={
          <>
            {activeReport === 'sales' && (
              <Button variant="primary" size="sm" onClick={handleExportSales}>
                <Download className="w-3.5 h-3.5" />
                <span>{t('reports.exportSales')}</span>
              </Button>
            )}
            {activeReport === 'receivables' && (
              <Button variant="primary" size="sm" onClick={handleExportReceivables}>
                <Download className="w-3.5 h-3.5" />
                <span>{t('reports.exportReceivables')}</span>
              </Button>
            )}
            {activeReport === 'movements' && (
              <>
                <Button variant="primary" size="sm" onClick={handleExportMovements} disabled={movRows.length === 0}>
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('reports.movExportCsv')}</span>
                </Button>
                <Button variant="secondary" size="sm" onClick={() => void handleDownloadMovementsPdf()} disabled={movBusy || movRows.length === 0}>
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('printBar.downloadPdf')}</span>
                </Button>
                <Button variant="secondary" size="sm" onClick={() => window.print()} disabled={movRows.length === 0}>
                  <span>{t('printBar.print')}</span>
                </Button>
              </>
            )}
          </>
        }
      />

      {/* Report Selection Tabs */}
      <Tabs
        ariaLabel={t('reports.tabsLabel')}
        activeId={activeReport}
        onSelect={(id) => setActiveReport(id as 'sales' | 'receivables' | 'gst' | 'inventory' | 'consignments' | 'movements')}
        tabs={[
          { id: 'sales', label: t('reports.tabSales') },
          { id: 'receivables', label: t('reports.tabReceivables') },
          { id: 'gst', label: t('reports.tabGst') },
          { id: 'inventory', label: t('reports.tabInventory') },
          { id: 'consignments', label: t('reports.tabConsignments') },
          { id: 'movements', label: t('reports.tabMovements') },
        ]}
      />

      {/* Report 1: Sales & Invoice Register */}
      {activeReport === 'sales' && (
        <TableShell>
          <CardHeader>
            <span className="font-bold text-foreground uppercase tracking-wide text-xs">
              {t('reports.salesTitle', { count: finalizedInvoices.length })}
            </span>
            <div className="font-mono text-muted-foreground text-xs">
              {t('reports.salesVolume')}{' '}
              <span className="font-bold text-foreground">
                {formatINR(finalizedInvoices.reduce((s, i) => s + i.grand_total, 0))}
              </span>
            </div>
          </CardHeader>

          <div className="overflow-x-auto">
            <Table className="text-left border-collapse">
            <caption className="sr-only">{t('reports.salesCaption')}</caption>
            <THead>
              <TR className="hover:bg-transparent">
                <TH scope="col">{t('reports.thInvoice')}</TH>
                  <TH scope="col">{t('reports.thDate')}</TH>
                  <TH scope="col">{t('reports.thCustomer')}</TH>
                  <TH scope="col" className="text-right">{t('reports.thTaxable')}</TH>
                  <TH scope="col" className="text-right">{t('reports.thCgst')}</TH>
                  <TH scope="col" className="text-right">{t('reports.thSgst')}</TH>
                  <TH scope="col" className="text-right">{t('reports.thIgst')}</TH>
                  <TH scope="col" className="text-right px-4">{t('reports.thGrand')}</TH>
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
            <caption className="sr-only">{t('reports.receivablesCaption')}</caption>
            <THead>
              <TR className="hover:bg-transparent">
                <TH scope="col">{t('reports.thCustomer')}</TH>
                  <TH scope="col">{t('reports.thLocation')}</TH>
                  <TH scope="col" className="text-right">{t('reports.thBilled')}</TH>
                  <TH scope="col" className="text-right">{t('reports.thCollected')}</TH>
                  <TH scope="col" className="text-right px-4">{t('reports.thNet')}</TH>
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
            <KpiCard label={t('reports.kpiTaxable')} value={formatINR(totalTaxable)} />
            <KpiCard label={t('reports.kpiCgst')} value={formatINR(totalCGST)} />
            <KpiCard label={t('reports.kpiSgst')} value={formatINR(totalSGST)} />
            <KpiCard
              label={t('reports.kpiIgst')}
              value={formatINR(totalIGST)}
              tone="info"
              valueClassName="text-sky-800 dark:text-sky-300"
            />
          </div>

          <Well className="text-xs space-y-2">
            <div className="font-bold text-foreground">{t('reports.taxLiability', { amount: formatINR(totalTaxCollected) })}</div>
            <div className="text-muted-foreground leading-relaxed">
              {t('reports.taxNote', { rate: businessSettings.default_gst_rate, half: businessSettings.default_gst_rate / 2 })}
            </div>
          </Well>
        </div>
      )}

      {/* Report 4: Inventory Valuation */}
      {activeReport === 'inventory' && (
        <TableShell>
          <Table className="text-left border-collapse">
            <caption className="sr-only">{t('reports.inventoryCaption')}</caption>
            <THead>
              <TR className="hover:bg-transparent">
                <TH scope="col">{t('reports.thProduct')}</TH>
                <TH scope="col">{t('reports.thSku')}</TH>
                <TH scope="col" className="text-right">{t('reports.thPhysical')}</TH>
                <TH scope="col" className="text-right">{t('reports.thUom')}</TH>
              </TR>
            </THead>
            <TBody>
              {Object.values(products).map((p) => {
                const stock = getCurrentCompanyStock(p.id);
                const uom = uoms[p.primary_unit_id];
                // Piece-mapped products lead with PCS (weight as reference).
                const mapping = getPieceWeightMapping(p.id);
                const pus = mapping
                  ? Object.values(productUnits).filter((pu) => pu.product_id === p.id)
                  : [];
                const pcs = mapping ? toPcsDisplayQty(mapping, stock, p.primary_unit_id, pus) : null;
                return (
                  <TR key={p.id}>
                    <TD className="font-semibold">{p.product_name}</TD>
                    <TD className="font-mono text-muted-foreground text-[11px]">{p.sku}</TD>
                    <TD className="text-right font-mono font-bold">
                      {pcs !== null ? (
                        <>{pcs.toLocaleString()} PCS<span className="block text-[10px] font-normal text-muted-foreground">(≈ {stock.toLocaleString()} {uom?.code})</span></>
                      ) : (
                        stock.toLocaleString()
                      )}
                    </TD>
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
              {t('reports.consignNote')}
            </span>
          </CardHeader>
          <Table className="text-left border-collapse">
            <caption className="sr-only">{t('reports.consignCaption')}</caption>
            <THead>
              <TR className="hover:bg-transparent">
                <TH scope="col">{t('reports.thConsignee')}</TH>
                <TH scope="col">{t('reports.thState')}</TH>
                <TH scope="col">{t('reports.thLocation2')}</TH>
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

      {/* Report 6: Customer Movement Ledger (deliveries + returns, signed) */}
      {activeReport === 'movements' && (
        <div className="space-y-4">
          <div className="no-print flex flex-col lg:flex-row lg:items-end gap-3 p-4 bg-muted border border-input rounded-lg">
            <div className="flex-1 min-w-[220px]">
              <Label className="mb-1">{t('reports.movCustomer')}</Label>
              <CustomerPicker
                value={effectiveMovCustomerId}
                onChange={(id) => setMovCustomerId(id)}
                customers={customers}
              />
            </div>
            <div>
              <Label className="mb-1">{t('reports.movFrom')}</Label>
              <Input
                type="date"
                value={movFrom}
                onChange={(e) => setMovFrom(e.target.value)}
                className="w-full font-mono"
              />
            </div>
            <div>
              <Label className="mb-1">{t('reports.movTo')}</Label>
              <Input
                type="date"
                value={movTo}
                onChange={(e) => setMovTo(e.target.value)}
                className="w-full font-mono"
              />
            </div>
            <div className="text-[11px] font-mono text-muted-foreground whitespace-nowrap pb-2">
              {movCustomer?.customer_name || ''} • {movPeriodLabel}
            </div>
          </div>

          {movTotals.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {movTotals.map((x) => {
                const w = x.netGrams !== null ? toDisplayWeight(Math.abs(x.netGrams)) : null;
                return (
                  <div key={`${x.productId}::${x.unitCode}`} className="p-3.5 bg-card border border-border rounded-lg shadow-2xs text-xs">
                    <div className="font-semibold text-foreground">{x.productName}</div>
                    <div className="mt-1.5 space-y-0.5 font-mono text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('reports.movDispatched')}</span>
                        <span className="text-emerald-800 dark:text-emerald-300 font-bold">+{x.dispatched} {x.unitCode}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('reports.movReturned')}</span>
                        <span className="text-destructive font-bold">-{x.returned} {x.unitCode}</span>
                      </div>
                      <div className="flex justify-between border-t border-border pt-1">
                        <span className="text-muted-foreground">{t('reports.movNet')}</span>
                        <span className="font-bold text-foreground">
                          {x.net} {x.unitCode}
                          {w && <span className="text-muted-foreground font-normal"> (= {w.qty} {w.unit})</span>}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <TableShell>
            <Table className="text-left border-collapse">
              <caption className="sr-only">{t('reports.movCaption')}</caption>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH scope="col">{t('reports.thDate')}</TH>
                  <TH scope="col">{t('reports.movDocNo')}</TH>
                  <TH scope="col">{t('reports.movType')}</TH>
                  <TH scope="col">{t('reports.thProduct')}</TH>
                  <TH scope="col" className="text-right">{t('reports.movQty')}</TH>
                  <TH scope="col" className="text-right">{t('reports.movWeight')}</TH>
                </TR>
              </THead>
              <TBody>
                {movRows.length === 0 ? (
                  <tr>
                    <TD colSpan={6} className="py-8 text-center text-muted-foreground">
                      {t('reports.movEmpty')}
                    </TD>
                  </tr>
                ) : (
                  movRows.map((r) => {
                    const w = r.signedGrams !== null ? toDisplayWeight(Math.abs(r.signedGrams)) : null;
                    const neg = r.signedQty < 0;
                    return (
                      <TR key={r.id} className="font-mono text-[11px]">
                        <TD className="text-muted-foreground whitespace-nowrap">
                          {new Date(r.date).toLocaleDateString()}
                        </TD>
                        <TD className="font-bold text-foreground">{r.docNo}</TD>
                        <TD>
                          <span
                            className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md border ${
                              r.isReturn
                                ? 'bg-destructive/10 text-destructive border-destructive/25'
                                : 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/25'
                            }`}
                          >
                            {r.isReturn ? t('reports.movReturn') : t('reports.movDelivery')}
                          </span>
                        </TD>
                        <TD className="font-sans font-semibold text-xs">{r.productName}</TD>
                        <TD className={`text-right font-bold ${neg ? 'text-destructive' : 'text-emerald-800 dark:text-emerald-300'}`}>
                          {neg ? '-' : '+'}{Math.abs(r.signedQty)} {r.unitCode}
                        </TD>
                        <TD className="text-right text-muted-foreground">
                          {w ? `${neg ? '-' : ''}${w.qty} ${w.unit}` : '—'}
                        </TD>
                      </TR>
                    );
                  })
                )}
              </TBody>
            </Table>
          </TableShell>
        </div>
      )}
    </div>
  );
};
