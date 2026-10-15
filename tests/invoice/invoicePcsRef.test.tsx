// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { InvoicePrintView } from '../../src/components/invoice/InvoicePrintView';
import { LanguageProvider } from '../../src/i18n';

import type { useAccountingStore as useAccountingStoreType } from '../../src/store/accountingStore';

(globalThis as unknown as { window: unknown }).window ??= {};

let api: typeof useAccountingStoreType | undefined;
async function loadStore() {
  if (!api) api = (await import('../../src/store/accountingStore')).useAccountingStore;
  return api;
}

afterEach(() => cleanup());

const now = () => new Date().toISOString();

// Invoice lines in KG or GRAM backed by PCS allocations carry the "(≈ N PCS)"
// reference inside the Qty column — no new column. Weight-only allocations
// must never wear the PCS label.
describe('invoice PCS reference in qty column', () => {
  it('shows PCS under KG and GRAM lines backed by PCS allocations', async () => {
    const store = (await loadStore()).getState();
    const prod = store.createProduct(
      { product_name: 'Washer 250g', sku: 'W-250', description: '', primary_unit_id: 'uom-gram', is_active: true }, 0
    );
    expect(store.savePieceWeightMapping(prod.id, 250).success).toBe(true);
    const mapping = store.getPieceWeightMapping(prod.id)!;
    store.createProductPrice({
      product_id: prod.id, unit_id: mapping.kgUnitId, price: 120,
      effective_from: new Date('2026-01-01T00:00:00Z').toISOString(), effective_to: null,
    });
    const cust = store.createCustomer({
      customer_name: 'B', customer_number: 'C-9001', pan: '', gst_number: '', mobile: '',
      address: '', city: 'Surat', state: 'Gujarat', country: 'India', postal_code: '',
      credit_limit: 0, is_active: true,
    });
    const custId = cust.customer!.id;
    store.createStockReceipt(
      { supplierName: 'M', referenceNumber: 'P', receiptDate: now(), notes: '' },
      [{ productId: prod.id, unitId: mapping.pcsUnitId, quantity: 20, unitCost: 25 }]
    );
    store.dispatchBatchInventoryToCustomer({
      customerId: custId, referenceId: 'CH-PCS-1',
      items: [{ productId: prod.id, unitId: mapping.pcsUnitId, quantity: 4 }],
    });
    const s = (await loadStore()).getState();
    const mov = Object.values(s.customerInventoryMovements).find((m) => m.reference_id === 'CH-PCS-1')!;
    const inv = s.createInvoice({
      customerId: custId, billingPeriodStart: '2026-01-01', billingPeriodEnd: '2026-01-31',
      items: [{
        productId: prod.id, unitId: mapping.kgUnitId, quantity: 1, unitPrice: 120, discount: 0,
        movementAllocations: [{ movementId: mov.id, allocatedQuantity: 4 }],
      }],
      otherCharges: 0, notes: '', status: 'DRAFT', invoiceDate: now(),
    });
    expect(inv.success).toBe(true);
    const s2 = (await loadStore()).getState();
    render(
      <LanguageProvider>
        <InvoicePrintView
          invoice={s2.invoices[inv.invoiceId!]}
          items={Object.values(s2.invoiceItems).filter((i) => i.invoice_id === inv.invoiceId)}
          payments={[]}
          allocations={Object.values(s2.invoiceAllocations).filter((a) => a.invoice_id === inv.invoiceId)}
        />
      </LanguageProvider>
    );
    expect(screen.getByText('(≈ 4 PCS)')).toBeDefined();
  });

  it('never labels gram allocations as PCS', async () => {
    const store = (await loadStore()).getState();
    // Legacy flow: dispatched in GRAM while unmapped, mapped only at billing.
    const prod = store.createProduct(
      { product_name: 'Plain Powder', sku: 'POW-1', description: '', primary_unit_id: 'uom-gram', is_active: true }, 5
    );
    const cust = store.createCustomer({
      customer_name: 'C2', customer_number: 'C-9002', pan: '', gst_number: '', mobile: '',
      address: '', city: 'Surat', state: 'Gujarat', country: 'India', postal_code: '',
      credit_limit: 0, is_active: true,
    });
    const custId = cust.customer!.id;
    store.createStockReceipt(
      { supplierName: 'M', referenceNumber: 'P2', receiptDate: now(), notes: '' },
      [{ productId: prod.id, unitId: 'uom-gram', quantity: 5000, unitCost: 2 }]
    );
    store.dispatchBatchInventoryToCustomer({
      customerId: custId, referenceId: 'CH-GRM-1',
      items: [{ productId: prod.id, unitId: 'uom-gram', quantity: 1000 }],
    });
    const s = (await loadStore()).getState();
    const mov = Object.values(s.customerInventoryMovements).find((m) => m.reference_id === 'CH-GRM-1')!;
    const inv = s.createInvoice({
      customerId: custId, billingPeriodStart: '2026-01-01', billingPeriodEnd: '2026-01-31',
      items: [{
        productId: prod.id, unitId: 'uom-gram', quantity: 1000, unitPrice: 5, discount: 0,
        movementAllocations: [{ movementId: mov.id, allocatedQuantity: 1000 }],
      }],
      otherCharges: 0, notes: '', status: 'DRAFT', invoiceDate: now(),
    });
    expect(inv.success).toBe(true);
    const s2 = (await loadStore()).getState();
    render(
      <LanguageProvider>
        <InvoicePrintView
          invoice={s2.invoices[inv.invoiceId!]}
          items={Object.values(s2.invoiceItems).filter((i) => i.invoice_id === inv.invoiceId)}
          payments={[]}
          allocations={Object.values(s2.invoiceAllocations).filter((a) => a.invoice_id === inv.invoiceId)}
        />
      </LanguageProvider>
    );
    expect(screen.queryByText(/≈.*PCS/)).toBeNull();
  });

  it('never labels gram allocations behind a KG line as PCS', async () => {
    const store = (await loadStore()).getState();
    // Mapped product, but this dispatch went in GRAM (legacy/manual entry).
    const prod = store.createProduct(
      { product_name: 'Washer 250g', sku: 'W-250-B', description: '', primary_unit_id: 'uom-gram', is_active: true }, 0
    );
    expect(store.savePieceWeightMapping(prod.id, 250).success).toBe(true);
    const mapping = store.getPieceWeightMapping(prod.id)!;
    store.createProductPrice({
      product_id: prod.id, unit_id: mapping.kgUnitId, price: 120,
      effective_from: new Date('2026-01-01T00:00:00Z').toISOString(), effective_to: null,
    });
    const cust = store.createCustomer({
      customer_name: 'C3', customer_number: 'C-9003', pan: '', gst_number: '', mobile: '',
      address: '', city: 'Surat', state: 'Gujarat', country: 'India', postal_code: '',
      credit_limit: 0, is_active: true,
    });
    const custId = cust.customer!.id;
    store.createStockReceipt(
      { supplierName: 'M', referenceNumber: 'P3', receiptDate: now(), notes: '' },
      [{ productId: prod.id, unitId: 'uom-gram', quantity: 5000, unitCost: 20 }]
    );
    store.dispatchBatchInventoryToCustomer({
      customerId: custId, referenceId: 'CH-GRMKG-1',
      items: [{ productId: prod.id, unitId: 'uom-gram', quantity: 500 }],
    });
    const s = (await loadStore()).getState();
    const mov = Object.values(s.customerInventoryMovements).find((m) => m.reference_id === 'CH-GRMKG-1')!;
    const inv = s.createInvoice({
      customerId: custId, billingPeriodStart: '2026-01-01', billingPeriodEnd: '2026-01-31',
      items: [{
        productId: prod.id, unitId: mapping.kgUnitId, quantity: 0.5, unitPrice: 120, discount: 0,
        movementAllocations: [{ movementId: mov.id, allocatedQuantity: 500 }],
      }],
      otherCharges: 0, notes: '', status: 'DRAFT', invoiceDate: now(),
    });
    expect(inv.success).toBe(true);
    const s2 = (await loadStore()).getState();
    render(
      <LanguageProvider>
        <InvoicePrintView
          invoice={s2.invoices[inv.invoiceId!]}
          items={Object.values(s2.invoiceItems).filter((i) => i.invoice_id === inv.invoiceId)}
          payments={[]}
          allocations={Object.values(s2.invoiceAllocations).filter((a) => a.invoice_id === inv.invoiceId)}
        />
      </LanguageProvider>
    );
    // 500 gram behind a KG line must not print as "(≈ 500 PCS)".
    expect(screen.queryByText(/≈/)).toBeNull();
  });
});
