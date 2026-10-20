import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  BusinessSettings,
  Customer,
  CustomerInventoryMovement,
  Invoice,
  InvoiceItem,
  InvoicePayment
} from '../types/database';
import { formatINR, numberToWordsINR, toDisplayWeight } from './calculations';

// ---------------------------------------------------------------------------
// Ledger Counter PDF theme (mirrors DESIGN.md: ink-on-paper, mono figures)
// NOTE: jsPDF built-in fonts are WinAnsi only, so every string here must be
// ASCII: "Rs. " replaces the rupee sign, "-" replaces dashes/bullets.
// ---------------------------------------------------------------------------
const INK: [number, number, number] = [23, 23, 23];
const MUTED: [number, number, number] = [115, 115, 115];
const FAINT: [number, number, number] = [165, 165, 165];
const LINE: [number, number, number] = [229, 229, 229];
const WASH: [number, number, number] = [245, 245, 245];
const SANS = 'helvetica';
const MONO = 'courier';
const MARGIN = 14;
const PAGE_W = 210;

const rs = (n: number) => formatINR(n).replace(/₹/g, 'Rs. ');
const str = (v: unknown, fallback = 'N/A') => {
  const s = String(v ?? '').trim();
  return s ? s : fallback;
};
const fmtDate = (iso?: string) => {
  if (!iso) return 'N/A';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString();
};

/** Address without a duplicated trailing city ("Ring Road surat" + "Surat"). Exported for screen parity. */
export function formatAddress(address?: string, city?: string, state?: string, postal?: string): string {
  let addr = str(address, '');
  const c = str(city, '');
  if (c && addr.toLowerCase().endsWith(c.toLowerCase())) {
    addr = addr.slice(0, addr.length - c.length).trim().replace(/[,|-]\s*$/, '');
  }
  const cityState = [c, str(state, '')].filter(Boolean).join(', ');
  const tail = [cityState, str(postal, '')].filter(Boolean).join(' - ');
  return [addr, tail].filter(Boolean).join(', ');
}

function stampFooter(
  doc: jsPDF,
  left: string,
  right: string,
  page: { h: number; margin: number; width: number } = { h: 290, margin: MARGIN, width: PAGE_W },
  extraLines: string[] = []
) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont(SANS, 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    extraLines.forEach((line, idx) => {
      doc.text(line.substring(0, 95), page.margin, page.h - (extraLines.length - idx) * 3.5);
    });
    doc.setFontSize(7.5);
    doc.setTextColor(...FAINT);
    doc.text(left, page.margin, page.h);
    const rightText = right ? `${right}  |  Page ${i} of ${pages}` : `Page ${i} of ${pages}`;
    doc.text(rightText, page.width - page.margin, page.h, { align: 'right' });
  }
}

