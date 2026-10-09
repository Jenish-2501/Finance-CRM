// Single-owner app (no RBAC): drop the legacy users table.
// NEVER edit this file after release. Create a new 000N_*.ts instead.
//
// Existing installations carry a users table (usr-1 admin row) from v1.
// Fresh installs create it in 0001 then drop it here — wasteful but keeps
// the "never edit applied migrations" rule intact. audit_logs and
// inventory created_by columns are untouched: they now carry the fixed
// 'owner' identity as plain text, with no foreign key to enforce.
export const version = 4;
export const name = '0004_single_owner';

export const sql = `
DROP TABLE IF EXISTS users;
`;
