// Admin-customized UI wording (Language route under Settings).
// One row per (locale, dictionary key); empty value = fall back to the
// bundled dictionary file. Rows are keyed `${locale}:${key}` so upserts are
// idempotent and the renderer can address them without querying.
// NEVER edit this file after release. Create a new 001N_*.ts instead.
export const version = 14;
export const name = '0014_language_overrides';

export const sql = `
CREATE TABLE IF NOT EXISTS language_overrides (
  id TEXT PRIMARY KEY,
  locale TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS language_overrides_locale_key_unique
  ON language_overrides(locale, key);
`;
