// Searchable customer number (short code shown in every picker).
// NEVER edit this file after release. Create a new 000N_*.ts instead.
//
// Existing rows predate the column, so: add it nullable-safe with an empty
// default, backfill deterministic unique codes from rowid (C-1001, ...),
// then enforce uniqueness for all future writes. The renderer also guards
// duplicates before insert; this index is the final backstop.
export const version = 5;
export const name = '0005_customer_number';

export const sql = `
ALTER TABLE customers ADD COLUMN customer_number TEXT NOT NULL DEFAULT '';
UPDATE customers SET customer_number = 'C-' || (1000 + rowid) WHERE customer_number = '';
CREATE UNIQUE INDEX IF NOT EXISTS customers_number_unique ON customers(customer_number);
`;