function sectionLabel(doc: jsPDF, text: string, y: number, margin: number = MARGIN) {
  doc.setFont(MONO, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(text.toUpperCase(), margin, y);
  return y + 5;
}

/**
 * Ledger customer header line. The Gujarati nickname REPLACES the English
 * name inline (same line, same size); without one it is byte-identical to
 * sectionLabel(`Customer: …`).
 */
function sectionCustomerLine(
  doc: jsPDF,
  y: number,
  name: string,
  meta: string,
  guImg: GujaratiInlineImage | null
): number {
  doc.setFont(MONO, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  if (!guImg) {
    doc.text(`Customer: ${str(name).substring(0, 50)}  |  ${str(meta).substring(0, 60)}`.toUpperCase(), MARGIN, y);
    return y + 5;
  }
  const label = 'CUSTOMER: ';
  doc.text(label, MARGIN, y);
  let cx = MARGIN + doc.getTextWidth(label);
  const lineH = pdfLineHeight(8);
  const lineTop = y - ((8 * 25.4) / 72);
  doc.addImage(guImg.dataUrl, 'PNG', cx, lineTop + (lineH - guImg.h) / 2, guImg.w, guImg.h);
  cx += guImg.w + 2;
  doc.text(`  |  ${str(meta).substring(0, 60)}`.toUpperCase(), cx, y);
  return y + 5;
}

// Bottom edge of the most recently drawn autoTable.
function tableEndY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

/**
 * Brand watermark: the business logo, large and centred on every page at low
 * opacity. Runs LAST on the finished document; at 8% opacity the text printed
 * underneath stays fully readable. A corrupt/oversized logo can never break
 * the document: every failure is swallowed.
 */
export function drawWatermark(
  doc: jsPDF,
  logoDataUrl: string | null | undefined,
  pageW: number,
  pageH: number
): void {
  if (!logoDataUrl || typeof logoDataUrl !== 'string') return;
  const format = logoDataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
  try {
    const props = doc.getImageProperties(logoDataUrl);
    if (!props || !props.width || !props.height) return;
    // Large but bounded: 62% of page width, and never taller than 40% of the
    // page — aspect ratio always preserved.
    let w = pageW * 0.62;
    let h = (w * props.height) / props.width;
    const maxH = pageH * 0.4;
    if (h > maxH) {
      h = maxH;
      w = (h * props.width) / props.height;
    }
    const pages = doc.getNumberOfPages();
    const GState = (doc as unknown as { GState: new (opts: { opacity: number }) => object }).GState;
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.saveGraphicsState();
      doc.setGState(new GState({ opacity: 0.08 }));
      doc.addImage(logoDataUrl, format, (pageW - w) / 2, (pageH - h) / 2, w, h);
      doc.restoreGraphicsState();
    }
  } catch {
    // A bad logo must never break a legal document.
  }
}

export interface GujaratiInlineImage {
  dataUrl: string;
  w: number;
  h: number;
}

/**
 * Gujarati customer name for downloaded PDFs, sized to REPLACE the English
 * name inline (same place, same visual size — never an extra line).
 * jsPDF's built-in fonts are WinAnsi-only, so the name is shaped by the
 * browser engine (correct conjuncts/matras via the bundled Noto Sans
 * Gujarati, or the OS fallback) onto an offscreen canvas, tightly trimmed
 * to its ink bounding box, and scaled so its height equals the surrounding
 * Latin cap height (fontSizePt). Returns null when empty/unavailable, in
 * which case callers fall back to the English name.
 */
export function gujaratiInlineImage(
  text: string | null | undefined,
  fontSizePt: number,
  maxWMm = 100
): GujaratiInlineImage | null {
  try {
    const t = (text ?? '').trim();
    if (!t || !(fontSizePt > 0)) return null;
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    const probe = canvas.getContext('2d');
    if (!probe) return null;
    // Large render for a clean trim + crisp print.
    const fontPx = 120;
    const font = `${fontPx}px "Noto Sans Gujarati", sans-serif`;
    probe.font = font;
    const textW = probe.measureText(t).width;
    if (!textW || !Number.isFinite(textW)) return null;
    const pad = 20;
    canvas.width = Math.ceil(textW + pad * 2);
    canvas.height = Math.ceil(fontPx * 1.8);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.font = font;
    ctx.fillStyle = '#171717';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, pad, canvas.height / 2);
    // Tight trim to the ink bounding box (no floating whitespace, so the
    // image sits exactly on the replaced text line).
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width;
    let maxX = -1;
    let minY = canvas.height;
    let maxY = -1;
    for (let yy = 0; yy < canvas.height; yy++) {
      for (let xx = 0; xx < canvas.width; xx++) {
        if (pixels[(yy * canvas.width + xx) * 4 + 3] > 8) {
          if (xx < minX) minX = xx;
          if (xx > maxX) maxX = xx;
          if (yy < minY) minY = yy;
          if (yy > maxY) maxY = yy;
        }
      }
    }
    if (maxX < minX || maxY < minY) return null;
    const trim = document.createElement('canvas');
    trim.width = maxX - minX + 1;
    trim.height = maxY - minY + 1;
    const tctx = trim.getContext('2d');
    if (!tctx) return null;
    tctx.drawImage(canvas, minX, minY, trim.width, trim.height, 0, 0, trim.width, trim.height);
    let h = (fontSizePt * 25.4) / 72;
    let w = (h * trim.width) / trim.height;
    if (w > maxWMm) {
      h = (h * maxWMm) / w;
      w = maxWMm;
    }
    return { dataUrl: trim.toDataURL('image/png'), w, h };
  } catch {
    return null;
  }
}

/** Placeholder first line that reserves exactly one text line inside an
    autoTable cell (proven equal height to a real line). The Gujarati image
    is drawn over it via didDrawCell, so the name sits precisely where the
    English name would have been. */
export const GU_NAME_PLACEHOLDER = ' ';

/** Text line height (mm) autotable uses for a font size (factor 1.15). */
export function pdfLineHeight(fontSizePt: number): number {
  return ((fontSizePt * 25.4) / 72) * 1.15;
}

