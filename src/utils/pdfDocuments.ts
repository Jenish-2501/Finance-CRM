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
import { formatINR, numberToWordsINR } from './calculations';

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
 * Brand watermark: the business logo, large and centred on every page at very
 * low opacity. Runs LAST on the finished document; at 5% opacity the text
 * printed underneath stays fully readable. A corrupt/oversized logo can never
 * break the document: every failure is swallowed.
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
      doc.setGState(new GState({ opacity: 0.05 }));
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

export interface GujaratiLineImagePx {
  dataUrl: string;
  wPx: number;
  hPx: number;
  /** Distance from the trimmed ink's TOP edge down to the text baseline (px). */
  baselinePx: number;
}

/**
 * Rasterise one Gujarati line at a FIXED pixel font size and return its
 * trimmed ink image with PIXEL dimensions plus the baseline offset. Unlike
 * gujaratiInlineImage — which normalises every line's ink height to the em
 * and therefore shrinks lines carrying tall matras — this lets a caller
 * scale a whole multi-line block by ONE common mm-per-px factor, so every
 * line's glyphs come out the same size and baselines stay aligned.
 * Returns null in jsdom (no canvas) — callers must lay out for that.
 */
export function gujaratiLineImagePx(text: string, fontPx: number): GujaratiLineImagePx | null {
  try {
    const t = (text ?? '').trim();
    if (!t || !(fontPx > 0)) return null;
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    const probe = canvas.getContext('2d');
    if (!probe) return null;
    const font = `${fontPx}px "Noto Sans Gujarati", sans-serif`;
    probe.font = font;
    const textW = probe.measureText(t).width;
    if (!textW || !Number.isFinite(textW)) return null;
    const pad = 20;
    // Headroom above the baseline for tall matras/conjuncts, room below for
    // descenders — the ink is trimmed afterwards anyway.
    const baselineY = Math.ceil(fontPx * 1.35) + pad;
    canvas.width = Math.ceil(textW + pad * 2);
    canvas.height = baselineY + Math.ceil(fontPx * 0.6) + pad;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.font = font;
    ctx.fillStyle = '#171717';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(t, pad, baselineY);
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
    return {
      dataUrl: trim.toDataURL('image/png'),
      wPx: trim.width,
      hPx: trim.height,
      baselinePx: baselineY - minY,
    };
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
// DELIVERY CHALLAN — Gujarati booklet layout (Rule 55)
// ---------------------------------------------------------------------------
// Static Gujarati booklet (labels drawn as inline images via
// gujaratiInlineImage — jsPDF built-in fonts are WinAnsi-only, so every
// Gujarati glyph is shaped on a canvas and placed as an image). All dynamic
// values — names, numbers, dates — stay Latin text, which keeps them
// selectable, copyable and assertable in tests. Item rows are fully dynamic:
// one grid row per movement line, no blank filler rows.
export interface ChallanPdfInput {
  business: BusinessSettings;
  customer: Customer;
  primaryMovement: CustomerInventoryMovement & {
    movement_date?: string;
  };
  challanDate: string;
  /** 'dispatch' (company → customer) or 'return' (customer → company). */  direction?: 'dispatch' | 'return';
  /** Current business logo data URL (PNG/JPEG). Drawn as a centred watermark
      on every page when present. */
  logoDataUrl?: string;
  itemRows: Array<{
    productName: string;
    quantity: number;
    unitCode: string;
    /** Grams for weight-priced (piece-mapped) products; null/undefined keeps
        the Weight column blank for plain count-priced lines. BOX lines never
        carry grams — they count in the Box column only. */
    grams?: number | null;
  }>;
}

// The fixed Gujarati notice printed under the items grid, exactly as the
// printed booklet carries it. Never translated — it is part of the form.
const CHALLAN_NOTICE_GU = [
  'રવિવારે દુકાન બંધ રહેશે.',
  'ધાગા-જરી ચેક કરીને કાપડ પર લગાવવા. કાપડ પર લાગ્યા પછી અમારી જવાબદારી નથી.',
  'કલર ડાઈંગની કે શેડ ફરકની કોઈ પ્રકારની ગેરંટી આપવામાં આવતી નથી.',
  'વેચેલા માલની કોઈ જવાબદારી અમારી નથી. તેની ખાસ નોંધ લેવી.',
  '૧ થી ૨૦ તારીખ સુધીમાં પેમેન્ટ આપવાનું રહેશે.',
];

/**
 * Draws a Gujarati label as an inline image sitting on the `yBaseline` text
 * line (same vertical-centering rule as sectionCustomerLine). Returns the
 * placed image (with width, so callers can chain the next element) or null
 * when no canvas is available (tests) — callers must lay out for that.
 */
function guLabel(
  doc: jsPDF,
  text: string,
  x: number,
  yBaseline: number,
  fontSizePt: number,
  align: 'left' | 'right' | 'center' = 'left',
  maxWMm = 40
): GujaratiInlineImage | null {
  const img = gujaratiInlineImage(text, fontSizePt, maxWMm);
  if (!img) return null;
  const top = yBaseline - (fontSizePt * 25.4) / 72;
  const lineH = pdfLineHeight(fontSizePt);
  const px = align === 'right' ? x - img.w : align === 'center' ? x - img.w / 2 : x;
  doc.addImage(img.dataUrl, 'PNG', px, top + (lineH - img.h) / 2, img.w, img.h);
  return img;
}

export function buildChallanPdf(input: ChallanPdfInput): jsPDF {
  const { business: biz, customer: cust, primaryMovement: mov, itemRows } = input;
  const isReturn = input.direction === 'return';
  // Same compact A6 booklet size the challan has always used.
  const W = 105;
  const PAGE_H = 148;
  const M = 8;
  const doc = new jsPDF({ unit: 'mm', format: 'a6' });

  // ---- Header band: title left, Gujarati business name centre, phone right ----
  // Title and Ph.No share the same font, size, weight and baseline so the
  // row reads as one aligned line.
  let y = 10;
  doc.setFont(SANS, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(isReturn ? 'RETURN CHALLAN' : 'DELIVERY CHALLAN', M, y);

  const bizGu = (biz.gujarati_name ?? '').trim();
  const bizGuImg = bizGu ? gujaratiInlineImage(bizGu, 14, W - 2 * M - 30) : null;
  if (bizGuImg) {
    doc.addImage(bizGuImg.dataUrl, 'PNG', (W - bizGuImg.w) / 2, 11.2, bizGuImg.w, bizGuImg.h);
  } else {
    doc.setFont(SANS, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(str(biz.business_name, 'Business').toUpperCase().substring(0, 30), W / 2, 15.2, { align: 'center' });
  }

  const phone = str(biz.phone, '');
  if (phone) {
    const phoneText = phone.substring(0, 18);
    // Re-assert the header style: the centred-name fallback above bumps the
    // font size, and the phone must stay identical to the title.
    doc.setFont(SANS, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.text(phoneText, W - M, y, { align: 'right' });
    const numW = doc.getTextWidth(phoneText);
    doc.text('Ph.No :', W - M - numW - 3, y, { align: 'right' });
  }

  // ---- Info box: customer (left) | challan number + date (right) ----
  const boxTop = 20;
  const boxH = 14;
  const boxMid = M + 52;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.4);
  doc.rect(M, boxTop, W - 2 * M, boxH);
  doc.setLineWidth(0.25);
  doc.line(boxMid, boxTop, boxMid, boxTop + boxH);

  const guName = (cust.gujarati_name ?? '').trim();
  const custGuImg = guName ? gujaratiInlineImage(guName, 8, boxMid - M - 14) : null;

  // Left: નામ (customer — Gujarati nickname when present) and સરનામું (address).
  const nameLbl = guLabel(doc, 'નામ:', M + 2.5, boxTop + 5.5, 7.5, 'left', 12);
  const nameX = M + 2.5 + (nameLbl ? nameLbl.w + 1.5 : 9);
  doc.setFont(SANS, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  if (custGuImg) {
    doc.addImage(custGuImg.dataUrl, 'PNG', nameX, boxTop + 5.5 - (8 * 25.4) / 72 + (pdfLineHeight(8) - custGuImg.h) / 2, custGuImg.w, custGuImg.h);
  } else {
    doc.text(str(guName || cust.customer_name, 'Customer').substring(0, 34), nameX, boxTop + 5.5);
  }
  const addrLbl = guLabel(doc, 'સરનામું:', M + 2.5, boxTop + 11.5, 7.5, 'left', 17);
  const addrX = M + 2.5 + (addrLbl ? addrLbl.w + 1.5 : 14);
  doc.setFont(SANS, 'normal');
  doc.setFontSize(7.5);
  const addrText = str(cust.address, '') || str(cust.city, '-');
  doc.text(doc.splitTextToSize(addrText, boxMid - addrX - 2)[0] || addrText, addrX, boxTop + 11.5);

  // Right: ચલન નં. (challan number, prominent) and તારીખ (date).
  const noLbl = guLabel(doc, 'ચલન નં.:', boxMid + 2.5, boxTop + 6, 7.5, 'left', 16);
  const noX = boxMid + 2.5 + (noLbl ? noLbl.w + 1.5 : 13);
  doc.setFont(MONO, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(str(mov.reference_id).substring(0, 14), noX, boxTop + 6);
  const dateLbl = guLabel(doc, 'તારીખ:', boxMid + 2.5, boxTop + 11.5, 7.5, 'left', 14);
  const dateX = boxMid + 2.5 + (dateLbl ? dateLbl.w + 1.5 : 11);
  doc.setFont(SANS, 'normal');
  doc.setFontSize(8);
  doc.text(str(input.challanDate).substring(0, 22), dateX, boxTop + 11.5);

  // ---- Items grid: # | Prod Name | Box | Pcs | Weight — fixed 10 rows/page ----
  // The body always spans exactly 10 evenly distributed rows (blank ruled
  // rows included), so the totals row, notice and signatures sit at a fixed
  // height and the page ends flush — like the printed booklet.
  // A line counts in exactly ONE quantity column: BOX-dispatched goods show
  // their box count and keep Pcs/Weight blank; piece-mapped (weight-priced)
  // lines print their weight in KG; everything else is a bare Pcs count.
  const kgText = (g: number): string => String(Number((g / 1000).toFixed(3)));
  const isBoxRow = (r: ChallanPdfInput['itemRows'][number]): boolean =>
    str(r.unitCode, '').toUpperCase() === 'BOX';
  const colX = [M, M + 7, M + 45, M + 56, M + 67, W - M];
  const headH = 6.5;
  const BODY_ROWS = 10;
  const rowH = 5.8;
  const drawGridHead = (top: number) => {
    doc.setFillColor(...WASH);
    doc.rect(colX[0], top, W - 2 * M, headH, 'F');
    doc.setDrawColor(...MUTED);
    doc.setLineWidth(0.3);
    doc.rect(colX[0], top, W - 2 * M, headH);
    doc.setFont(SANS, 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...INK);
    doc.text('#', (colX[0] + colX[1]) / 2, top + headH - 2.1, { align: 'center' });
    doc.text('Prod Name', (colX[1] + colX[2]) / 2, top + headH - 2.1, { align: 'center' });
    doc.text('Box', (colX[2] + colX[3]) / 2, top + headH - 2.1, { align: 'center' });
    doc.text('Pcs', (colX[3] + colX[4]) / 2, top + headH - 2.1, { align: 'center' });
    doc.text('Weight (KG)', (colX[4] + colX[5]) / 2, top + headH - 2.1, { align: 'center' });
  };
  // Outer frame + column separators for one page's grid section.
  const strokeFrame = (top: number, bottom: number) => {
    doc.setDrawColor(...MUTED);
    doc.setLineWidth(0.3);
    doc.rect(colX[0], top, W - 2 * M, bottom - top);
    for (const gx of [colX[1], colX[2], colX[3], colX[4]]) {
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.25);
      doc.line(gx, top, gx, bottom);
    }
  };
  const rowRule = (top: number) => {
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.25);
    doc.line(colX[0], top + rowH, colX[5], top + rowH);
  };

  // Table starts flush under the info box — no gap between them.
  let gridTop = boxTop + boxH;
  drawGridHead(gridTop);
  let ty = gridTop + headH;
  let rowInPage = 0;

  doc.setFont(SANS, 'normal');
  doc.setFontSize(7.5);
  itemRows.forEach((r, i) => {
    if (rowInPage === BODY_ROWS) {
      strokeFrame(gridTop, ty); // close the completed page
      doc.addPage();
      gridTop = 10;
      drawGridHead(gridTop);
      ty = gridTop + headH;
      rowInPage = 0;
    }
    const boxLine = isBoxRow(r);
    doc.setFont(SANS, 'normal');
    doc.setTextColor(...INK);
    doc.text(String(i + 1), (colX[0] + colX[1]) / 2, ty + 3.6, { align: 'center' });
    doc.text(str(r.productName, '-').substring(0, 30), colX[1] + 1.5, ty + 3.6);
    if (boxLine) {
      // Box-dispatched line: the count goes in the Box column; Pcs and
      // Weight stay blank (a dash) per the booklet's one-column rule.
      doc.text(String(r.quantity).substring(0, 10), colX[3] - 1.5, ty + 3.6, { align: 'right' });
      doc.text('-', colX[4] - 1.5, ty + 3.6, { align: 'right' });
      doc.text('-', colX[5] - 1.5, ty + 3.6, { align: 'right' });
    } else {
      doc.text('-', colX[3] - 1.5, ty + 3.6, { align: 'right' });
      doc.text(String(r.quantity).substring(0, 10), colX[4] - 1.5, ty + 3.6, { align: 'right' });
      if (r.grams !== null && r.grams !== undefined) {
        doc.setFont(SANS, 'bold');
        doc.text(kgText(r.grams).substring(0, 10), colX[5] - 1.5, ty + 3.6, { align: 'right' });
        doc.setFont(SANS, 'normal');
      } else {
        doc.text('-', colX[5] - 1.5, ty + 3.6, { align: 'right' });
      }
    }
    rowRule(ty);
    ty += rowH;
    rowInPage++;
  });
  // Blank ruled rows complete the fixed 10-row body (booklet style).
  for (; rowInPage < BODY_ROWS; rowInPage++) {
    rowRule(ty);
    ty += rowH;
  }

  // Totals row: કુલ | Σ Box | Σ Pcs | Σ Weight (KG). Each column totals its
  // own lines only — a box-dispatched challan never leaks boxes into Pcs.
  const footH = 6;
  const boxTotal = itemRows.filter((r) => isBoxRow(r)).reduce((s, r) => s + r.quantity, 0);
  const pcsTotal = itemRows.filter((r) => !isBoxRow(r)).reduce((s, r) => s + r.quantity, 0);
  const gramsTotal = itemRows.filter((r) => !isBoxRow(r)).reduce((s, r) => s + (r.grams ?? 0), 0);
  doc.setFillColor(...WASH);
  doc.rect(colX[0], ty, W - 2 * M, footH, 'F');
  doc.setFont(SANS, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...INK);
  guLabel(doc, 'કુલ', (colX[1] + colX[2]) / 2, ty + footH - 1.9, 7.5, 'center', 10);
  doc.text(boxTotal > 0 ? String(boxTotal) : '-', colX[3] - 1.5, ty + footH - 1.9, { align: 'right' });
  doc.text(pcsTotal > 0 ? String(pcsTotal) : '-', colX[4] - 1.5, ty + footH - 1.9, { align: 'right' });
  doc.text(gramsTotal > 0 ? kgText(gramsTotal) : '-', colX[5] - 1.5, ty + footH - 1.9, { align: 'right' });
  strokeFrame(gridTop, ty + footH);
  ty += footH + 6; // breathing room between the table footer and the notice

  // ---- Fixed Gujarati notice (booklet wording), bulleted with open spacing.
  // All 5 lines share ONE glyph size: they are rasterised at a fixed pixel
  // font size and scaled by a single mm-per-px factor — the largest that
  // keeps the em under 8pt and fits the widest line inside the printable
  // width. (Per-line em normalisation would shrink lines with tall matras.)
  {
    const noticeMaxW = W - 2 * M - 3.2;
    const imgs = CHALLAN_NOTICE_GU.map((l) => gujaratiLineImagePx(l, 64));
    const widest = Math.max(...imgs.map((i) => (i ? i.wPx : 0)));
    const emCapMm = (8 * 25.4) / 72;
    const mmPerPx = Math.min(emCapMm / 64, widest > 0 ? noticeMaxW / widest : Infinity);
    for (let i = 0; i < CHALLAN_NOTICE_GU.length; i++) {
      const img = imgs[i];
      doc.setFillColor(...INK);
      doc.circle(M + 1, ty - 1.3, 0.45, 'F');
      if (img) {
        // Ink baseline lands exactly on the line's baseline: lines grow
        // upward from it, so matras never collide with the line above.
        doc.addImage(img.dataUrl, 'PNG', M + 3.2, ty - img.baselinePx * mmPerPx, img.wPx * mmPerPx, img.hPx * mmPerPx);
      }
      ty += 4.6;
    }
  }

  // ---- Signatures: માલ લેનારની સહી (far left) / માલ આપનારની સહી (far right),
  //      pinned to the bottom of the page so no dead space remains ----
  if (ty + 3 > PAGE_H - 3) {
    doc.addPage();
    ty = 12;
  }
  const sigY = Math.max(ty + 1, PAGE_H - 10);
  const leftSig = guLabel(doc, 'માલ લેનારની સહી', M, sigY, 7.5, 'left', 30);
  const leftSigEnd = M + (leftSig ? leftSig.w + 2 : 30);
  doc.setDrawColor(...MUTED);
  doc.setLineWidth(0.3);
  doc.line(leftSigEnd, sigY + 1, M + 44, sigY + 1);
  // Right: label first, then the sign line running to the right margin —
  // mirrored with the left side (label, then underscores).
  guLabel(doc, 'માલ આપનારની સહી', W - M - 18, sigY, 7.5, 'right', 30);
  doc.line(W - M - 16, sigY + 1, W - M, sigY + 1);

  stampFooter(doc, `AccuLedger - ${isReturn ? 'Return' : 'Delivery'} Challan ${str(mov.reference_id)}`, '', { h: PAGE_H - 3, margin: M, width: W }, []);
  drawWatermark(doc, input.logoDataUrl, W, PAGE_H);
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
// Customer Ledger print (CustomerLedgerView): identity block with the big
// customer number far left, per-product billed supply for the period,
// previous-outstanding side box, and the statement of account. All row cells
// arrive pre-formatted (builder convention — views own the display logic).
// ---------------------------------------------------------------------------
export interface CustomerLedgerPdfInput {
  business: BusinessSettings;
  customerNumber: string;
  customerName: string;
  /** GSTIN / mobile / city one-liner for the identity block. */
  customerMeta: string;
  /** Gujarati nickname, printed under the English name. */
  customerGujaratiName?: string;
  /** Pre-formatted "from - to" range shown right-aligned above the tables. */
  periodLabel: string;
  supply: Array<{
    productName: string;
    qty: string;
    unitCode: string;
    pcs: string;
    weightKg: string;
    rate: string;
    value: string;
  }>;
  supplyTotal: string;
  /** Month-wise pre-period dues — only months with a balance. */
  previousOutstanding: Array<{
    label: string;
    amount: string;
  }>;
  previousOutstandingTotal: string;
  statement: Array<{
    date: string;
    ref: string;
    type: string;
    description: string;
    debit: string;
    credit: string;
    balance: string;
  }>;
  statementTotals: { debit: string; credit: string; closing: string };
  logoDataUrl?: string;
}

export function buildCustomerLedgerPdf(input: CustomerLedgerPdfInput): jsPDF {
  const { business: biz } = input;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const bizPhone = str(biz.phone, '');

  let y = businessHeader(doc, {
    name: str(biz.business_name, 'Business'),
    sub: '',
    address: formatAddress(biz.address, biz.city, biz.state, biz.postal_code),
    metaLines: [
      `GSTIN: ${str(biz.gst_number)}  |  PAN: ${str(biz.pan)}`,
      ...(bizPhone ? [`Contact: ${bizPhone}`] : []),
    ],
    stamp: 'CUSTOMER LEDGER',
    metaRight: [],
  }, { width: PAGE_W, margin: MARGIN, compact: true, top: 12 });

  // Identity block: customer number in BIG mono digits far left; name,
  // Gujarati nickname and meta to its right.
  const numY = y + 10;
  const num = str(input.customerNumber).substring(0, 14);
  doc.setFont(MONO, 'bold');
  doc.setFontSize(24);
  doc.setTextColor(...INK);
  doc.text(num, MARGIN, numY);
  const nx = MARGIN + doc.getTextWidth(num) + 6;

  doc.setFont(SANS, 'bold');
  doc.setFontSize(11.5);
  doc.text(str(input.customerName).substring(0, 42), nx, numY - 4.5);

  // Gujarati nickname on its own line below the name (canvas-rendered PNG —
  // jsPDF core fonts cannot shape Indic scripts).
  const guImg = gujaratiInlineImage(input.customerGujaratiName ?? '', 10, 100);
  let metaY = numY - 0.5;
  if (guImg) {
    const guH = pdfLineHeight(10);
    doc.addImage(guImg.dataUrl, 'PNG', nx + 0.5, numY + 0.2, guImg.w, guImg.h);
    metaY = numY + 0.2 + guH + 0.8;
  }
  doc.setFont(MONO, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(str(input.customerMeta).substring(0, 80), nx, metaY);

  // Period range, right-aligned above the tables.
  y = numY + 8;
  doc.setFont(MONO, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(`PERIOD: ${str(input.periodLabel).toUpperCase()}`, PAGE_W - MARGIN, y, { align: 'right' });
  y += 5;

  const boxTop = y;

  // Left column: per-product billed supply for the period (~128mm wide; the
  // right 54mm stay free for the outstanding box).
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: PAGE_W - MARGIN - 128 },
    head: [['#', 'Product', 'Qty', 'Unit', 'PCS', 'Weight (KG)', 'Rate', 'Value']],
    body: input.supply.length > 0
      ? input.supply.map((r, i) => [
          String(i + 1), r.productName, r.qty, r.unitCode, r.pcs, r.weightKg, r.rate, r.value
        ])
      : [['', '', '', 'Nothing supplied in this period', '', '', '', '']],
    foot: input.supply.length > 0
      ? [['', 'TOTAL', '', '', '', '', '', input.supplyTotal]]
      : undefined,
    theme: 'grid',
    styles: { font: MONO, fontSize: 7, textColor: INK, cellPadding: 1.6, lineColor: LINE, lineWidth: 0.25 },
    headStyles: { fontStyle: 'bold', textColor: [255, 255, 255], fillColor: INK },
    footStyles: { fontStyle: 'bold', textColor: INK, fillColor: WASH },
    columnStyles: {
      0: { cellWidth: 5, halign: 'right' },
      1: { cellWidth: 27 },
      2: { cellWidth: 10, halign: 'right', fontStyle: 'bold' },
      3: { cellWidth: 9 },
      4: { cellWidth: 10, halign: 'right' },
      5: { cellWidth: 15, halign: 'right' },
      6: { cellWidth: 22, halign: 'right' },
      7: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }
    }
  });
  const supplyEnd = tableEndY(doc);

  // Right column: previous-month dues (FINALIZED invoices dated before the
  // period that still carry a balance, bucketed by calendar month).
  const boxX = PAGE_W - MARGIN - 54;
  const boxW = 54;
  const MAX_BOX_ROWS = 12;
  const shown = input.previousOutstanding.slice(0, MAX_BOX_ROWS);
  const hidden = input.previousOutstanding.length - shown.length;
  const rowH = 4.2;
  const boxInnerH = 7 + 4 + shown.length * rowH + (hidden > 0 ? 4 : 0) + 6;
  const boxBottom = Math.max(boxTop + boxInnerH, supplyEnd + 2);
  doc.setFillColor(...WASH);
  doc.setDrawColor(...LINE);
  doc.roundedRect(boxX, boxTop, boxW, boxBottom - boxTop, 1.5, 1.5, 'FD');

  doc.setFillColor(...INK);
  doc.rect(boxX, boxTop, boxW, 6, 'F');
  doc.setFont(MONO, 'bold');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text('PREVIOUS OUTSTANDING', boxX + boxW / 2, boxTop + 4, { align: 'center', baseline: 'middle' });

  let by = boxTop + 10;
  doc.setFontSize(6.5);
  if (shown.length === 0) {
    doc.setTextColor(...MUTED);
    doc.text('No dues from before this period', boxX + 3, by);
    by += rowH;
  }
  for (const r of shown) {
    doc.setFont(MONO, 'normal');
    doc.setTextColor(...INK);
    doc.text(str(r.label).substring(0, 16), boxX + 3, by);
    doc.setFont(MONO, 'bold');
    doc.setTextColor(...INK);
    doc.text(str(r.amount), boxX + boxW - 3, by, { align: 'right' });
    by += rowH;
  }
  if (hidden > 0) {
    doc.setFont(MONO, 'normal');
    doc.setTextColor(...MUTED);
    doc.text(`+ ${hidden} more month(s)`, boxX + 3, by);
    by += rowH;
  }
  // Total line pinned to the bottom of the box.
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.line(boxX + 3, boxBottom - 6, boxX + boxW - 3, boxBottom - 6);
  doc.setFont(MONO, 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...INK);
  doc.text('TOTAL DUE', boxX + 3, boxBottom - 2.5);
  doc.text(str(input.previousOutstandingTotal), boxX + boxW - 3, boxBottom - 2.5, { align: 'right' });

  // Statement of account, full width below both columns.
  y = Math.max(supplyEnd, boxBottom) + 8;
  y = sectionLabel(doc, 'Statement of Account', y);
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Date', 'Ref', 'Type', 'Description', 'Debit', 'Credit', 'Balance']],
    body: input.statement.length > 0
      ? input.statement.map((r) => [r.date, r.ref, r.type, r.description, r.debit, r.credit, r.balance])
      : [['', '', '', 'No entries in the selected period', '', '', '']],
    foot: input.statement.length > 0
      ? [['', '', '', 'TOTAL', input.statementTotals.debit, input.statementTotals.credit, input.statementTotals.closing]]
      : undefined,
    theme: 'grid',
    styles: { font: MONO, fontSize: 7.5, textColor: INK, cellPadding: 1.5, lineColor: LINE, lineWidth: 0.25 },
    headStyles: { fontStyle: 'bold', textColor: [255, 255, 255], fillColor: INK },
    footStyles: { fontStyle: 'bold', textColor: INK, fillColor: WASH },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 21 },
      2: { cellWidth: 16 },
      4: { cellWidth: 27, halign: 'right' },
      5: { cellWidth: 27, halign: 'right' },
      6: { cellWidth: 27, halign: 'right', fontStyle: 'bold' }
    }
  });

  const footerExtras = [
    formatAddress(biz.address, biz.city, biz.state, biz.postal_code ? `${biz.postal_code}, India` : 'India'),
    ...(bizPhone ? [`Contact: ${bizPhone}`] : []),
  ];
  stampFooter(
    doc,
    `AccuLedger - Customer Ledger ${str(input.customerName).substring(0, 26)} (${str(input.customerNumber).substring(0, 12)})`,
    '',
    { h: 290, margin: MARGIN, width: PAGE_W },
    footerExtras
  );
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
