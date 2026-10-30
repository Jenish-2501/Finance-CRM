import { describe, it, expect } from 'vitest';
import { buildChallanPdf, type ChallanPdfInput } from '../../src/utils/pdfDocuments';
import { SEED_BUSINESS_SETTINGS } from '../../src/data/seedData';
import type { Customer, CustomerInventoryMovement } from '../../src/types/database';

// jsdom has no canvas, so gujaratiInlineImage returns null: every Gujarati
// label, the notice and both signature captions are absent from the test PDF
// (in the real app they are canvas-rasterised images). The layout must not
// depend on them, so these tests assert the Latin dynamic values — title,
// names, numbers, dates, page markers — that the booklet fills in by hand.
const cust: Customer = {
  id: 'cust-1',
  customer_name: 'Shree Nidhi Fashion',
  customer_number: 'C-1001',
  pan: 'AABCA1234C',
  gst_number: '24AABCA1234C1Z5',
  mobile: '+91 98980 11223',
  address: 'B-85, Santlal Society surat',
  city: 'Surat',
  state: 'Gujarat',
  country: 'India',
  postal_code: '395002',
  bank_details: { bank_name: 'ICICI Bank', account_number: '001234998811', ifsc: 'ICIC0000012' },
  credit_limit: 500000,
  is_active: true,
  created_at: '2026-01-10T10:00:00Z',
  updated_at: '2026-01-10T10:00:00Z',
};

const mov: CustomerInventoryMovement = {
  id: 'cim-1',
  customer_id: 'cust-1',
  product_id: 'prod-1',
  unit_id: 'uom-pcs',
  quantity: 300,
  movement_type: 'DISPATCH',
  movement_date: '2026-01-15T14:00:00Z',
  reference_type: 'DISPATCH',
  reference_id: '7',
  document_id: null,
  created_at: '2026-01-15T14:00:00Z',
  created_by: 'owner',
};

function input(partial: Partial<ChallanPdfInput> = {}): ChallanPdfInput {
  return {
    business: SEED_BUSINESS_SETTINGS,
    customer: cust,
    primaryMovement: mov,
    challanDate: '12 Oct 2026',
    itemRows: [
      { productName: 'CORN - Jari CORN', quantity: 2, unitCode: 'PCS', grams: 500 },
      { productName: 'The king of polyster', quantity: 5, unitCode: 'PCS', grams: null },
    ],
    ...partial,
  };
}

function textOf(doc: ReturnType<typeof buildChallanPdf>): string {
  const buf = doc.output('arraybuffer') as ArrayBuffer;
  return Buffer.from(buf).toString('latin1')
    .replace(/\0/g, '')
    .replace(/\\([()\\])/g, '$1'); // jsPDF escapes parens/backslashes in text runs
}