function businessHeader(
  doc: jsPDF,
  opts: {
    name: string;
    sub: string;
    address: string;
    metaLines: string[];
    stamp: string;
    stampSub?: string;
    metaRight: Array<[string, string]>;
  },
  page: { width: number; margin: number; compact?: boolean; top?: number } = { width: PAGE_W, margin: MARGIN }
): number {
  const w = page.width;
  const m = page.margin;
  const compact = page.compact === true;
  let y = page.top ?? 16;
  doc.setFont(SANS, 'bold');
  doc.setFontSize(compact ? 12.5 : 16);
  doc.setTextColor(...INK);
  doc.text(opts.name.toUpperCase().substring(0, 42), m, y);
  y += compact ? 4.5 : 5.5;
  doc.setFont(SANS, 'normal');
  doc.setFontSize(compact ? 8 : 8.5);
  doc.setTextColor(...MUTED);
  if (opts.sub) {
    doc.text(opts.sub.substring(0, 80), m, y);
    y += 4.5;
  }
  doc.text(opts.address.substring(0, 95), m, y);
  y += 4.5;
  doc.setFont(MONO, 'normal');
  doc.setFontSize(compact ? 7.5 : 8);
  doc.setTextColor(...INK);
  for (const line of opts.metaLines) {
    doc.text(line.substring(0, 95), m, y);
    y += 4;
  }

  // Right stamp block: label optically centered both ways via middle baseline.
  const stampW = compact ? 40 : 52;
  const stampH = compact ? 7.5 : 9;
  const stampTop = 14;
  doc.setFillColor(...INK);
  doc.roundedRect(w - m - stampW, stampTop, stampW, stampH, 1.5, 1.5, 'F');
  doc.setFont(MONO, 'bold');
  doc.setFontSize(compact ? 8 : 9);
  doc.setTextColor(255, 255, 255);
  doc.text(opts.stamp, w - m - stampW / 2, stampTop + stampH / 2, { align: 'center', baseline: 'middle' });
  // Meta block hugs the stamp: no dead gap, even rhythm between rows.
  let ry = stampTop + stampH + (compact ? 2.5 : 5.5);
  if (opts.stampSub) {
    doc.setFont(MONO, 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(opts.stampSub, w - m, ry, { align: 'right' });
    ry += 4.5;
  }
  doc.setFont(MONO, 'normal');
  doc.setFontSize(compact ? 7.5 : 8);
  // Compact mode: each label hugs its own value (measured per row) instead of
  // labels pinned 62mm away — tight pairs, right edges aligned, never clipped.
  for (const [label, value] of opts.metaRight) {
    const vText = value.substring(0, 34);
    doc.setFont(MONO, 'bold');
    const vW = compact ? doc.getTextWidth(vText) : 0;
    doc.setTextColor(...MUTED);
    doc.setFont(MONO, 'normal');
    doc.text(label, compact ? w - m - vW - 2 : w - m - 62, ry, { align: 'right' });
    doc.setTextColor(...INK);
    doc.setFont(MONO, 'bold');
    doc.text(vText, w - m, ry, { align: 'right' });
    doc.setFont(MONO, 'normal');
    ry += compact ? 3.4 : 4.2;
  }

  y = Math.max(y, ry) + 3;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.7);
  doc.line(m, y, w - m, y);
  return y + 6;
}

