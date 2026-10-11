// Customer auto-number counter + invoice identity backstop.
// NEVER edit this file after release. Create a new 000N_*.ts instead.
//
// business_settings gains customer_next_number (floor for auto-assigned plain
// customer numbers; the live scan in suggestCustomerNumber keeps it honest
// against legacy/manual numbers, so no backfill is needed).
// invoices gains UNIQUE(fy, invoice_number): the same plain number may repeat
// across FYs but never twice within one. Seeds and all shipped fixtures are
// unique per FY, so this applies cleanly. Pre-check before updating a live DB:
//   SELECT fy, invoice_number, COUNT(*) c FROM invoices
//   GROUP BY fy, invoice_number HAVING c > 1;
// An empty result means zero upgrade risk (migrations are transactional — a
// violation would abort v8 with data untouched, never half-applied).
export const version = 8;
export const name = '0008_customer_counter_and_invoice_identity';

export const sql = `
ALTER TABLE business_settings ADD COLUMN customer_next_number INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_fy_number_unique ON invoices(fy, invoice_number);
`;