describe('challan PDF — Gujarati booklet layout', () => {
  it('renders title, business name, customer info and items on one A6 page', () => {
    const doc = buildChallanPdf(input());
    expect(doc.getNumberOfPages()).toBe(1);
    const text = textOf(doc);
    for (const needle of [
      'DELIVERY CHALLAN',
      'ABC INDUSTRIES PVT LTD', // English fallback while no Gujarati name is set
      'Ph.No :', // English phone label, number in the header
      'Shree Nidhi Fashion',
      'Santlal', // customer address shown in the info box (not just the city)
      '#', 'Prod Name', 'Box', 'Pcs', 'Weight', // English column headers
      'CORN', // product names may wrap — anchor on words
      'Jari',
      'polyster',
      'Page 1 of 1',
    ]) {
      expect(text).toContain(needle);
    }
  });

  it('prints weight in KG with a dash for plain rows', () => {
    const text = textOf(buildChallanPdf(input()));
    expect(text).toContain('0.5'); // 500 g → 0.5 KG (row cell + totals cell)
    expect(text).not.toContain('500'); // raw grams are gone
    expect(text).toContain('-'); // non-weight-priced rows show a dash
    expect(text).not.toContain('gram'); // no "500 gram" formatting anymore
    expect(text).not.toContain('Total Dispatched Quantity:'); // old English grid label
  });

  it('keeps the quantity column bare for PCS lines', () => {
    const text = textOf(buildChallanPdf(input()));
    expect(text).not.toContain('2 PCS');
    expect(text).not.toContain('5 PCS');
  });

  it('shows non-PCS quantities bare and KG-converted weight in the last column', () => {
    const text = textOf(buildChallanPdf(input({
      itemRows: [{ productName: 'Weighted fabric', quantity: 4, unitCode: 'KG', grams: 4500 }],
    })));
    expect(text).toContain('4.5'); // 4500 g → 4.5 KG (row cell + totals cell)
    expect(text).not.toContain('4500'); // raw grams are gone
    expect(text).not.toContain('4 KG'); // Pcs column is a bare count, unit stays in the header
  });

  it('counts BOX lines in the Box column with Pcs and Weight blanked', () => {
    const text = textOf(buildChallanPdf(input({
      itemRows: [
        { productName: 'Saree carton', quantity: 3, unitCode: 'BOX', grams: null },
        { productName: 'CORN - Jari CORN', quantity: 2, unitCode: 'PCS', grams: 500 },
      ],
    })));
    expect(text).toContain('Box'); // dedicated Box column header
    expect(text).toContain('3'); // box count printed (row + totals)
    expect(text).toContain('0.5'); // the PCS line still KG-converts (0.5 KG total)
  });

  it('prints only dashes for a challan that is entirely box-dispatched', () => {
    const text = textOf(buildChallanPdf(input({
      itemRows: [{ productName: 'Saree carton', quantity: 6, unitCode: 'BOX', grams: 4500 }],
    })));
    expect(text).toContain('6'); // box count in the Box column and totals
    // Even though a piece mapping produced grams upstream, a BOX line never
    // prints weight: no raw grams reach the page and no KG total prints.
    expect(text).not.toContain('4500');
  });

  it('prints a return challan title for returns', () => {
    const text = textOf(buildChallanPdf(input({ direction: 'return' })));
    expect(text).toContain('RETURN CHALLAN');
    expect(text).not.toContain('DELIVERY CHALLAN');
  });

  it('shows the customer address in the info box, business address nowhere', () => {
    const text = textOf(buildChallanPdf(input()));
    expect(text).toContain('Santlal'); // customer street address in the info box
    expect(text).not.toContain('401-405'); // business address is not printed
    expect(text).not.toContain('ORIGINAL FOR CONSIGNEE'); // copy wording removed from the header
    expect(text).not.toContain('Contact:'); // phone prints bare in the header
    expect(text).not.toContain('+91 98980 11223'); // customer mobile not printed
    expect(text).not.toContain('GSTIN'); // tax identifiers stay on the invoice
  });

  it('paginates long challans at 10 rows per page with correct markers', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      productName: `Item ${i + 1}`, quantity: 1, unitCode: 'PCS', grams: null,
    }));
    const doc = buildChallanPdf(input({ itemRows: rows }));
    expect(doc.getNumberOfPages()).toBe(3); // fixed 10-row body: 30 rows = 3 pages
    expect(textOf(doc)).toContain('Page 2 of');
  });

  it('builds an empty-items challan without throwing', () => {
    const doc = buildChallanPdf(input({ itemRows: [] }));
    expect(doc.getNumberOfPages()).toBe(1);
    expect(textOf(doc)).toContain('Page 1 of 1');
  });

  it('tolerates a Gujarati business name (canvas fallback in tests)', () => {
    // With a Gujarati name the header becomes a rasterised image in the real
    // app; jsdom has no canvas, so the English uppercase fallback stays and
    // the builder must not throw on the Gujarati string.
    const text = textOf(buildChallanPdf(input({
      business: { ...SEED_BUSINESS_SETTINGS, gujarati_name: 'શ્રી ગણેશ જરી' },
    })));
    expect(text).toContain('ABC INDUSTRIES PVT LTD');
    expect(text).toContain('DELIVERY CHALLAN');
  });
});
