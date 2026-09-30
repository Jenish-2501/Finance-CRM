import { getDb } from '../database.js';

/**
 * Base utility for repositories to reduce boilerplate while maintaining explicit types.
 * Domain repositories wrap these to provide typed methods.
 */
export function upsertRow(table: string, entity: Record<string, any>) {
  const db = getDb();

  const row: Record<string, any> = {};
  for (const [k, v] of Object.entries(entity)) {
    if (typeof v === 'object' && v !== null) {
      row[k] = JSON.stringify(v);
    } else {
      row[k] = v;
    }
  }

  const columns = Object.keys(row);
  for (const col of columns) {
    if (!/^[a-zA-Z0-9_]+$/.test(col)) {
      throw new Error("Invalid column name: " + col);
    }
  }
  const placeholders = columns.map(() => '?').join(', ');
  const values = Object.values(row);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO ${table} (${columns.join(', ')})
    VALUES (${placeholders})
  `);

  stmt.run(...values);
}

export function fetchAllRows(table: string) {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM ${table}`).all();

  return rows.map((row: any) => {
    const parsed: any = {};
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
        try {
          parsed[k] = JSON.parse(v);
        } catch {
          parsed[k] = v;
        }
      } else {
        parsed[k] = v;
      }
    }
    return parsed;
  });
}

export function deleteRow(table: string, id: string) {
  const db = getDb();
  const stmt = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
  stmt.run(id);
}
