// Optional Gujarati display name (nickname) per customer. Master-data
// convenience only — legal documents (invoices, challans, ledgers) keep using
// the English customer_name snapshot, exactly as before.
// Nullable with no default: existing rows read back as NULL, no backfill.
// NEVER edit this file after release. Create a new 001N_*.ts instead.
export const version = 16;
export const name = '0016_customer_gujarati_name';

export const sql = `
ALTER TABLE customers ADD COLUMN gujarati_name TEXT;
`;
