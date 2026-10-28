// Optional Gujarati display name per product, mirroring v16 (customer
// gujarati_name). Master-data convenience only — legal documents (invoices,
// challans, ledgers) keep using the English product_name snapshot, exactly
// as before.
// Nullable with no default: existing rows read back as NULL, no backfill.
// NEVER edit this file after release. Create a new 001N_*.ts instead.
export const version = 18;
export const name = '0018_product_gujarati_name';

export const sql = `
ALTER TABLE products ADD COLUMN gujarati_name TEXT;
`;
