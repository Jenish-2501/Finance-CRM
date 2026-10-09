import React, { useState, useEffect, useMemo } from 'react';
import { useAccountingStore } from '../../store/accountingStore';
import { formatINR, numberToWordsINR, roundCurrency } from '../../utils/calculations';
import { buildChallanPdf, docToBase64 } from '../../utils/pdfDocuments';
import { Printer, X, Download, RefreshCw } from 'lucide-react';
import { Badge } from '../common/Badge';

export type ChallanCopyType = 'ORIGINAL' | 'DUPLICATE' | 'TRIPLICATE';

interface DeliveryChallanPrintViewProps {
  movementId?: string;
  challanReference?: string;
  onClose?: () => void;
}

export const DeliveryChallanPrintView: React.FC<DeliveryChallanPrintViewProps> = ({
  movementId,
  challanReference,
  onClose
}) => {
  const {
    businessSettings,
    customers,
    products,
    uoms,
    customerInventoryMovements,
    resolvePriceForCustomer
  } = useAccountingStore();

  const [copyType, setCopyType] = useState<ChallanCopyType>('ORIGINAL');

  // Find all movements associated with this challan or movement
  const movements = useMemo(() => {
    const allMovs = Object.values(customerInventoryMovements);
    if (movementId) {
      const target = customerInventoryMovements[movementId];
      if (target) {
        const grouped = allMovs.filter(
          (m) =>
            m.reference_id === target.reference_id &&
            m.customer_id === target.customer_id &&
            (m.movement_type === 'DISPATCH' || m.movement_type === 'ADJUSTMENT_IN')
        );
        return grouped.length > 0 ? grouped : [target];
      }
    }
    if (challanReference) {
      const matches = allMovs.filter(
        (m) =>
          m.reference_id === challanReference &&
          (m.movement_type === 'DISPATCH' || m.movement_type === 'ADJUSTMENT_IN')
      );
      if (matches.length > 0) return matches;
    }
    // Fallback: newest dispatch
    const dispatches = allMovs.filter((m) => m.movement_type === 'DISPATCH');
    return dispatches.length > 0 ? [dispatches[dispatches.length - 1]] : [];
  }, [movementId, challanReference, customerInventoryMovements]);

  const primaryMovement = movements[0];
  const customer = primaryMovement ? customers[primaryMovement.customer_id] : null;

  const handlePrint = () => {
    window.print();
  };

  const [downloading, setDownloading] = useState(false);

  // Printer connection (Electron only; hidden in browser preview).
  interface PrinterInfo { name: string; displayName: string; description: string }
  const PRINTER_STORAGE_KEY = 'acculedger-printer-name';
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [copies, setCopies] = useState(1);
  const [printersLoading, setPrintersLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const canUsePrintBridge = Boolean(window.electronAPI?.printers && window.electronAPI?.printing);

  const loadPrinters = async () => {
    if (!window.electronAPI?.printers) return;
    setPrintersLoading(true);
    try {
      const list = await window.electronAPI.printers.list();
      setPrinters(list);
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(PRINTER_STORAGE_KEY);
      } catch {
        saved = null;
      }
      if (saved && list.some((p) => p.name === saved)) {
        setSelectedPrinter(saved);
      } else {
        setSelectedPrinter(list[0]?.name || '');
      }
    } catch {
      setPrintStatus({ kind: 'error', text: 'Could not read printers. Check the printer connection and retry.' });
    } finally {
      setPrintersLoading(false);
    }
  };

  useEffect(() => {
    void loadPrinters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectPrinter = (name: string) => {
    setSelectedPrinter(name);
    setPrintStatus(null);
    try {
      localStorage.setItem(PRINTER_STORAGE_KEY, name);
    } catch {
      // storage failure must not block printing
    }
  };

  const printErrorText = (error?: string): string => {
    if (error === 'PRINTER_NOT_FOUND') return 'Printer not found — the list was refreshed, please pick again.';
    if (error === 'PRINTER_LOOKUP_FAILED') return 'Could not reach printers. Check the connection and retry.';
    if (error === 'NO_WINDOW') return 'App window unavailable. Restart the app and retry.';
    return 'Print failed — check the printer is online with paper loaded.';
  };

  const handleDirectPrint = async () => {
    if (!window.electronAPI?.printing) return;
    if (!selectedPrinter) {
      setPrintStatus({ kind: 'error', text: 'Choose a printer first.' });
      return;
    }
    const nCopies = Math.max(1, Math.min(99, Math.floor(Number(copies) || 1)));
    setCopies(nCopies);
    setPrinting(true);
    setPrintStatus(null);
    try {
      const result = await window.electronAPI.printing.printPage({ deviceName: selectedPrinter, copies: nCopies, silent: true });
      if (result.ok) {
        setPrintStatus({ kind: 'success', text: `Sent ${nCopies} ${nCopies === 1 ? 'copy' : 'copies'} to ${selectedPrinter}.` });
      } else {
        if (result.error === 'PRINTER_NOT_FOUND') await loadPrinters();
        setPrintStatus({ kind: 'error', text: printErrorText(result.error) });
      }
    } catch {
      setPrintStatus({ kind: 'error', text: 'Print failed — desktop app may need a restart.' });
    } finally {
      setPrinting(false);
    }
  };

  const handleSystemDialogPrint = async () => {
    if (!window.electronAPI?.printing) {
      window.print();
      return;
    }
    setPrinting(true);
    setPrintStatus(null);
    try {
      const result = await window.electronAPI.printing.printPage(
        selectedPrinter ? { deviceName: selectedPrinter, silent: false } : { silent: false }
      );
      // PRINT_FAILED after a system dialog usually means the user pressed Cancel:
      // stay silent instead of reporting an error.
      if (!result.ok && result.error !== undefined && result.error !== 'PRINT_FAILED') {
        setPrintStatus({ kind: 'error', text: printErrorText(result.error) });
      }
    } catch {
      setPrintStatus({ kind: 'error', text: 'Print failed — desktop app may need a restart.' });
    } finally {
      setPrinting(false);
    }
  };
  const handleDownloadPDF = async () => {
    if (!primaryMovement || !customer) return;
    const safeRef = (primaryMovement.reference_id || 'challan').replace(/[^a-z0-9-_]+/gi, '-');
    const filename = `Challan-${safeRef}-${copyType}.pdf`;
    const doc = buildChallanPdf({
      business: businessSettings,
      customer,
      primaryMovement,
      copyLabel: copyLabels[copyType],
      challanDate,
      timeOfRemoval,
      itemRows,
      totalQuantity,
      totalIndicativeVal
    });
    // Web fallback: direct jsPDF download. Electron: save dialog to chosen folder.
    if (!window.electronAPI?.files?.savePDFBytes) {
      doc.save(filename);
      return;
    }
    setDownloading(true);
    try {
      await window.electronAPI.files.savePDFBytes(filename, docToBase64(doc));
    } finally {
      setDownloading(false);
    }
  };

  const copyLabels: Record<ChallanCopyType, string> = {
    ORIGINAL: 'ORIGINAL FOR CONSIGNEE (RECIPIENT)',
    DUPLICATE: 'DUPLICATE FOR TRANSPORTER',
    TRIPLICATE: 'TRIPLICATE FOR CONSIGNOR (SUPPLIER)'
  };

  if (!primaryMovement || !customer) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-sm text-neutral-600">No delivery challan records found for the requested dispatch.</p>
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-900 text-white rounded text-xs font-semibold"
          >
            Close
          </button>
        )}
      </div>
    );
  }

  // Calculate item values and totals
  let totalQuantity = 0;
  let totalIndicativeVal = 0;

  const itemRows = movements.map((mov, idx) => {
    const prod = products[mov.product_id];
    const uom = uoms[mov.unit_id];
    // Agreed customer price wins; base price otherwise; legacy 100 fallback
    // only when neither exists (preserves previous no-price behavior).
    const resolved = resolvePriceForCustomer(mov.product_id, mov.unit_id, mov.customer_id);
    const unitPrice = resolved.isCustom ? resolved.price : resolved.basePrice || 100;
    const lineTotal = roundCurrency(mov.quantity * unitPrice);

    totalQuantity += mov.quantity;
    totalIndicativeVal = roundCurrency(totalIndicativeVal + lineTotal);

    return {
      sNo: idx + 1,
      movementId: mov.id,
      productName: prod?.product_name || 'Industrial Material',
      sku: prod?.sku || 'SKU-GEN',
      description: prod?.description || '',
      hsnCode: prod?.hsn_code || '7214',
      quantity: mov.quantity,
      unitCode: uom?.code || 'PCS',
      indicativePrice: unitPrice,
      isCustomPrice: resolved.isCustom,
      lineTotal,
      notes: mov.notes
    };
  });

  const challanDate = new Date(primaryMovement.movement_date || primaryMovement.created_at).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const timeOfRemoval = new Date(primaryMovement.movement_date || primaryMovement.created_at).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="space-y-6">
      {/* Top Action Bar (hidden when printing) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-neutral-100 border border-neutral-300 rounded-lg no-print">
        <div className="flex items-center gap-3">
          <Badge variant="neutral" size="md">
            Delivery Challan #{primaryMovement.reference_id}
          </Badge>
          <div className="flex items-center gap-1 bg-white border border-neutral-300 rounded p-0.5">
            {(['ORIGINAL', 'DUPLICATE', 'TRIPLICATE'] as ChallanCopyType[]).map((type) => (
              <button
                key={type}
                onClick={() => setCopyType(type)}
                className={`px-2.5 py-1 text-[11px] font-mono rounded transition-colors ${
                  copyType === type
                    ? 'bg-neutral-900 text-white font-semibold'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                {type === 'ORIGINAL' ? 'Consignee Copy' : type === 'DUPLICATE' ? 'Transporter' : 'Consignor'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadPDF}
            disabled={downloading}
            aria-label="Download challan as PDF file"
            className="px-4 py-2 text-xs font-semibold bg-white text-neutral-800 border border-neutral-300 rounded hover:bg-neutral-50 transition-colors flex items-center gap-2 shadow-2xs cursor-pointer disabled:opacity-60"
          >
            <Download className="w-4 h-4 text-neutral-600" aria-hidden="true" />
            <span>{downloading ? 'Preparing PDF…' : 'Download PDF'}</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-4 py-2 text-xs font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors flex items-center gap-2 shadow-2xs cursor-pointer"
          >
            <Printer className="w-4 h-4 text-white" />
            <span>Print Challan / Save PDF</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close challan preview"
              className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200 rounded transition-colors"
              title="Close Challan"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Printer connection bar (hidden when printing) */}
      {canUsePrintBridge && (
        <div className="p-4 bg-white border border-neutral-200 rounded-lg shadow-2xs no-print text-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <label className="block font-semibold text-neutral-700 mb-1">Printer</label>
              <div className="flex gap-2">
                <select
                  value={selectedPrinter}
                  onChange={(e) => handleSelectPrinter(e.target.value)}
                  disabled={printersLoading || printing}
                  className="flex-1 p-2 border border-neutral-300 rounded bg-white text-neutral-900 font-medium disabled:opacity-50"
                >
                  {printers.length === 0 ? (
                    <option value="">— No printers found —</option>
                  ) : (
                    printers.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.displayName || p.name}{p.description ? ` — ${p.description}` : ''}
                      </option>
                    ))
                  )}
                </select>
                <button
                  onClick={() => void loadPrinters()}
                  disabled={printersLoading}
                  title="Refresh printer list"
                  className="px-2.5 border border-neutral-300 rounded bg-white hover:bg-neutral-50 disabled:opacity-40"
                >
                  <RefreshCw className={`w-4 h-4 text-neutral-600 ${printersLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            <div className="w-24">
              <label className="block font-semibold text-neutral-700 mb-1">Copies</label>
              <input
                type="number"
                min={1}
                max={99}
                value={copies}
                onChange={(e) => setCopies(Number(e.target.value))}
                disabled={printing}
                className="w-full p-2 border border-neutral-300 rounded font-mono text-center disabled:opacity-50"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => void handleDirectPrint()}
                disabled={printing || !selectedPrinter}
                className="px-4 py-2 font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Printer className="w-4 h-4 text-white" />
                <span>{printing ? 'Printing…' : 'Print Challan'}</span>
              </button>
              <button
                onClick={() => void handleSystemDialogPrint()}
                disabled={printing}
                title="Open the system print dialog (preview & settings)"
                className="px-4 py-2 font-medium bg-white text-neutral-800 border border-neutral-300 rounded hover:bg-neutral-50 transition-colors disabled:opacity-50"
              >
                <span>System Dialog</span>
              </button>
            </div>
          </div>

          {printStatus && (
            <div
              role="status"
              className={`p-2.5 rounded border text-xs ${
                printStatus.kind === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              {printStatus.text}
            </div>
          )}
        </div>
      )}

      {/* Printable Challan Document Container */}
      <div className="bg-white border border-neutral-300 rounded-lg shadow-sm p-8 sm:p-10 max-w-4xl mx-auto text-neutral-900 print-container print:p-0 print:border-none print:shadow-none">
        {/* Document Header */}
        <div className="border-b-2 border-neutral-900 pb-4 mb-4">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-neutral-900 text-white font-bold flex items-center justify-center text-sm rounded">
                  AL
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-neutral-950 uppercase">
                    {businessSettings.business_name}
                  </h1>
                  <p className="text-[11px] text-neutral-500 font-mono">
                    {businessSettings.legal_name}
                  </p>
                </div>
              </div>
              <p className="text-xs text-neutral-600 max-w-md pt-1">
                {businessSettings.address}, {businessSettings.city}, {businessSettings.state} - {businessSettings.postal_code}, India
              </p>
              <div className="text-[11px] font-mono text-neutral-700 flex flex-wrap gap-x-4 pt-0.5">
                <span><strong>GSTIN:</strong> {businessSettings.gst_number}</span>
                <span><strong>PAN:</strong> {businessSettings.pan}</span>
                <span><strong>State Code:</strong> {businessSettings.state_code} ({businessSettings.state})</span>
              </div>
            </div>

            <div className="text-right sm:text-right shrink-0">
              <div className="inline-block px-3 py-1 bg-neutral-900 text-white font-bold text-sm tracking-wider uppercase rounded">
                DELIVERY CHALLAN
              </div>
              <div className="text-[10px] font-mono font-bold text-neutral-600 mt-1 uppercase">
                [ {copyLabels[copyType]} ]
              </div>
              <p className="text-[10px] text-neutral-500 mt-0.5 max-w-[240px]">
                Issued under Rule 55 of CGST / SGST Rules, 2017
              </p>
            </div>
          </div>
        </div>

        {/* Challan Metadata Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-neutral-50 border border-neutral-200 rounded text-xs mb-5 font-mono">
          <div>
            <span className="text-neutral-500 block text-[10px] uppercase">Challan Number:</span>
            <span className="font-bold text-neutral-900 text-sm">{primaryMovement.reference_id}</span>
          </div>

          <div>
            <span className="text-neutral-500 block text-[10px] uppercase">Challan Date:</span>
            <span className="font-semibold text-neutral-900">{challanDate}</span>
          </div>

          <div>
            <span className="text-neutral-500 block text-[10px] uppercase">Time of Removal:</span>
            <span className="text-neutral-800">{timeOfRemoval}</span>
          </div>

          <div>
            <span className="text-neutral-500 block text-[10px] uppercase">Nature of Movement:</span>
            <span className="font-semibold text-neutral-900">
              {primaryMovement.dispatch_purpose || 'Consignment Transfer / Holding'}
            </span>
          </div>
        </div>

        {/* Parties Box: Consignor (From) & Consignee (To) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 text-xs">
          {/* Dispatch From */}
          <div className="p-3.5 border border-neutral-200 rounded space-y-1">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-500 pb-1 border-b border-neutral-100 flex items-center justify-between">
              <span>Consignor (Dispatched From)</span>
              <span className="text-neutral-400">Warehouse Origin</span>
            </div>
            <div className="font-bold text-neutral-900 text-sm pt-1">{businessSettings.business_name}</div>
            <p className="text-neutral-600 leading-relaxed">
              {businessSettings.address}, {businessSettings.city}, {businessSettings.state} - {businessSettings.postal_code}
            </p>
            <div className="font-mono text-[11px] text-neutral-700 pt-1 space-y-0.5">
              <div><strong>GSTIN:</strong> {businessSettings.gst_number}</div>
              <div><strong>State / Code:</strong> {businessSettings.state} (Code: {businessSettings.state_code})</div>
              <div><strong>Contact:</strong> {businessSettings.phone} • {businessSettings.email}</div>
            </div>
          </div>

          {/* Dispatch To */}
          <div className="p-3.5 border border-neutral-200 rounded space-y-1 bg-neutral-50/50">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-500 pb-1 border-b border-neutral-100 flex items-center justify-between">
              <span>Consignee (Dispatched To)</span>
              <span className="text-emerald-700 font-semibold">Customer Site</span>
            </div>
            <div className="font-bold text-neutral-900 text-sm pt-1">{customer.customer_name}</div>
            <p className="text-neutral-600 leading-relaxed">
              {customer.address}, {customer.city}, {customer.state} - {customer.postal_code}
            </p>
            <div className="font-mono text-[11px] text-neutral-700 pt-1 space-y-0.5">
              <div><strong>GSTIN / UIN:</strong> {customer.gst_number}</div>
              <div><strong>State / Code:</strong> {customer.state} (Code: {customer.state_code})</div>
              <div><strong>Contact:</strong> {customer.mobile} • {customer.email}</div>
            </div>
          </div>
        </div>

        {/* Transportation & Logistics Box */}
        <div className="p-3 bg-neutral-50/80 border border-neutral-200 rounded mb-6 text-xs font-mono">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase">Vehicle Number:</span>
              <span className="font-bold text-neutral-900">
                {primaryMovement.vehicle_number || 'GJ-05-BX-4921 (Authorized)'}
              </span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase">Transporter Name:</span>
              <span className="text-neutral-800">
                {primaryMovement.transporter_name || 'Direct Road Logistics / Transport'}
              </span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase">E-Way Bill Number:</span>
              <span className="text-neutral-800">
                {primaryMovement.eway_bill_number || 'EWB-2026-N/A'}
              </span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase">Place of Supply:</span>
              <span className="font-semibold text-neutral-900">
                {customer.city}, {customer.state}
              </span>
            </div>
          </div>
          {primaryMovement.notes && (
            <div className="mt-2 pt-2 border-t border-neutral-200 text-[11px] text-neutral-600 font-sans">
              <strong>Instructions / Site Remarks:</strong> {primaryMovement.notes}
            </div>
          )}
        </div>

        {/* Dispatched Items Table */}
        <div className="border border-neutral-300 rounded overflow-hidden mb-6">
          <table className="w-full text-left text-xs border-collapse">
            <caption className="sr-only">Dispatched goods line items</caption>
            <thead>
              <tr className="border-b border-neutral-300 bg-neutral-100 font-mono text-[11px] text-neutral-700">
                <th scope="col" className="py-2.5 px-3 text-center w-10">#</th>
                <th scope="col" className="py-2.5 px-3">Description of Goods</th>
                <th scope="col" className="py-2.5 px-3 font-mono">SKU / Code</th>
                <th scope="col" className="py-2.5 px-3 font-mono">HSN Code</th>
                <th scope="col" className="py-2.5 px-3 text-right font-mono">Dispatched Qty</th>
                <th scope="col" className="py-2.5 px-3 font-mono">UOM</th>
                <th scope="col" className="py-2.5 px-3 text-right font-mono">Agreed Rate</th>
                <th scope="col" className="py-2.5 px-3 text-right font-mono">Total Value (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 font-sans">
              {itemRows.map((row) => (
                <tr key={row.movementId} className="hover:bg-neutral-50/50">
                  <td className="py-2.5 px-3 text-center font-mono text-neutral-500">{row.sNo}</td>
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-neutral-900">{row.productName}</div>
                    {row.description && (
                      <div className="text-[11px] text-neutral-500">{row.description}</div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-neutral-600">{row.sku}</td>
                  <td className="py-2.5 px-3 font-mono text-neutral-600">{row.hsnCode}</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-neutral-900 text-sm">
                    {row.quantity}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-neutral-600 uppercase">{row.unitCode}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-neutral-700">
                    {formatINR(row.indicativePrice)}
                    <span className={`block text-[9px] font-bold ${row.isCustomPrice ? 'text-emerald-700' : 'text-neutral-400'}`}>
                      {row.isCustomPrice ? 'AGREED' : 'BASE'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-semibold text-neutral-900">
                    {formatINR(row.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-neutral-300 bg-neutral-50 font-mono font-bold text-neutral-900 text-xs">
                <td colSpan={4} className="py-3 px-3 text-right uppercase">
                  Total Dispatched Quantity &amp; Value:
                </td>
                <td className="py-3 px-3 text-right text-sm font-bold text-neutral-950">
                  {totalQuantity}
                </td>
                <td className="py-3 px-3 uppercase text-[11px] text-neutral-600 font-normal">
                  Units
                </td>
                <td className="py-3 px-3"></td>
                <td className="py-3 px-3 text-right text-sm font-bold text-neutral-950">
                  {formatINR(totalIndicativeVal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Valuation & Statutory Notice */}
        <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded text-xs space-y-2 mb-6">
          <div className="font-mono text-xs">
            <strong className="text-neutral-700">Agreed Value in Words:</strong>{' '}
            <span className="font-semibold text-neutral-900">{numberToWordsINR(totalIndicativeVal)}</span>
          </div>
          <div className="text-[11px] text-neutral-600 leading-relaxed pt-1 border-t border-neutral-200">
            <strong>Statutory Declaration (Rule 55):</strong> This Delivery Challan is issued under Rule 55 of the Central Goods and Services Tax (CGST) Rules, 2017 for transfer and transportation of goods to the customer site on a consignment/holding basis.
            <strong> THIS DOCUMENT DOES NOT CONSTITUTE A TAX INVOICE OR SALE OF GOODS.</strong> Ownership, title, and legal risk of the material remain with the consignor ({businessSettings.business_name}) until a formal tax invoice is generated upon billing allocation.
          </div>
        </div>

        {/* Signature & Acknowledgment Section */}
        <div className="border border-neutral-200 rounded p-4 grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs text-center">
          <div className="flex flex-col justify-between h-28 border-r sm:border-r border-neutral-200 pr-3">
            <div className="text-[11px] font-semibold text-neutral-700">
              Receiver's Acknowledgment &amp; Stamp
            </div>
            <div className="space-y-1">
              <div className="border-t border-dashed border-neutral-400 w-3/4 mx-auto pt-1"></div>
              <p className="text-[10px] text-neutral-500">
                Received goods in sound order &amp; verified quantity
              </p>
            </div>
          </div>

          <div className="flex flex-col justify-between h-28 border-r sm:border-r border-neutral-200 px-3">
            <div className="text-[11px] font-semibold text-neutral-700">
              Transporter / Driver's Signature
            </div>
            <div className="space-y-1">
              <div className="border-t border-dashed border-neutral-400 w-3/4 mx-auto pt-1"></div>
              <p className="text-[10px] text-neutral-500">
                Accepted material for safe carriage to site
              </p>
            </div>
          </div>

          <div className="flex flex-col justify-between h-28 pl-3">
            <div className="text-[11px] font-semibold text-neutral-700">
              For <strong>{businessSettings.business_name}</strong>
            </div>
            <div className="space-y-1">
              <div className="border-t border-neutral-900 w-3/4 mx-auto pt-1"></div>
              <p className="text-[11px] font-bold text-neutral-900">
                Authorized Signatory
              </p>
            </div>
          </div>
        </div>

        {/* Footnote */}
        <div className="mt-4 pt-3 border-t border-neutral-200 text-center text-[10px] font-mono text-neutral-400 flex justify-between">
          <span>Generated via AccuLedger ERP • Ref: {primaryMovement.reference_id}</span>
          <span>Subject to {businessSettings.city} Jurisdiction</span>
        </div>
      </div>
    </div>
  );
};
