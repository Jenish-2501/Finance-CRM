// Optional Gujarati business name, mirroring v16/v18 (customer/product
// gujarati_name). Used as the delivery-challan PDF header title (the booklet
// shows the business name in Gujarati); the English name stays on invoices
// and everywhere else.
// Nullable with no default: existing rows read back as NULL, no backfill.
// NEVER edit this file after release. Create a new 001N_*.ts instead.
export const version = 19;
export const name = '0019_business_gujarati_name';

export const sql = `
ALTER TABLE business_settings ADD COLUMN gujarati_name TEXT;
`;
