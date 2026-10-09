// Migration 0002 — app lock credentials table (DDL only).
// The default passcode is seeded lazily by authService.ensureDefaultCredentials(),
// NOT here, so migrations stay pure DDL and re-runnable.
// NEVER edit this file after release. Create a new 000N_*.ts instead.
export const version = 2;
export const name = '0002_auth';

export const sql = `
CREATE TABLE IF NOT EXISTS auth_settings (
  id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;
