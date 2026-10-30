// Return valuation + credit consumption tracking on customer inventory
// movements. RETURN rows may now carry the unit rate at which the goods are
// taken back (rate × quantity = the customer's return credit); the running
// credit_applied_amount records how much of that credit has already been
// applied to invoices (manual apply, oldest returns first).
// Nullable / defaulted: existing rows read back as NULL / 0, no backfill.
// NEVER edit this file after release. Create a new 001N_*.ts instead.
export const version = 20;
export const name = '0020_return_rate_credit';

export const sql = `
ALTER TABLE customer_inventory_movements ADD COLUMN rate REAL;
ALTER TABLE customer_inventory_movements ADD COLUMN credit_applied_amount REAL NOT NULL DEFAULT 0;
`;
