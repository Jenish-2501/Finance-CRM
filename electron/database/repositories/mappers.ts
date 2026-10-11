import { getDrizzle } from '../client.js';
import { eq } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as schema from '../schema/index.js';

// Columns stored as JSON text in SQLite but as objects/arrays in the renderer.
const JSON_COLUMNS: Record<string, Set<string>> = {
  customers: new Set(['bank_details']),
  invoices: new Set(['customer_snapshot', 'business_snapshot', 'bank_snapshot']),
  audit_logs: new Set(['old_data', 'new_data', 'metadata']),
};

const SNAKE_TO_CAMEL_CACHE = new Map<string, string>();

function snakeToCamel(s: string): string {
  let out = SNAKE_TO_CAMEL_CACHE.get(s);
  if (!out) {
    out = s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    SNAKE_TO_CAMEL_CACHE.set(s, out);
  }
  return out;
}

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function parseJsonColumn(table: string, column: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;
  if (!JSON_COLUMNS[table]?.has(column)) return value;
  const t = value.trim();
  if (!(t.startsWith('{') || t.startsWith('[')) && t !== 'null') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** Renderer (snake_case, objects) -> Drizzle (camelCase, JSON strings). */
export function toDrizzleRow(entity: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entity)) {
    const camel = snakeToCamel(k);
    if (v !== null && typeof v === 'object') {
      out[camel] = JSON.stringify(v);
    } else if (typeof v === 'boolean' && (k === 'is_active' || k.startsWith('is_'))) {
      out[camel] = v; // drizzle boolean mode handles 0/1 mapping
    } else {
      out[camel] = v;
    }
  }
  return out;
}

/** Drizzle row -> renderer shape (snake_case, parsed JSON). */
export function fromDrizzleRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const snake = camelToSnake(k);
    out[snake] = parseJsonColumn(table, snake, v);
  }
  return out;
}

export type TableName = keyof typeof tableMap;

export const tableMap: Record<string, SQLiteTable> = {
  business_settings: schema.businessSettings,
  uoms: schema.uoms,
  customers: schema.customers,
  products: schema.products,
  product_units: schema.productUnits,
  product_prices: schema.productPrices,
  customer_product_prices: schema.customerProductPrices,
  customer_price_history: schema.customerPriceHistory,
  stock_receipts: schema.stockReceipts,
  stock_receipt_items: schema.stockReceiptItems,
  inventory_movements: schema.inventoryMovements,
  customer_inventory_movements: schema.customerInventoryMovements,
  dispatch_documents: schema.dispatchDocuments,
  invoices: schema.invoices,
  invoice_items: schema.invoiceItems,
  invoice_allocations: schema.invoiceAllocations,
  invoice_series: schema.invoiceSeries,
  invoice_payments: schema.invoicePayments,
  audit_logs: schema.auditLogs,
};

export function getTable(table: string): SQLiteTable {
  const t = tableMap[table];
  if (!t) throw new Error(`Unknown table: ${table}`);
  return t;
}

export function fetchAllRows(table: string): Record<string, unknown>[] {
  const db = getDrizzle();
  const t = getTable(table) as never;
  const rows = db.select().from(t as never).all() as Record<string, unknown>[];
  return rows.map((r) => fromDrizzleRow(table, r));
}

export function upsertRow(table: string, entity: Record<string, unknown>): void {
  const db = getDrizzle();
  const t = getTable(table) as never;
  const row = toDrizzleRow(entity) as Record<string, unknown>;
  // INSERT ... ON CONFLICT(id) DO UPDATE — atomic upsert, no prior SELECT.
  db.insert(t as never)
    .values(row as never)
    .onConflictDoUpdate({ target: (t as unknown as { id: unknown }).id as never, set: row as never })
    .run();
}

export function deleteRow(table: string, id: string): void {
  const db = getDrizzle();
  const t = getTable(table) as unknown as { id: unknown };
  db.delete(tableMap[table] as never)
    .where(eq(t.id as never, id as never))
    .run();
}
