import { getSqlite, getDatabaseFilePath } from '../database/index.js';

// Live introspection of the on-disk SQLite file. No SQL comes from the
// renderer — table names are allow-listed from sqlite_master and identifiers
// are quoted by us. Never exposes row data, only structure + row counts.
export interface SchemaColumn {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: boolean;
  defaultValue: string | null;
}

export interface SchemaTable {
  name: string;
  rowCount: number;
  columns: SchemaColumn[];
}

export interface DatabaseStructure {
  dbFile: string | null;
  sqliteVersion: string;
  tables: SchemaTable[];
}

function isSafeTableName(name: unknown): name is string {
  return typeof name === 'string' && /^[a-z_][a-z0-9_]*$/i.test(name) && name.length <= 64;
}

export function getDatabaseStructure(): DatabaseStructure {
  const sqlite = getSqlite();
  const versionRow = sqlite.prepare('SELECT sqlite_version() AS v').get() as { v: string };
  const masterRows = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_%' ORDER BY name"
    )
    .all() as Array<{ name: string }>;

  const tables: SchemaTable[] = [];
  for (const row of masterRows) {
    if (!isSafeTableName(row.name)) continue;
    const table = `"${row.name.replace(/"/g, '""')}"`;
    let columns: SchemaColumn[] = [];
    let rowCount = 0;
    try {
      const info = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
        dflt_value: string | null;
      }>;
      columns = info.map((c) => ({
        name: String(c.name),
        type: String(c.type || 'TEXT'),
        notNull: Number(c.notnull) === 1,
        primaryKey: Number(c.pk) > 0,
        defaultValue: c.dflt_value ?? null,
      }));
    } catch {
      columns = [];
    }
    try {
      const countRow = sqlite.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
      rowCount = Number(countRow?.c ?? 0);
    } catch {
      rowCount = 0;
    }
    tables.push({ name: row.name, rowCount, columns });
  }

  return {
    dbFile: getDatabaseFilePath(),
    sqliteVersion: versionRow?.v ?? 'unknown',
    tables,
  };
}
