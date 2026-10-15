import { describe, it, expect } from 'vitest';
import { buildChallanPdf, type ChallanPdfInput } from '../../src/utils/pdfDocuments';
import { SEED_BUSINESS_SETTINGS } from '../../src/data/seedData';
import type { Customer, CustomerInventoryMovement } from '../../src/types/database';

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
    copyLabel: 'ORIGINAL FOR CONSIGNEE (RECIPIENT)',
    challanDate: '12 Oct 2026',
    timeOfRemoval: '10:42 pm',
    itemRows: [
      { sNo: 1, productName: 'CORN - Jari CORN', sku: 'SKU-3009', quantity: 2, unitCode: 'PCS', weightQty: 500, weightUom: 'gram' },
      { sNo: 2, productName: 'The king of polyster', sku: 'SKU-5099', quantity: 5, unitCode: 'PCS' },
    ],
    totalQuantity: 7,
    totalWeightGrams: 500,
    ...partial,
  };
}

function textOf(doc: ReturnType<typeof buildChallanPdf>): string {
  const buf = doc.output('arraybuffer') as ArrayBuffer;
  return Buffer.from(buf).toString('latin1');
}

describe('challan PDF layout', () => {
  it('renders title, ref, items, weight column and footer', () => {
    const doc = buildChallanPdf(input());
    expect(doc.getNumberOfPages()).toBe(1);
    const text = textOf(doc);
    // Product names may wrap across lines in narrow columns — anchor on words.
    for (const needle of ['DELIVERY CHALLAN', 'CORN', 'Jari', 'polyster', 'SKU-3009', 'Weight', 'Page 1 of 1']) {
      expect(text).toContain(needle);
    }
  });

  it('footer shows only the page marker, never a bare ref number', () => {
    const text = textOf(buildChallanPdf(input()));
    expect(text).toContain('Page 1 of 1');
    expect(text).not.toContain('7  |  Page 1 of 1');
  });

  it('omits the contact line when the customer has no mobile', () => {
    const text = textOf(buildChallanPdf(input({ customer: { ...cust, mobile: '' } })));
    expect(text).not.toContain('Contact: -');
  });

  it('never duplicates a trailing city in addresses', () => {
    const text = textOf(buildChallanPdf(input()));
    expect(text).toContain('Ring Road, Surat');
    expect(text).not.toContain('surat Surat');
  });

  it('shows a dash for rows without weight', () => {
    const text = textOf(buildChallanPdf(input()));
    expect(text).toContain('500 gram');
  });

  it('paginates long challans with correct page markers', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      sNo: i + 1, productName: `Item ${i + 1}`, sku: `SKU-${i + 1}`, quantity: 1, unitCode: 'PCS',
    }));
    const doc = buildChallanPdf(input({ itemRows: rows, totalQuantity: 30, totalWeightGrams: 0 }));
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    expect(textOf(doc)).toContain('Page 2 of');
  });

  it('builds an empty-items challan without throwing', () => {
    const doc = buildChallanPdf(input({ itemRows: [], totalQuantity: 0, totalWeightGrams: 0 }));
    expect(doc.getNumberOfPages()).toBe(1);
    expect(textOf(doc)).toContain('Total Dispatched Quantity:');
  });

  it('shows business address and contact in the footer, not the header', () => {
    const text = textOf(buildChallanPdf(input()));
    expect(text).toContain('401-405, Apex Business Hub, Ring Road, Surat');
    expect(text).toContain('Contact: +91 98250 12345');
  });

  it('omits the footer contact line when the business has no phone', () => {
    const text = textOf(
      buildChallanPdf(input({
        business: { ...SEED_BUSINESS_SETTINGS, phone: '' },
        customer: { ...cust, mobile: '' },
      }))
    );
    expect(text).not.toContain('Contact:');
  });
});
