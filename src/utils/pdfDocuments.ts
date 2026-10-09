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

function stampFooter(doc: jsPDF, left: string, right: string) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont(SANS, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...FAINT);
    doc.text(left, MARGIN, 290);
    doc.text(`${right}  |  Page ${i} of ${pages}`, PAGE_W - MARGIN, 290, { align: 'right' });
  }
}

function sectionLabel(doc: jsPDF, text: string, y: number) {
  doc.setFont(MONO, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(text.toUpperCase(), MARGIN, y);
  return y + 5;
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
  }
): number {
  let y = 16;
  doc.setFont(SANS, 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...INK);
  doc.text(opts.name.toUpperCase().substring(0, 42), MARGIN, y);
  y += 5.5;
  doc.setFont(SANS, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(opts.sub.substring(0, 80), MARGIN, y);
  y += 4.5;
  doc.text(opts.address.substring(0, 95), MARGIN, y);
  y += 4.5;
  doc.setFont(MONO, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  for (const line of opts.metaLines) {
    doc.text(line.substring(0, 95), MARGIN, y);
    y += 4;
  }

  // Right stamp block
  doc.setFillColor(...INK);
  doc.roundedRect(PAGE_W - MARGIN - 52, 14, 52, 9, 1.5, 1.5, 'F');
  doc.setFont(MONO, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(opts.stamp, PAGE_W - MARGIN - 26, 20.2, { align: 'center' });
  let ry = 27;
  if (opts.stampSub) {
    doc.setFont(MONO, 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(opts.stampSub, PAGE_W - MARGIN, ry, { align: 'right' });
    ry += 4.5;
  }
  doc.setFont(MONO, 'normal');
  doc.setFontSize(8);
  for (const [label, value] of opts.metaRight) {
    doc.setTextColor(...MUTED);
    doc.text(label, PAGE_W - MARGIN - 62, ry, { align: 'right' });
    doc.setTextColor(...INK);
    doc.setFont(MONO, 'bold');
    doc.text(value.substring(0, 34), PAGE_W - MARGIN, ry, { align: 'right' });
    doc.setFont(MONO, 'normal');
    ry += 4.2;
  }

  y = Math.max(y, ry) + 3;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.7);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
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
}

export function buildInvoicePdf(input: InvoicePdfInput): jsPDF {
  const { invoice, items, payments, allocations } = input;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const biz = invoice.business_snapshot;
  const cust = invoice.customer_snapshot;

  let y = businessHeader(doc, {
    name: str(biz.legal_name || biz.business_name, 'Business'),
    sub: str(biz.business_name),
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
  });

  // Bill-to + allocations
  y = sectionLabel(doc, 'Billed To (Customer Snapshot)', y);
  doc.setFont(SANS, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(str(cust.customer_name).substring(0, 60), MARGIN, y);
  y += 5;
  doc.setFont(SANS, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  const custAddr = `${str(cust.address, '')} ${str(cust.city, '')}, ${str(cust.state, '')} - ${str(cust.postal_code, '')}`.trim();
  doc.text(custAddr.substring(0, 100), MARGIN, y);
  y += 4.5;
  doc.setFont(MONO, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  doc.text(`GSTIN: ${str(cust.gst_number, 'N/A / Unregistered')}  |  PAN: ${str(cust.pan, 'N/A')}`, MARGIN, y);
  y += 4;
  doc.text(`Contact: ${str(cust.mobile, '-')} | ${str(cust.email, '-')}`.substring(0, 95), MARGIN, y);
  y += 6;

  if (allocations.length > 0) {
    y = sectionLabel(doc, 'Inventory Allocation Audit Link', y);
    doc.setFont(MONO, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    const refs = allocations
      .map((a) => `#${a.customer_inventory_movement_id}: ${a.allocated_quantity} units`)
      .join('   ');
    const lines = doc.splitTextToSize(refs, PAGE_W - MARGIN * 2);
    doc.text(lines, MARGIN, y);
    y += lines.length * 3.8 + 3;
  }

  // Line items
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['#', 'Item Description', 'SKU', 'Qty', 'UOM', 'Unit Price', 'Taxable', 'GST%', 'Line Total']],
    body: items.map((it, idx) => [
      String(idx + 1),
      str(it.product_name_snapshot),
      str(it.sku_snapshot),
      String(it.quantity),
      str(it.uom_snapshot),
      rs(it.unit_price),
      rs(it.taxable_amount),
      `${it.gst_rate}%`,
      rs(it.line_total)
    ]),
    theme: 'plain',
    styles: { font: MONO, fontSize: 7.5, textColor: INK, cellPadding: 2 },
    headStyles: { font: MONO, fontSize: 7.5, fontStyle: 'bold', textColor: MUTED, fillColor: WASH },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right', fontStyle: 'bold' }
    },
    didDrawPage: () => {
      doc.setFont(MONO, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...FAINT);
    }
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  // Totals
  const totalRate = items.length > 0 ? items[0].gst_rate : 0;
  const halfRate = totalRate / 2;
  const totalRows: Array<[string, string, boolean?]> = [
    ['Taxable Amount:', rs(invoice.taxable_amount), true]
  ];
  if (invoice.cgst > 0) totalRows.push([`CGST (${halfRate}%):`, rs(invoice.cgst)]);
  if (invoice.sgst > 0) totalRows.push([`SGST (${halfRate}%):`, rs(invoice.sgst)]);
  if (invoice.igst > 0) totalRows.push([`IGST (${totalRate}%, Inter-state):`, rs(invoice.igst)]);
  if (invoice.other_charges > 0) totalRows.push(['Other / Freight Charges:', rs(invoice.other_charges)]);
  y = totalsBlock(doc, y, totalRows, 'Grand Total:', rs(invoice.grand_total));

  const activePayments = payments.filter((p) => p.status === 'ACTIVE');
  const totalPaid = activePayments.reduce((s, p) => s + p.amount, 0);
  const outstanding = invoice.status === 'CANCELLED' ? 0 : Math.max(0, invoice.grand_total - totalPaid);
  doc.setFont(MONO, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(4, 120, 87);
  doc.text('Total Amount Paid:', 118, y);
  doc.text(rs(totalPaid), PAGE_W - MARGIN, y, { align: 'right' });
  y += 5;
  doc.setTextColor(...INK);
  doc.setFont(MONO, 'bold');
  doc.text('Outstanding Balance:', 118, y);
  doc.text(rs(outstanding), PAGE_W - MARGIN, y, { align: 'right' });
  y += 7;

  y = sectionLabel(doc, 'Amount In Words', y);
  doc.setFont(SANS, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  const words = doc.splitTextToSize(numberToWordsINR(invoice.grand_total), PAGE_W - MARGIN * 2);
  doc.text(words, MARGIN, y);
  y += words.length * 4.5 + 3;

  // Bank + notes
  const bank = invoice.bank_snapshot;
  y = sectionLabel(doc, 'Bank Remittance Details (Persisted Snapshot)', y);
  doc.setFont(MONO, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  for (const line of [
    `Bank Name: ${str(bank.bank_name)}`,
    `A/C Number: ${str(bank.bank_account_number)}`,
    `IFSC Code: ${str(bank.ifsc)}`,
    `Branch: ${str(bank.branch)}`
  ]) {
    doc.text(line.substring(0, 90), MARGIN, y);
    y += 4;
  }
  y += 1;
  if (invoice.notes) {
    doc.setFont(SANS, 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    const noteLines = doc.splitTextToSize(`Notes: ${invoice.notes}`, PAGE_W - MARGIN * 2);
    doc.text(noteLines, MARGIN, y);
    y += noteLines.length * 4 + 3;
  }

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
      theme: 'plain',
      styles: { font: MONO, fontSize: 7.5, textColor: INK, cellPadding: 1.8 },
      headStyles: { fontStyle: 'bold', textColor: MUTED, fillColor: WASH },
      columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } }
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
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
  return doc;
}

// ---------------------------------------------------------------------------
// DELIVERY CHALLAN (Rule 55)
// ---------------------------------------------------------------------------
export interface ChallanPdfInput {
  business: BusinessSettings;
  customer: Customer;
  primaryMovement: CustomerInventoryMovement & {
    dispatch_purpose?: string;
    vehicle_number?: string;
    transporter_name?: string;
    eway_bill_number?: string;
    notes?: string;
    movement_date?: string;
  };
  copyLabel: string;
  challanDate: string;
  timeOfRemoval: string;
  itemRows: Array<{
    sNo: number;
    productName: string;
    description?: string;
    sku: string;
    hsnCode: string;
    quantity: number;
    unitCode: string;
    indicativePrice: number;
    lineTotal: number;
  }>;
  totalQuantity: number;
  totalIndicativeVal: number;
}

export function buildChallanPdf(input: ChallanPdfInput): jsPDF {
  const { business: biz, customer: cust, primaryMovement: mov, itemRows } = input;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  let y = businessHeader(doc, {
    name: str(biz.business_name, 'Business'),
    sub: str(biz.legal_name),
    address: `${str(biz.address, '')} ${str(biz.city, '')}, ${str(biz.state, '')} - ${str(biz.postal_code, '')}, India`.trim(),
    metaLines: [
      `GSTIN: ${str(biz.gst_number)}  |  PAN: ${str(biz.pan)}`,
      `State Code: ${str(biz.state_code)} (${str(biz.state)})`
    ],
    stamp: 'DELIVERY CHALLAN',
    stampSub: `[ ${input.copyLabel} ]`,
    metaRight: [
      ['Challan Number:', str(mov.reference_id)],
      ['Challan Date:', str(input.challanDate)],
      ['Time of Removal:', str(input.timeOfRemoval)],
      ['Nature of Movement:', str(mov.dispatch_purpose || 'Consignment Transfer / Holding').substring(0, 34)]
    ]
  });

  // Consignor / consignee
  y = sectionLabel(doc, 'Consignor (Dispatched From)  |  Consignee (Dispatched To)', y);
  doc.setFont(SANS, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(str(biz.business_name).substring(0, 45), MARGIN, y);
  doc.text(str(cust.customer_name).substring(0, 45), 110, y);
  y += 4.5;
  doc.setFont(SANS, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(`${str(biz.city, '')}, ${str(biz.state, '')} | GSTIN ${str(biz.gst_number)}`.substring(0, 48), MARGIN, y);
  doc.text(`${str(cust.city, '')}, ${str(cust.state, '')} | GSTIN ${str(cust.gst_number, 'Unregistered')}`.substring(0, 48), 110, y);
  y += 4.5;
  doc.text(`Contact: ${str(biz.phone, '-')} | ${str(biz.email, '-')}`.substring(0, 48), MARGIN, y);
  doc.text(`Contact: ${str(cust.mobile, '-')} | ${str(cust.email, '-')}`.substring(0, 48), 110, y);
  y += 7;

  // Transport
  y = sectionLabel(doc, 'Transportation & Logistics', y);
  doc.setFont(MONO, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...INK);
  const tCols: Array<[string, string]> = [
    ['Vehicle:', str(mov.vehicle_number || 'GJ-05-BX-4921 (Authorized)')],
    ['Transporter:', str(mov.transporter_name || 'Direct Road Logistics / Transport')],
    ['E-Way Bill:', str(mov.eway_bill_number || 'EWB-2026-N/A')],
    ['Place of Supply:', `${str(cust.city, '')}, ${str(cust.state, '')}`]
  ];
  let tx = MARGIN;
  for (const [label, value] of tCols) {
    doc.setTextColor(...MUTED);
    doc.text(label, tx, y);
    doc.setTextColor(...INK);
    doc.setFont(MONO, 'bold');
    doc.text(value.substring(0, 26), tx, y + 3.8);
    doc.setFont(MONO, 'normal');
    tx += 46;
  }
  y += 9;
  if (mov.notes) {
    doc.setFont(SANS, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    const noteLines = doc.splitTextToSize(`Instructions / Site Remarks: ${mov.notes}`, PAGE_W - MARGIN * 2);
    doc.text(noteLines, MARGIN, y);
    y += noteLines.length * 4 + 2;
  }

  // Items
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
      head: [['#', 'Description of Goods', 'SKU', 'HSN', 'Qty', 'UOM', 'Agreed Rate', 'Total Value (Rs.)']],
    body: itemRows.map((r) => [
      String(r.sNo),
      r.description ? `${r.productName} - ${r.description}` : r.productName,
      r.sku,
      r.hsnCode,
      String(r.quantity),
      r.unitCode,
      rs(r.indicativePrice),
      rs(r.lineTotal)
    ]),
    foot: [[
      { content: 'Total Dispatched Quantity & Value:', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
      String(input.totalQuantity),
      'Units',
      '',
      rs(input.totalIndicativeVal)
    ]],
    theme: 'plain',
    styles: { font: MONO, fontSize: 7.5, textColor: INK, cellPadding: 2 },
    headStyles: { fontStyle: 'bold', textColor: MUTED, fillColor: WASH },
    footStyles: { fontStyle: 'bold', textColor: INK, fillColor: WASH },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      4: { halign: 'right', fontStyle: 'bold' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right', fontStyle: 'bold' }
    }
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  // Valuation + statutory notice
  y = sectionLabel(doc, 'Agreed Value In Words', y);
  doc.setFont(SANS, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  const words = doc.splitTextToSize(numberToWordsINR(input.totalIndicativeVal), PAGE_W - MARGIN * 2);
  doc.text(words, MARGIN, y);
  y += words.length * 4.5 + 3;
  doc.setFont(SANS, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  const decl = doc.splitTextToSize(
    'Statutory Declaration (Rule 55): This Delivery Challan is issued under Rule 55 of the Central Goods and Services Tax (CGST) Rules, 2017 for transfer of goods to the customer site on a consignment/holding basis. THIS DOCUMENT DOES NOT CONSTITUTE A TAX INVOICE OR SALE OF GOODS. Ownership and risk remain with the consignor until a formal tax invoice is generated.',
    PAGE_W - MARGIN * 2
  );
  doc.text(decl, MARGIN, y);
  y += decl.length * 3.6 + 6;

  // Signatures
  if (y > 250) {
    doc.addPage();
    y = 16;
  }
  y = sectionLabel(doc, 'Signatures & Acknowledgment', y);
  const sigW = (PAGE_W - MARGIN * 2 - 8) / 3;
  const sigs: Array<[string, string]> = [
    ["Receiver's Acknowledgment & Stamp", 'Received goods in sound order'],
    ["Transporter's Signature", 'Accepted material for safe carriage'],
    ['Authorised Signatory (Consignor)', str(biz.business_name).substring(0, 30)]
  ];
  sigs.forEach(([title, sub], i) => {
    const sx = MARGIN + i * (sigW + 4);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.rect(sx, y, sigW, 26);
    doc.setFont(SANS, 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...INK);
    const titleLines = doc.splitTextToSize(title, sigW - 4);
    doc.text(titleLines, sx + 2, y + 5);
    doc.setDrawColor(...FAINT);
    doc.line(sx + 6, y + 19, sx + sigW - 6, y + 19);
    doc.setFont(SANS, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(sub.substring(0, 32), sx + 2, y + 23.5);
  });

  stampFooter(doc, 'AccuLedger - Delivery Challan', str(mov.reference_id));
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
