import React, { useState, useEffect, useMemo } from 'react';
import { useAccountingStore } from '../../store/accountingStore';
import { roundCurrency } from '../../utils/calculations';
import { buildChallanPdf, docToBase64 } from '../../utils/pdfDocuments';
import type jsPDF from 'jspdf';
import { Printer, X, Download, RefreshCw } from 'lucide-react';
import { Badge } from '../common/Badge';
import { PdfPreview } from '../common/PdfPreview';
import { Alert, Button, Card, Input, Label, Select, Toolbar } from '../ui';
import { useT } from '../../i18n';

export type ChallanCopyType = 'ORIGINAL' | 'DUPLICATE' | 'TRIPLICATE';

interface DeliveryChallanPrintViewProps {
  movementId?: string;
  challanReference?: string;
  /** 'dispatch' (company → customer) or 'return' (customer → company). */
  direction?: 'dispatch' | 'return';
  onClose?: () => void;
}

export const DeliveryChallanPrintView: React.FC<DeliveryChallanPrintViewProps> = ({
  movementId,
  challanReference,
  direction = 'dispatch',
  onClose
}) => {
  const { t } = useT();
  const {
    businessSettings,
    customers,
    products,
    uoms,
    customerInventoryMovements,
    getPieceWeightMapping
  } = useAccountingStore();

  const [copyType, setCopyType] = useState<ChallanCopyType>('ORIGINAL');

  // Find all movements associated with this challan or movement.
  // Grouping key is the document header when present (one document = one challan,
  // even across rows); legacy rows without a header fall back to the old
  // (customer, reference) grouping so history still prints.
  // Return slips filter RETURN movements; dispatch slips filter DISPATCH ones —
  // this also disambiguates shared challan numbers across the two sequences.
  const isReturn = direction === 'return';
  const wantType = (t: string): boolean =>
    isReturn ? t === 'RETURN' : t === 'DISPATCH' || t === 'ADJUSTMENT_IN';
  const movements = useMemo(() => {
    const allMovs = Object.values(customerInventoryMovements);
    const keyOf = (m: (typeof allMovs)[number]) =>
      m.document_id || `${m.customer_id}::${m.reference_id}`;
    if (movementId) {
      const target = customerInventoryMovements[movementId];
      if (target) {
        const key = keyOf(target);
        const grouped = allMovs.filter((m) => keyOf(m) === key && wantType(m.movement_type));
        return grouped.length > 0 ? grouped : [target];
      }
    }
    if (challanReference) {
      const matches = allMovs.filter((m) => m.reference_id === challanReference && wantType(m.movement_type));
      if (matches.length > 0) {
        const key = keyOf(matches[0]);
        return allMovs.filter((m) => keyOf(m) === key && wantType(m.movement_type));
      }
    }
    // Fallback: newest movement of the wanted type
    const wanted = allMovs.filter((m) => wantType(m.movement_type));
    return wanted.length > 0 ? [wanted[wanted.length - 1]] : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movementId, challanReference, direction, customerInventoryMovements]);

  const primaryMovement = movements[0];
  const customer = primaryMovement ? customers[primaryMovement.customer_id] : null;

  // Document inputs, computed before any conditional return (hooks rule).
  // The challan is quantities-only (no rates or values — it is a holding
  // transfer, not a sale). Each line counts in exactly ONE column: BOX
  // dispatches fill the Box column (Pcs/Weight stay blank); piece-mapped
  // products fill ગ્રામ (printed in KG); everything else is a bare Pcs count.
  const docInput = useMemo(() => {
    if (!primaryMovement || !customer) return null;
    const itemRows = movements.map((mov) => {
      const prod = products[mov.product_id];
      const uom = uoms[mov.unit_id];
      const isBoxLine = (uom?.code || '').toUpperCase() === 'BOX';
      const pieceMapping = getPieceWeightMapping(mov.product_id);
      const grams = !isBoxLine && pieceMapping
        ? roundCurrency(mov.quantity * pieceMapping.gramsPerPiece)
        : null;
      return {
        productName: prod?.product_name || 'Industrial Material',
        quantity: mov.quantity,
        unitCode: uom?.code || 'PCS',
        grams,
      };
    });
    return {
      customer,
      primaryMovement,
      itemRows,
      challanDate: new Date(primaryMovement.movement_date || primaryMovement.created_at).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }),
    };
  }, [movements, products, uoms, getPieceWeightMapping, primaryMovement, customer]);

  // The ONE document object behind preview, download and print — they cannot
  // drift apart because they are literally the same bytes.
  const doc: jsPDF | null = useMemo(() => {
    if (!docInput) return null;
    return buildChallanPdf({
      business: businessSettings,
      customer: docInput.customer,
      primaryMovement: docInput.primaryMovement,
      challanDate: docInput.challanDate,
      direction,
      itemRows: docInput.itemRows,
      logoDataUrl: businessSettings.logo_data ?? undefined
    });
  }, [docInput, direction, businessSettings]);

  const printErrorText = (error?: string): string => {
    if (error === 'PRINTER_NOT_FOUND') return 'Printer not found — the list was refreshed, please pick again.';
    if (error === 'PRINTER_LOOKUP_FAILED') return 'Could not reach printers. Check the connection and retry.';
    if (error === 'NO_WINDOW') return 'App window unavailable. Restart the app and retry.';
    return 'Print failed — check the printer is online with paper loaded.';
  };

  // Sends the preview's exact PDF bytes to the printer (hidden window in the
  // main process renders the PDF itself — the paper matches the preview 1:1).
  const sendPdfToPrinter = async (opts: {
    deviceName?: string;
    copies?: number;
    silent?: boolean;
  }): Promise<{ ok: boolean; error?: string } | null> => {
    if (!window.electronAPI?.printing || !doc) return null;
    return window.electronAPI.printing.printPdf({
      pdfBase64: docToBase64(doc),
      deviceName: opts.deviceName,
      copies: opts.copies,
      silent: opts.silent,
    });
  };

  const handlePrint = async () => {
    // No desktop shell: system print of the embedded PDF page.
    if (!window.electronAPI?.printing) {
      window.print();
      return;
    }
    setPrinting(true);
    setPrintStatus(null);
    try {
      const result = selectedPrinter
        ? await sendPdfToPrinter({ deviceName: selectedPrinter, copies: Math.max(1, Math.min(99, Math.floor(Number(copies) || 1))), silent: true })
        : await sendPdfToPrinter({ silent: false });
      if (result && !result.ok && result.error !== undefined) {
        if (result.error === 'PRINTER_NOT_FOUND') await loadPrinters();
        setPrintStatus({ kind: 'error', text: printErrorText(result.error) });
      } else if (result?.ok) {
        setPrintStatus({ kind: 'success', text: 'Sent to the printer.' });
      }
    } catch {
      setPrintStatus({ kind: 'error', text: 'Print failed — desktop app may need a restart.' });
    } finally {
      setPrinting(false);
    }
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
      const result = await sendPdfToPrinter({ deviceName: selectedPrinter, copies: nCopies, silent: true });
      if (result?.ok) {
        setPrintStatus({ kind: 'success', text: `Sent ${nCopies} ${nCopies === 1 ? 'copy' : 'copies'} to ${selectedPrinter}.` });
      } else {
        if (result?.error === 'PRINTER_NOT_FOUND') await loadPrinters();
        setPrintStatus({ kind: 'error', text: printErrorText(result?.error) });
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
      const result = await sendPdfToPrinter(
        selectedPrinter ? { deviceName: selectedPrinter, silent: false } : { silent: false }
      );
      // PRINT_FAILED after a system dialog usually means the user pressed Cancel:
      // stay silent instead of reporting an error.
      if (result && !result.ok && result.error !== undefined && result.error !== 'PRINT_FAILED') {
        setPrintStatus({ kind: 'error', text: printErrorText(result.error) });
      }
    } catch {
      setPrintStatus({ kind: 'error', text: 'Print failed — desktop app may need a restart.' });
    } finally {
      setPrinting(false);
    }
  };
  const handleDownloadPDF = async () => {
    if (!doc || !docInput) return;
    const safeRef = (docInput.primaryMovement.reference_id || 'challan').replace(/[^a-z0-9-_]+/gi, '-');
    const filename = `${isReturn ? 'Return' : 'Challan'}-${safeRef}-${copyType}.pdf`;
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

  if (!primaryMovement || !customer) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">{isReturn ? 'No return records found for the requested return slip.' : 'No delivery challan records found for the requested dispatch.'}</p>
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 bg-primary text-primary-foreground rounded text-xs font-semibold"
          >
            Close
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Action Bar (hidden when printing) */}
      <Toolbar className="flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <Badge variant="neutral" size="md">
            {t('printBar.challanBadge', { ref: primaryMovement.reference_id })}
          </Badge>
          <div className="flex items-center gap-1 bg-card border border-input rounded-md p-0.5">
            {(['ORIGINAL', 'DUPLICATE', 'TRIPLICATE'] as ChallanCopyType[]).map((type) => (
              <button
                key={type}
                onClick={() => setCopyType(type)}
                className={`px-2.5 py-1 text-[11px] font-mono rounded transition-colors ${
                  copyType === type
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {type === 'ORIGINAL' ? t('printBar.copyConsignee') : type === 'DUPLICATE' ? t('printBar.copyTransporter') : t('printBar.copyConsignor')}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleDownloadPDF} disabled={downloading} aria-label={t('printBar.downloadChallanAria')} className="px-4 py-2">
            <Download className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <span>{downloading ? t('printBar.preparingPdf') : t('printBar.downloadChallan')}</span>
          </Button>

          <Button variant="primary" size="sm" onClick={handlePrint} className="px-4 py-2">
            <Printer className="w-4 h-4" />
            <span>{t('printBar.printChallan')}</span>
          </Button>

          {onClose && (
            <Button variant="icon-ghost" size="icon" onClick={onClose} aria-label={t('printBar.closeChallan')} title={t('printBar.closeChallanTitle')}>
              <X className="w-4 h-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </Toolbar>

      {/* Printer connection bar (hidden when printing) */}
      {canUsePrintBridge && (
        <Card className="p-4 no-print text-xs space-y-3 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <Label className="mb-1">{t('printBar.printer')}</Label>
              <div className="flex gap-2">
                <Select
                  value={selectedPrinter}
                  onChange={(e) => handleSelectPrinter(e.target.value)}
                  disabled={printersLoading || printing}
                  className="flex-1 font-medium disabled:opacity-50"
                >
                  {printers.length === 0 ? (
                    <option value="">{t('printBar.noPrinters')}</option>
                  ) : (
                    printers.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.displayName || p.name}{p.description ? ` — ${p.description}` : ''}
                      </option>
                    ))
                  )}
                </Select>
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => void loadPrinters()}
                  disabled={printersLoading}
                  title={t('printBar.refreshPrinters')}
                  className="px-2.5 disabled:opacity-40"
                >
                  <RefreshCw className={`w-4 h-4 text-muted-foreground ${printersLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>

            <div className="w-24">
              <Label className="mb-1">{t('printBar.copies')}</Label>
              <Input
                type="number"
                min={1}
                max={99}
                value={copies}
                onChange={(e) => setCopies(Number(e.target.value))}
                disabled={printing}
                className="w-full font-mono text-center disabled:opacity-50"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="primary"
                size="md"
                onClick={() => void handleDirectPrint()}
                disabled={printing || !selectedPrinter}
                className="px-4 py-2 disabled:opacity-50"
              >
                <Printer className="w-4 h-4" />
                <span>{printing ? t('printBar.printing') : t('printBar.printNow')}</span>
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => void handleSystemDialogPrint()}
                disabled={printing}
                title={t('printBar.systemDialogTitle')}
                className="px-4 py-2 disabled:opacity-50"
              >
                <span>{t('printBar.systemDialog')}</span>
              </Button>
            </div>
          </div>

          {printStatus && (
            <Alert tone={printStatus.kind === 'success' ? 'success' : 'destructive'}>
              {printStatus.text}
            </Alert>
          )}
        </Card>
      )}

      {/* Printable Challan Document — the EXACT jsPDF output that Download
          saves and the printer receives. One source of truth: the on-screen
          preview, the saved file and the paper are the same bytes, so they
          can never drift apart. */}
      <PdfPreview
        doc={doc}
        ariaLabel={`${isReturn ? 'Return challan' : 'Delivery challan'} ${primaryMovement.reference_id}`}
      />
    </div>
  );
};
