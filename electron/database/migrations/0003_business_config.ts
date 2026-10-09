// Business configuration guardrails (M2).
// NEVER edit this file after release. Create a new 000N_*.ts instead.
//
// business_settings already carries every GST field the renderer needs
// (state_code, gst_number, invoice_prefix/next_number, default_gst_rate),
// so no column changes are required there. What was missing structurally:
//   1. uoms.code had no uniqueness — duplicate PCS/KG rows could be created,
//      breaking billing unit lookups.
//   2. Legacy databases may already hold duplicate or mixed-case codes, so
//      normalize + dedupe before creating the unique index (idempotent,
//      keeps the oldest row per code; product references point at uom IDs,
//      never codes, so this is relation-safe).
export const version = 3;
export const name = '0003_business_config';

export const sql = `
UPDATE uoms SET code = UPPER(TRIM(code)) WHERE code IS NOT NULL;
DELETE FROM uoms WHERE rowid NOT IN (SELECT MIN(rowid) FROM uoms GROUP BY UPPER(code));
CREATE UNIQUE INDEX IF NOT EXISTS uoms_code_unique ON uoms(code);
`;
