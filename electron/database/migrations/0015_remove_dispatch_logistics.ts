// Remove dispatch logistics capture: vehicle / transporter / e-way bill /
// purpose / site-instruction notes are no longer recorded on customer
// inventory movements.
//
// This file was released as 0014_remove_dispatch_logistics and later renumbered
// to 0015 to make room for 0014_language_overrides — the SQL below is byte
// identical to the released 0014. That renumber has one sharp edge: databases
// that already applied the released 0014 no longer HAVE these columns, so a
// plain re-run of the DROP COLUMNs throws "no such column" and aborts startup
// (app.database_init_failed). There is no DROP COLUMN IF EXISTS in SQLite, so
// this migration ships a conditional migrate() step (preferred by the runner
// over exec(sql)): it drops only the columns that still exist, and it also
// creates language_overrides for databases that skipped the new 0014.
// Fresh installs converge to the exact same schema either way.
// This file is still unreleased as v15, so adapting it now is safe — after
// release, create a new 001N_*.ts instead of editing it.
//
// Plain nullable TEXT columns with no indexes or foreign keys pointing at
// them, so DROP COLUMN is safe and preserves every other column byte-for-byte.
// notes on OTHER tables (stock_receipts, inventory_movements, invoices,
// invoice_payments) is untouched — only customer_inventory_movements loses it.
import type Database from 'better-sqlite3';

export const version = 15;
export const name = '0015_remove_dispatch_logistics';

export const sql = `
ALTER TABLE customer_inventory_movements DROP COLUMN vehicle_number;
ALTER TABLE customer_inventory_movements DROP COLUMN transporter_name;
ALTER TABLE customer_inventory_movements DROP COLUMN eway_bill_number;
ALTER TABLE customer_inventory_movements DROP COLUMN dispatch_purpose;
ALTER TABLE customer_inventory_movements DROP COLUMN notes;
`;

const LOGISTICS_COLUMNS = [
  'vehicle_number',
  'transporter_name',
  'eway_bill_number',
  'dispatch_purpose',
  'notes',
];

/** Schema-adaptive runner: drops only columns that still exist. */
export function migrate(db: Database.Database): void {
  // Databases coming from the released chain skipped the new v14, so ensure
  // its table here (idempotent — a no-op where v14 already ran).
  db.exec(`
    CREATE TABLE IF NOT EXISTS language_overrides (
      id TEXT PRIMARY KEY,
      locale TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS language_overrides_locale_key_unique
      ON language_overrides(locale, key);
  `);
  const live = new Set(
    (
      db.prepare('PRAGMA table_info(customer_inventory_movements)').all() as Array<{ name: string }>
    ).map((c) => c.name)
  );
  for (const col of LOGISTICS_COLUMNS) {
    if (live.has(col)) {
      db.exec(`ALTER TABLE customer_inventory_movements DROP COLUMN ${col}`);
    }
  }
}
