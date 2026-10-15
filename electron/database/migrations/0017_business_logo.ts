// Optional business logo (PNG/JPEG data URL) for PDF watermark branding.
// Nullable with no default: existing rows read back as NULL, no backfill.
// Stored in the database (not the filesystem) so periodic backups and
// restores carry the logo automatically.
// NEVER edit this file after release. Create a new 001N_*.ts instead.
export const version = 17;
export const name = '0017_business_logo';

export const sql = `
ALTER TABLE business_settings ADD COLUMN logo_data TEXT;
`;
