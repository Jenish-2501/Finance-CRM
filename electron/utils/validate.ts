// Lightweight runtime validation for IPC inputs.
// TypeScript types vanish at runtime, so every boundary value is checked here.
// No external validation dependency: the shapes are small and domain-specific
// (a full schema library like Zod is not justified for this surface).

export function isTextId(value: unknown, maxLen = 128): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLen &&
    /^[A-Za-z0-9][A-Za-z0-9\-_:.]*$/.test(value)
  );
}

export function isNonEmptyString(value: unknown, maxLen = 500): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLen;
}

export function isOptionalString(value: unknown, maxLen = 2000): value is string | undefined | null {
  return value === undefined || value === null || (typeof value === 'string' && value.length <= maxLen);
}

export function isIsoDateString(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 40) return false;
  const t = Date.parse(value);
  return !Number.isNaN(t);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isBooleanLike(value: unknown): value is boolean | number {
  return typeof value === 'boolean' || value === 0 || value === 1;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/** Generic row for upsert paths: must be an object with a valid string id. */
export function assertRowWithId(row: unknown, entityName: string): asserts row is Record<string, unknown> {
  if (!isRecord(row)) throw new Error(`VALIDATION_FAILED:${entityName} must be an object`);
  if (!isTextId(row.id)) throw new Error(`VALIDATION_FAILED:${entityName}.id is invalid`);
}

/** Persist-diff payload: { storeKey: row[] } with allow-listed keys. */
const ALLOWED_STORE_KEYS = new Set([
  'businessSettings',
  'uoms',
  'customers',
  'products',
  'productUnits',
  'productPrices',
  'customerPrices',
  'customerPriceHistory',
  'stockReceipts',
  'stockReceiptItems',
  'inventoryMovements',
  'customerInventoryMovements',
  'dispatchDocuments',
  'invoices',
  'invoiceItems',
  'invoiceAllocations',
  'invoiceSeries',
  'invoicePayments',
  'auditLogs',
]);

export function assertPersistPayload(payload: unknown): asserts payload is Record<string, unknown[]> {
  if (!isRecord(payload)) throw new Error('VALIDATION_FAILED:payload must be an object');
  const keys = Object.keys(payload);
  if (keys.length === 0 || keys.length > 19) throw new Error('VALIDATION_FAILED:payload shape invalid');
  for (const k of keys) {
    if (!ALLOWED_STORE_KEYS.has(k)) throw new Error(`VALIDATION_FAILED:unknown entity ${k}`);
    const arr = (payload as Record<string, unknown>)[k];
    if (!Array.isArray(arr) || arr.length > 2000) {
      throw new Error(`VALIDATION_FAILED:${k} must be an array (max 2000)`);
    }
    for (const row of arr) assertRowWithId(row, k);
  }
}

export function assertEntityType(entityType: unknown): asserts entityType is string {
  if (typeof entityType !== 'string' || !ALLOWED_STORE_KEYS.has(entityType)) {
    throw new Error('VALIDATION_FAILED:unknown entity type');
  }
}