function totalsBlock(
  doc: jsPDF,
  y: number,
  rows: Array<[string, string, boolean?]>,
  grandLabel: string,
  grandValue: string
): number {
  const xLabel = 118;
  const xValue = PAGE_W - MARGIN;
  doc.setFont(SANS, 'normal');
  doc.setFontSize(8.5);
  for (const [label, value, strong] of rows) {
    doc.setTextColor(...MUTED);
    doc.text(label, xLabel, y);
    doc.setFont(MONO, strong ? 'bold' : 'normal');
    doc.setTextColor(...INK);
    doc.text(value, xValue, y, { align: 'right' });
    doc.setFont(SANS, 'normal');
    y += 5;
  }
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  doc.line(xLabel, y - 1.5, xValue, y - 1.5);
  doc.line(xLabel, y + 5.5, xValue, y + 5.5);
  doc.setFont(SANS, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(grandLabel, xLabel, y + 3.5);
  doc.setFont(MONO, 'bold');
  doc.text(grandValue, xValue, y + 3.5, { align: 'right' });
  return y + 10;
}

// ---------------------------------------------------------------------------
// TAX INVOICE
// ---------------------------------------------------------------------------
export interface InvoicePdfInput {
  invoice: Invoice;
  items: InvoiceItem[];
  payments: InvoicePayment[];
  allocations: Array<{ id: string; customer_inventory_movement_id: string; allocated_quantity: number }>;
  /** Piece-mapped lines: total PCS per invoice item id, printed under the KG qty. */
  pcsRef?: Record<string, number>;
  /** Pre-formatted allocation audit lines (challan numbers, grouped). Used
      verbatim when provided; otherwise falls back to raw movement ids. */
  allocationLines?: string[];
  /** Current business logo data URL (PNG/JPEG). Drawn as a centred watermark
      on every page when present; snapshots stay frozen otherwise. */
  logoDataUrl?: string;
  /** Live Gujarati nickname fallback for invoices billed before it was
      snapshotted; the frozen snapshot wins when present. */
  customerGujaratiName?: string;
}

export function buildInvoicePdf(input: InvoicePdfInput): jsPDF {
  const { invoice, items, payments, allocations, pcsRef } = input;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const biz = invoice.business_snapshot;
  const cust = invoice.customer_snapshot;

  // Compact invoice header (same structure as the preview, denser metrics so
  // 8-10 item lines still fit a single A4 page).
  let y = businessHeader(doc, {
    name: str(biz.business_name || biz.legal_name, 'Business'),
    sub:
      biz.legal_name &&
      biz.legal_name.trim() &&
      biz.legal_name.trim() !== (biz.business_name || '').trim()
        ? biz.legal_name.trim()
        : '',
    address: `${str(biz.address, '')} ${str(biz.city, '')}, ${str(biz.state, '')} - ${str(biz.postal_code, '')}`.trim(),
    metaLines: [
      `GSTIN: ${str(biz.gst_number)}  |  PAN: ${str(biz.pan)}`,
      `Phone: ${str(biz.phone)}  |  Email: ${str(biz.email)}`
    ],
    stamp: 'TAX INVOICE',
    metaRight: [
      ['Invoice No:', str(invoice.invoice_number)],
      ['Date:', fmtDate(invoice.invoice_date)],
      ['Billing Period:', `${str(invoice.billing_period_start, '-')} to ${str(invoice.billing_period_end, '-')}`],
      ['Place of Supply:', `${str(cust.state)} (${str(cust.state_code)})`]
    ]
  }, { width: PAGE_W, margin: MARGIN, compact: true, top: 12 });

  // Bill-to + allocations: one ruled 2-column grid, mirroring the preview.
  // Allocations flow as wrapped text (not one row per link) so invoices with
  // many challan links still fit a single page.
  const custAddr = `${str(cust.address, '')} ${str(cust.city, '')}, ${str(cust.state, '')} - ${str(cust.postal_code, '')}`.trim();
  const allocLines =
    input.allocationLines && input.allocationLines.length > 0
      ? input.allocationLines.join('\n')
      : allocations.length === 0
        ? 'Direct billed / No explicit dispatch links'
        : allocations
            .map((a) => `#${a.customer_inventory_movement_id}: ${a.allocated_quantity} units`)
            .join(', ');
  // Gujarati nickname REPLACES the English name inline (same line, same
  // size): the first cell line holds a same-height placeholder and the
  // shaped image is drawn over it. Falls back to English when absent.
  const invGu = (input.customerGujaratiName ?? cust.gujarati_name ?? '').trim();
  const invGuImg = invGu ? gujaratiInlineImage(invGu, 7) : null;
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['BILLED TO (CUSTOMER SNAPSHOT)', 'INVENTORY ALLOCATION AUDIT LINK']],
    body: [[
      `${invGuImg ? GU_NAME_PLACEHOLDER : str(cust.customer_name)}\n${custAddr}\nGSTIN: ${str(cust.gst_number, 'N/A / Unregistered')}  |  PAN: ${str(cust.pan, 'N/A')}\nContact: ${str(cust.mobile, '-')} | ${str(cust.email, '-')}`,
      `Explicitly allocated against customer inventory movements:\n${allocLines}`,
    ]],
    theme: 'grid',
    styles: { font: SANS, fontSize: 7, textColor: INK, cellPadding: 1.5, lineColor: LINE, lineWidth: 0.25 },
    headStyles: { fontStyle: 'bold', fontSize: 6.5, textColor: [255, 255, 255], fillColor: INK },
    columnStyles: { 0: { cellWidth: 112 }, 1: { cellWidth: 'auto' } },
    didDrawCell: (d) => {
      if (!invGuImg || d.section !== 'body' || d.row.index !== 0 || d.column.index !== 0) return;
      const lineH = pdfLineHeight(7);
      const top = d.cell.y + 1.5;
      doc.addImage(invGuImg.dataUrl, 'PNG', d.cell.x + 1.5, top + (lineH - invGuImg.h) / 2, invGuImg.w, invGuImg.h);
    },
  });
  y = tableEndY(doc) + 3;

  // Line items: ruled Excel-style grid, dark header, strict numeric alignment.
  const itemColumnStyles = {
    0: { halign: 'center' as const, cellWidth: 8 },
    2: { cellWidth: 16 },
    3: { halign: 'right' as const, cellWidth: 14 },
    4: { halign: 'right' as const, cellWidth: 11 },
    5: { halign: 'right' as const, cellWidth: 22 },
    6: { halign: 'right' as const, cellWidth: 24 },
    7: { halign: 'center' as const, cellWidth: 10 },
    8: { halign: 'right' as const, fontStyle: 'bold' as const, cellWidth: 26 },
  };
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['#', 'Item Description', 'SKU', 'Qty', 'UOM', 'Unit Price', 'Taxable', 'GST%', 'Line Total']],
    body: items.map((it, idx) => [
      String(idx + 1),
      str(it.product_name_snapshot),
      str(it.sku_snapshot),
      pcsRef?.[it.id] ? `${it.quantity}\n(≈ ${pcsRef[it.id]} PCS)` : String(it.quantity),
      str(it.uom_snapshot),
      rs(it.unit_price),
      rs(it.taxable_amount),
      `${it.gst_rate}%`,
      rs(it.line_total)
    ]),
    theme: 'grid',
    styles: { font: MONO, fontSize: 6, textColor: INK, cellPadding: 1, lineColor: LINE, lineWidth: 0.25 },
    headStyles: { font: MONO, fontSize: 6.5, fontStyle: 'bold', textColor: [255, 255, 255], fillColor: INK },
    columnStyles: itemColumnStyles,
  });
  y = tableEndY(doc) + 3;

  // Totals: same 9-column grid as the items table so every money figure
  // aligns strictly under Line Total; grand total carried in a filled row.
  const activePayments = payments.filter((p) => p.status === 'ACTIVE');
  const totalPaid = activePayments.reduce((s, p) => s + p.amount, 0);
  const outstanding = invoice.status === 'CANCELLED' ? 0 : Math.max(0, invoice.grand_total - totalPaid);
  const totalRate = items.length > 0 ? items[0].gst_rate : 0;
  const halfRate = totalRate / 2;
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    body: [
      [{ content: 'Taxable Amount:', colSpan: 8, styles: { halign: 'right' as const } }, rs(invoice.taxable_amount)],
      ...(invoice.cgst > 0
        ? [[{ content: `CGST (${halfRate}%):`, colSpan: 8, styles: { halign: 'right' as const } }, rs(invoice.cgst)]]
        : []),
      ...(invoice.sgst > 0
        ? [[{ content: `SGST (${halfRate}%):`, colSpan: 8, styles: { halign: 'right' as const } }, rs(invoice.sgst)]]
        : []),
      ...(invoice.igst > 0
        ? [[{ content: `IGST (${totalRate}%, Inter-state):`, colSpan: 8, styles: { halign: 'right' as const } }, rs(invoice.igst)]]
        : []),
      ...(invoice.other_charges > 0
        ? [[{ content: 'Other / Freight Charges:', colSpan: 8, styles: { halign: 'right' as const } }, rs(invoice.other_charges)]]
        : []),
      [{ content: 'Grand Total:', colSpan: 8, styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: WASH } }, { content: rs(invoice.grand_total), styles: { fontStyle: 'bold' as const, fillColor: WASH } }],
      [{ content: 'Total Amount Paid:', colSpan: 8, styles: { halign: 'right' as const } }, rs(totalPaid)],
      [{ content: 'Outstanding Balance:', colSpan: 8, styles: { halign: 'right' as const, fontStyle: 'bold' as const } }, { content: rs(outstanding), styles: { fontStyle: 'bold' as const } }],
    ],
    theme: 'grid',
    styles: { font: MONO, fontSize: 7, textColor: INK, cellPadding: 1.2, lineColor: LINE, lineWidth: 0.25 },
    columnStyles: itemColumnStyles,
  });
  y = tableEndY(doc) + 3;

  // Amount in words: ruled box, not floating text.
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    body: [[`Amount in Words: ${numberToWordsINR(invoice.grand_total)}`]],
    theme: 'grid',
    styles: { font: SANS, fontSize: 7.5, fontStyle: 'bold', textColor: INK, cellPadding: 2, lineColor: LINE, lineWidth: 0.25 },
  });
  y = tableEndY(doc) + 3;

  // Bank + notes: ruled label/value grid.
  const bank = invoice.bank_snapshot;
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['BANK REMITTANCE DETAILS (PERSISTED SNAPSHOT)', '']],
    body: [
      ['Bank Name', str(bank.bank_name)],
      ['A/C Number', str(bank.bank_account_number)],
      ['IFSC Code', str(bank.ifsc)],
      ['Branch', str(bank.branch)],
      ...(invoice.notes ? [[{ content: 'Notes', styles: { fontStyle: 'italic' as const } }, invoice.notes]] : []),
    ],
    theme: 'grid',
    styles: { font: MONO, fontSize: 7, textColor: INK, cellPadding: 1.2, lineColor: LINE, lineWidth: 0.25 },
    headStyles: { fontStyle: 'bold', fontSize: 7, textColor: [255, 255, 255], fillColor: INK },
    columnStyles: { 0: { cellWidth: 62 }, 1: { cellWidth: 'auto' } },
  });
  y = tableEndY(doc) + 3;

  if (activePayments.length > 0) {
    y = sectionLabel(doc, 'Payment Receipts Applied Against This Invoice', y);
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Date', 'Method', 'Reference', 'Amount']],
      body: activePayments.map((p) => [
        fmtDate(p.payment_date),
        str(p.payment_method),
        `#${str(p.reference_number)}`,
        rs(p.amount)
      ]),
      theme: 'grid',
      styles: { font: MONO, fontSize: 7, textColor: INK, cellPadding: 1.5, lineColor: LINE, lineWidth: 0.25 },
      headStyles: { fontStyle: 'bold', textColor: [255, 255, 255], fillColor: INK },
      columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } }
    });
    y = tableEndY(doc) + 3;
  }

  // Footer sign-off
  if (y > 255) {
    doc.addPage();
    y = 16;
  }
  doc.setFont(SANS, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('This is a computer generated invoice requiring no physical signature.', MARGIN, y + 12);
  doc.text('Authorised Signatory', PAGE_W - MARGIN, y + 4, { align: 'right' });
  doc.setDrawColor(...FAINT);
  doc.setLineWidth(0.3);
  doc.line(PAGE_W - MARGIN - 55, y + 8, PAGE_W - MARGIN, y + 8);
  doc.setFontSize(7.5);
  doc.text(str(biz.business_name).substring(0, 40), PAGE_W - MARGIN, y + 12, { align: 'right' });

  stampFooter(doc, 'AccuLedger - Tax Invoice', str(invoice.invoice_number));
  drawWatermark(doc, input.logoDataUrl, 210, 297);
  return doc;
}

