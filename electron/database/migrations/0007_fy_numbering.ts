// Financial-year invoice numbering (plain per-FY sequences, no prefix).
// NEVER edit this file after release. Create a new 000N_*.ts instead.
//
// business_settings gains invoice_start_number (first number of each FY series).
// invoices gains fy (the FY of its own invoice_date — backfilled below from the
// stored UTC date; all shipped rows are safely mid-month, far from the IST
// midnight boundary, so UTC-derived FY equals IST FY for them).
// invoice_series holds one counter row per FY, created on first use.
export const version = 7;
export const name = '0007_fy_numbering';

export const sql = `
ALTER TABLE business_settings ADD COLUMN invoice_start_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE invoices ADD COLUMN fy TEXT NOT NULL DEFAULT '';
UPDATE invoices SET fy = (
  CASE WHEN substr(invoice_date, 6, 2) >= '04'
  THEN substr(invoice_date, 1, 4) || '-' || substr(CAST(CAST(substr(invoice_date, 1, 4) AS INTEGER) + 1 AS TEXT), 3, 2)
  ELSE CAST(CAST(substr(invoice_date, 1, 4) AS INTEGER) - 1 AS TEXT) || '-' || substr(invoice_date, 3, 2)
  END
) WHERE fy = '';
CREATE TABLE IF NOT EXISTS invoice_series (
  id TEXT PRIMARY KEY,
  fy TEXT NOT NULL,
  next_number INTEGER NOT NULL,
  start_number INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_series_fy_unique ON invoice_series(fy);
`;
