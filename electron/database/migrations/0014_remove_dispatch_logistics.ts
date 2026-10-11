// Remove dispatch logistics capture: vehicle / transporter / e-way bill /
// purpose / site-instruction notes are no longer recorded on customer
// inventory movements. NEVER edit this file after release. Create a new
// 000N_*.ts instead.
//
// Plain nullable TEXT columns with no indexes or foreign keys pointing at
// them, so DROP COLUMN is safe and preserves every other column byte-for-byte.
// notes on OTHER tables (stock_receipts, inventory_movements, invoices,
// invoice_payments) is untouched — only customer_inventory_movements loses it.
export const version = 14;
export const name = '0014_remove_dispatch_logistics';

export const sql = `
ALTER TABLE customer_inventory_movements DROP COLUMN vehicle_number;
ALTER TABLE customer_inventory_movements DROP COLUMN transporter_name;
ALTER TABLE customer_inventory_movements DROP COLUMN eway_bill_number;
ALTER TABLE customer_inventory_movements DROP COLUMN dispatch_purpose;
ALTER TABLE customer_inventory_movements DROP COLUMN notes;
`;