// ---------------------------------------------------------------------------
// DELIVERY CHALLAN (Rule 55)
// ---------------------------------------------------------------------------
export interface ChallanPdfInput {
  business: BusinessSettings;
  customer: Customer;
  primaryMovement: CustomerInventoryMovement & {
    movement_date?: string;
  };
  copyLabel: string;
  challanDate: string;
  timeOfRemoval: string;
  /** 'dispatch' (company → customer) or 'return' (customer → company). */
  direction?: 'dispatch' | 'return';
  /** Current business logo data URL (PNG/JPEG). Drawn as a centred watermark
      on every page when present. */
  logoDataUrl?: string;
  itemRows: Array<{
    sNo: number;
    productName: string;
    description?: string;
    sku: string;
    quantity: number;
    unitCode: string;
    weightQty?: number;
    weightUom?: 'KG' | 'gram';
  }>;
  totalQuantity: number;
  totalWeightGrams: number;
}

export function buildChallanPdf(input: ChallanPdfInput): jsPDF {
  const { business: biz, customer: cust, primaryMovement: mov, itemRows } = input;
  const isReturn = input.direction === 'return';
  const totalWeightShown = toDisplayWeight(input.totalWeightGrams);
  // Compact A6 with ruled grid tables: header block, full-width consignee box,
  // bordered items grid with a dedicated Weight column, totals, signatures.
  const W = 105;
  const M = 8;
  const doc = new jsPDF({ unit: 'mm', format: 'a6' });

  // ---- Header: business name left, stamp + meta right, double rule below ----
  // Address + contact live in the footer, not the header.
  // (No GSTIN/PAN here — those live on the tax invoice, not the challan.)
  let y = 10;
  doc.setFont(SANS, 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(...INK);
  doc.text(str(biz.business_name, 'Business').toUpperCase().substring(0, 30), M, y);
  y += 5;

  const stampTop = 8;
  const stampW = 40;
  const stampH = 7.5;
  doc.setFillColor(...INK);
  doc.roundedRect(W - M - stampW, stampTop, stampW, stampH, 1.5, 1.5, 'F');
  doc.setFont(MONO, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  // Vertically centered: baseline sits half the cap height below the middle.
  const stampFsMm = 8 * 0.3528;
  doc.text(isReturn ? 'RETURN CHALLAN' : 'DELIVERY CHALLAN', W - M - stampW / 2, stampTop + stampH / 2 + stampFsMm * 0.35, { align: 'center' });
  let ry = stampTop + stampH + 3;
  doc.setFont(MONO, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(str(input.copyLabel), W - M, ry, { align: 'right' });
  ry += 4.5;
  doc.setFontSize(7.5);
  const metaRight: Array<[string, string]> = [
    ['Challan Number:', str(mov.reference_id)],
    ['Challan Date:', str(input.challanDate)],
    ['Time of Removal:', str(input.timeOfRemoval)],
  ];
  for (const [label, value] of metaRight) {
    doc.setFont(MONO, 'normal');
    doc.setTextColor(...MUTED);
    doc.text(label, W - M - 38, ry, { align: 'right' });
    doc.setFont(MONO, 'bold');
    doc.setTextColor(...INK);
    doc.text(value.substring(0, 22), W - M, ry, { align: 'right' });
    ry += 3.8;
  }

  y = Math.max(y, ry) + 3;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.7);
  doc.line(M, y, W - M, y);
  doc.setLineWidth(0.25);
  doc.line(M, y + 1.2, W - M, y + 1.2);
  y += 7;

  // ---- Consignee: full-width ruled box (consignor already sits in the header) ----
  // Gujarati nickname REPLACES the English name inline (same line, same size).
  const custContact = str(cust.mobile, '');
  const challanGu = (cust.gujarati_name ?? '').trim();
  const challanGuImg = challanGu ? gujaratiInlineImage(challanGu, 7.5, 85) : null;
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [[isReturn ? 'RETURNED FROM (CUSTOMER SITE)' : 'CONSIGNEE (DISPATCHED TO)']],
    body: [[
      `${challanGuImg ? GU_NAME_PLACEHOLDER : str(cust.customer_name)}\n${formatAddress(cust.address, cust.city, cust.state, cust.postal_code)}${custContact ? `\nContact: ${custContact}` : ''}`,
    ]],
    theme: 'grid',
    styles: { font: SANS, fontSize: 7.5, textColor: INK, cellPadding: 2.5, lineColor: LINE, lineWidth: 0.25, valign: 'top' },
    headStyles: { fontStyle: 'bold', fontSize: 7, textColor: [255, 255, 255], fillColor: INK },
    didDrawCell: (d) => {
      if (!challanGuImg || d.section !== 'body' || d.row.index !== 0 || d.column.index !== 0) return;
      const lineH = pdfLineHeight(7.5);
      const top = d.cell.y + 2.5;
      doc.addImage(challanGuImg.dataUrl, 'PNG', d.cell.x + 2.5, top + (lineH - challanGuImg.h) / 2, challanGuImg.w, challanGuImg.h);
    },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // Items grid with a dedicated Weight column (consistent on every row).
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['#', 'Description of Goods', 'SKU', 'Qty', 'UOM', 'Weight']],
    body: itemRows.map((r) => [
      String(r.sNo),
      r.description ? `${r.productName} - ${r.description}` : r.productName,
      r.sku,
      String(r.quantity),
      r.unitCode,
      r.weightQty !== undefined && r.weightUom ? `${r.weightQty} ${r.weightUom}` : '-',
    ]),
    foot: [
      [
        { content: 'Total Dispatched Quantity:', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
        String(input.totalQuantity),
        'Units',
        input.totalWeightGrams > 0 ? `${totalWeightShown.qty} ${totalWeightShown.unit}` : '-',
      ],
    ],
    theme: 'grid',
    styles: { font: MONO, fontSize: 6, textColor: INK, cellPadding: 0.8, lineColor: LINE, lineWidth: 0.25 },
    headStyles: { fontStyle: 'bold', fontSize: 6, textColor: [255, 255, 255], fillColor: INK },
    footStyles: { fontStyle: 'bold', textColor: INK, fillColor: WASH },
    columnStyles: {
      0: { halign: 'center', cellWidth: 7 },
      2: { cellWidth: 18 },
      3: { halign: 'right', fontStyle: 'bold', cellWidth: 12 },
      4: { halign: 'left', cellWidth: 14 },
      5: { halign: 'right', cellWidth: 20 },
    }
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // Signatures (receiver + consignor only — no transporter block)
  if (y > 118) {
    doc.addPage();
    y = 10;
  }
  y = sectionLabel(doc, 'Signatures & Acknowledgment', y, M);
  const sigW = (W - M * 2 - 4) / 2;
  const sigs: Array<[string, string]> = [
    ["Receiver's Acknowledgment & Stamp", 'Received goods in sound order'],
    ['Authorised Signatory (Consignor)', str(isReturn ? cust.customer_name : biz.business_name).substring(0, 30)]
  ];
  sigs.forEach(([title, sub], i) => {
    const sx = M + i * (sigW + 4);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.rect(sx, y, sigW, 18);
    doc.setFont(SANS, 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...INK);
    const titleLines = doc.splitTextToSize(title, sigW - 4);
    doc.text(titleLines, sx + 2, y + 4);
    doc.setDrawColor(...FAINT);
    doc.line(sx + 6, y + 13.5, sx + sigW - 6, y + 13.5);
    doc.setFont(SANS, 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(sub.substring(0, 32), sx + 2, y + 16.5);
  });

  const footerPhone = str(biz.phone, '');
  const footerExtras = [
    formatAddress(biz.address, biz.city, biz.state, biz.postal_code ? `${biz.postal_code}, India` : 'India'),
    ...(footerPhone ? [`Contact: ${footerPhone}`] : []),
  ];
  stampFooter(doc, `AccuLedger - ${isReturn ? 'Return' : 'Delivery'} Challan ${str(mov.reference_id)}`, '', { h: 141, margin: M, width: W }, footerExtras);
  drawWatermark(doc, input.logoDataUrl, 105, 148);
  return doc;
}

// ---------------------------------------------------------------------------
// CUSTOMER MOVEMENT LEDGER (deliveries + returns, client-shareable statement)
// ---------------------------------------------------------------------------
export interface MovementLedgerPdfInput {
  business: BusinessSettings;
  customerName: string;
  customerMeta: string;
  periodLabel: string;
  rows: Array<{
    date: string;
    docNo: string;
    type: string;
    productName: string;
    qty: string;
    unitCode: string;
    weight: string;
  }>;
  totals: Array<{
    productName: string;
    dispatched: string;
    returned: string;
    net: string;
    unitCode: string;
    netWeight: string;
  }>;
  /** Current business logo data URL (PNG/JPEG). Drawn as a centred watermark
      on every page when present. */
  logoDataUrl?: string;
  /** Gujarati nickname of the ledger customer, printed under the header. */
  customerGujaratiName?: string;
}

export function buildMovementLedgerPdf(input: MovementLedgerPdfInput): jsPDF {
  const { business: biz } = input;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const bizPhone = str(biz.phone, '');

  let y = businessHeader(doc, {
    name: str(biz.business_name, 'Business'),
    sub: '',
    address: `${str(biz.address, '')} ${str(biz.city, '')}, ${str(biz.state, '')} - ${str(biz.postal_code, '')}, India`.trim(),
    metaLines: bizPhone ? [`Contact: ${bizPhone}`] : [],
    stamp: 'MOVEMENT LEDGER',
    metaRight: [
      ['Customer:', str(input.customerName).substring(0, 30)],
      ['Period:', str(input.periodLabel).substring(0, 30)],
    ]
  }, { width: PAGE_W, margin: MARGIN, compact: true, top: 12 });

  // Gujarati nickname REPLACES the English name inline (same line, same size).
  const ledgerGu = (input.customerGujaratiName ?? '').trim();
  const ledgerGuImg = ledgerGu ? gujaratiInlineImage(ledgerGu, 8) : null;
  y = sectionCustomerLine(doc, y, input.customerName, input.customerMeta, ledgerGuImg);
  doc.setFont(SANS, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  y += 1;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Date', 'Challan / Slip No.', 'Type', 'Product', 'Qty', 'UOM', 'Weight']],
    body: input.rows.length > 0
      ? input.rows.map((r) => [r.date, r.docNo, r.type, r.productName, r.qty, r.unitCode, r.weight])
      : [['', '', '', 'No movements in the selected period', '', '', '']],
    theme: 'grid',
    styles: { font: MONO, fontSize: 7.5, textColor: INK, cellPadding: 1.8, lineColor: LINE, lineWidth: 0.25 },
    headStyles: { fontStyle: 'bold', textColor: [255, 255, 255], fillColor: INK },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 26 },
      2: { cellWidth: 22 },
      4: { halign: 'right', fontStyle: 'bold' },
      5: { halign: 'left' },
      6: { halign: 'right' }
    }
  });
  y = tableEndY(doc) + 6;

  if (input.totals.length > 0) {
    y = sectionLabel(doc, 'Product-wise Totals', y);
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Product', 'Dispatched', 'Returned', 'Net Held', 'Unit', 'Net Weight']],
      body: input.totals.map((x) => [
        x.productName, x.dispatched, x.returned, x.net, x.unitCode, x.netWeight
      ]),
      theme: 'grid',
      styles: { font: MONO, fontSize: 7.5, textColor: INK, cellPadding: 1.8, lineColor: LINE, lineWidth: 0.25 },
      headStyles: { fontStyle: 'bold', textColor: [255, 255, 255], fillColor: INK },
      footStyles: { fontStyle: 'bold', textColor: INK, fillColor: WASH },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right', fontStyle: 'bold' },
        5: { halign: 'right' }
      }
    });
    y = tableEndY(doc) + 6;
  }

  const footerExtras = [
    formatAddress(biz.address, biz.city, biz.state, biz.postal_code ? `${biz.postal_code}, India` : 'India'),
    ...(bizPhone ? [`Contact: ${bizPhone}`] : []),
  ];
  stampFooter(doc, `AccuLedger - Movement Ledger ${str(input.customerName).substring(0, 30)}`, '', { h: 290, margin: MARGIN, width: PAGE_W }, footerExtras);
  drawWatermark(doc, input.logoDataUrl, 210, 297);
  return doc;
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------
export function docToBase64(doc: jsPDF): string {
  const buf = doc.output('arraybuffer') as ArrayBuffer;
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
