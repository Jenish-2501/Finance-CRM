// M2 Business Setup & Configuration — the DB-authoritative API for company
// profile, GST configuration, invoice numbering, and units of measure.
//
// Why this exists instead of the generic upsert routes: every GST calculation
// (CGST+SGST vs IGST) reads business_settings.state_code/default_gst_rate,
// and every billing/inventory lookup dereferences uoms by ID. A malformed
// row (bad GSTIN, state_code/GSTIN mismatch, out-of-slab rate, duplicate UOM
// code, deactivated in-use UOM) silently corrupts downstream math. These
// helpers validate first and return envelopes ({ ok, error }) for user
// fixable problems — mirroring the passcode service — and only throw for
// unexpected storage failures (safeHandler maps those to AppDbError).
import { Repositories } from '../database/repositories/repositories.js';
import { SEED_BUSINESS_SETTINGS } from '../../src/data/seedData.js';
import { isRecord } from '../utils/validate.js';

export type SettingsRow = Record<string, unknown>;
export type UomRow = Record<string, unknown>;

export interface SettingsResult {
  ok: boolean;
  settings?: SettingsRow;
  error?: string;
  message?: string;
}

export interface UomResult {
  ok: boolean;
  uom?: UomRow;
  error?: string;
  message?: string;
}

export interface UomListResult {
  ok: boolean;
  uoms?: UomRow[];
}

// Notified GST slabs (total %): intra-state splits half/half CGST+SGST,
// inter-state applies the full rate as IGST.
export const GST_SLABS = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28];

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const STATE_CODE_RE = /^(0[1-9]|[12][0-9]|3[0-8])$/;
const UOM_CODE_RE = /^[A-Z0-9][A-Z0-9\-_]{0,9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SETTINGS_ID = 'biz-1';

// Renderer sends snake_case; only these keys are writable. id/created_at
// can never be changed through this API.
const WRITABLE_SETTINGS_FIELDS = new Set([
  'business_name',
  'legal_name',
  'gst_number',
  'pan',
  'address',
  'city',
  'state',
  'country',
  'postal_code',
  'phone',
  'email',
  'website',
  'bank_name',
  'bank_account_number',
  'ifsc',
  'branch',
  'invoice_prefix',
  'invoice_next_number',
  'invoice_start_number',
  'customer_next_number',
  'document_next_number',
  'currency',
  'default_gst_rate',
  'state_code',
  'logo_data',
]);

// PNG/JPEG data URL cap (~1 MB image). Bigger files are rejected at the
// Settings upload step; this is the backstop so one bad write cannot bloat
// the database (backups copy the whole file).
const MAX_LOGO_DATA_URL_LENGTH = 1500000;
const LOGO_DATA_URL_RE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;

function fail(error: string, message: string): SettingsResult {
  return { ok: false, error, message };
}

function nonEmpty(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max;
}

/** Full-row validation of the MERGED settings (current + patch). */
function validateSettingsRow(row: SettingsRow): SettingsResult | null {
  const req: Array<[string, number, string, string]> = [
    ['business_name', 200, 'REQUIRED_FIELD', 'Trade business name is required.'],
    ['legal_name', 300, 'REQUIRED_FIELD', 'Full legal corporate name is required.'],
    ['address', 500, 'REQUIRED_FIELD', 'Registered street address is required.'],
    ['city', 120, 'REQUIRED_FIELD', 'City is required.'],
    ['state', 120, 'REQUIRED_FIELD', 'State is required.'],
    ['country', 120, 'REQUIRED_FIELD', 'Country is required.'],
    ['postal_code', 20, 'REQUIRED_FIELD', 'Postal code is required.'],
    ['phone', 40, 'REQUIRED_FIELD', 'Phone is required.'],
    ['bank_name', 200, 'REQUIRED_FIELD', 'Bank name is required.'],
    ['bank_account_number', 60, 'REQUIRED_FIELD', 'Bank account number is required.'],
    ['ifsc', 20, 'REQUIRED_FIELD', 'IFSC code is required.'],
    ['branch', 200, 'REQUIRED_FIELD', 'Branch name is required.'],
    ['currency', 10, 'REQUIRED_FIELD', 'Currency is required.'],
  ];
  for (const [field, max, error, message] of req) {
    if (!nonEmpty(row[field], max)) return fail(error, message);
  }
  if (typeof row.email !== 'string' || !EMAIL_RE.test(row.email.trim()) || row.email.length > 200) {
    return fail('INVALID_EMAIL', 'Accounts email is not a valid email address.');
  }
  if (typeof row.gst_number !== 'string' || !GSTIN_RE.test(row.gst_number.trim().toUpperCase())) {
    return fail(
      'INVALID_GSTIN',
      'GSTIN must be 15 characters: 2-digit state code + 10-char PAN + entity code + Z + checksum (e.g. 24AAACA9999P1Z1).'
    );
  }
  if (typeof row.pan !== 'string' || !PAN_RE.test(row.pan.trim().toUpperCase())) {
    return fail('INVALID_PAN', 'Company PAN must match AAAAA9999A format (e.g. AAACA9999P).');
  }
  if (typeof row.state_code !== 'string' || !STATE_CODE_RE.test(row.state_code.trim())) {
    return fail('INVALID_STATE_CODE', 'Home state code must be a 2-digit GST state code (01-38).');
  }
  // GSTIN embeds the home state in its first two digits — a mismatch silently
  // flips every invoice between CGST+SGST and IGST.
  const gstState = String(row.gst_number).trim().toUpperCase().slice(0, 2);
  if (gstState !== String(row.state_code).trim()) {
    return fail(
      'GSTIN_STATE_MISMATCH',
      `GSTIN starts with state ${gstState} but home state code is ${String(row.state_code).trim()}. They must match.`
    );
  }
  if (typeof row.invoice_prefix !== 'string' || row.invoice_prefix.length === 0 || row.invoice_prefix.length > 24) {
    return fail('INVALID_PREFIX', 'Invoice prefix is required (max 24 characters).');
  }
  if (
    typeof row.invoice_next_number !== 'number' ||
    !Number.isInteger(row.invoice_next_number) ||
    row.invoice_next_number < 1 ||
    row.invoice_next_number > 999999999
  ) {
    return fail('INVALID_NEXT_NUMBER', 'Next sequence number must be a whole number of 1 or more.');
  }
  if (
    typeof row.invoice_start_number !== 'number' ||
    !Number.isInteger(row.invoice_start_number) ||
    row.invoice_start_number < 1 ||
    row.invoice_start_number > 999999999
  ) {
    return fail('INVALID_START_NUMBER', 'FY start number must be a whole number of 1 or more.');
  }
  if (
    typeof row.customer_next_number !== 'number' ||
    !Number.isInteger(row.customer_next_number) ||
    row.customer_next_number < 1 ||
    row.customer_next_number > 999999999
  ) {
    return fail('INVALID_CUSTOMER_NEXT_NUMBER', 'Customer next number must be a whole number of 1 or more.');
  }
  if (
    typeof row.document_next_number !== 'number' ||
    !Number.isInteger(row.document_next_number) ||
    row.document_next_number < 1 ||
    row.document_next_number > 999999999
  ) {
    return fail('INVALID_DOCUMENT_NEXT_NUMBER', 'Document next number must be a whole number of 1 or more.');
  }
  if (typeof row.default_gst_rate !== 'number' || !GST_SLABS.includes(row.default_gst_rate)) {
    return fail(
      'INVALID_GST_RATE',
      `Standard GST rate must be a notified slab: ${GST_SLABS.join(', ')}.`
    );
  }
  // Optional logo: empty/null clears it; otherwise a PNG/JPEG data URL.
  const logo = row.logo_data;
  if (logo !== undefined && logo !== null && logo !== '') {
    if (
      typeof logo !== 'string' ||
      logo.length > MAX_LOGO_DATA_URL_LENGTH ||
      !LOGO_DATA_URL_RE.test(logo)
    ) {
      return fail('INVALID_LOGO', 'Business logo must be a PNG or JPEG image under 1 MB.');
    }
  }
  return null;
}

function currentSettingsRow(): SettingsRow {
  const rows = Repositories.businessSettings.findAll() as SettingsRow[];
  if (rows.length > 0 && rows[0]) return rows[0];
  // Self-heal: seed row deleted out-of-band (never via this API).
  Repositories.businessSettings.upsert({ ...(SEED_BUSINESS_SETTINGS as unknown as SettingsRow) });
  return { ...(SEED_BUSINESS_SETTINGS as unknown as SettingsRow) };
}

export function getBusinessSettings(): SettingsRow {
  return currentSettingsRow();
}

export function updateBusinessSettings(input: unknown): SettingsResult {
  if (!isRecord(input)) return fail('INVALID_INPUT', 'Settings must be provided as an object.');
  const current = currentSettingsRow();
  const merged: SettingsRow = { ...current };
  for (const [k, v] of Object.entries(input)) {
    if (WRITABLE_SETTINGS_FIELDS.has(k)) merged[k] = v;
  }
  // Normalize case-insensitive identifiers before validation.
  for (const k of ['gst_number', 'pan', 'ifsc'] as const) {
    if (typeof merged[k] === 'string') merged[k] = (merged[k] as string).trim().toUpperCase();
  }
  for (const k of ['state_code'] as const) {
    if (typeof merged[k] === 'string') merged[k] = (merged[k] as string).trim();
  }
  if (typeof merged.email === 'string') merged.email = (merged.email as string).trim();
  const invalid = validateSettingsRow(merged);
  if (invalid) return invalid;
  merged.id = (current.id as string) ?? SETTINGS_ID;
  merged.created_at = current.created_at;
  merged.updated_at = new Date().toISOString();
  Repositories.businessSettings.upsert(merged);
  return { ok: true, settings: merged };
}

// ---- Units of measure ----

function uomFail(error: string, message: string): UomResult {
  return { ok: false, error, message };
}

function allUoms(): UomRow[] {
  return Repositories.uoms.findAll() as UomRow[];
}

/** Tables whose *_unit_id / primary_unit_id reference uoms(id). */
const UOM_REFERENCES: Array<{ table: string; column: string }> = [
  { table: 'products', column: 'primary_unit_id' },
  { table: 'product_units', column: 'unit_id' },
  { table: 'product_prices', column: 'unit_id' },
  { table: 'stock_receipt_items', column: 'unit_id' },
  { table: 'inventory_movements', column: 'unit_id' },
  { table: 'customer_inventory_movements', column: 'unit_id' },
  { table: 'invoice_items', column: 'unit_id' },
];

function isUomReferenced(id: string): boolean {
  for (const { table, column } of UOM_REFERENCES) {
    try {
      const rows = Repositories[table as keyof typeof Repositories]?.findAll() as
        | Array<Record<string, unknown>>
        | undefined;
      if (rows?.some((r) => r[column] === id)) return true;
    } catch {
      // Table unreadable here — fail open on this table only; the unique
      // index + validation still protect integrity.
    }
  }
  return false;
}

export function listUoms(): UomRow[] {
  return allUoms().sort((a, b) => String(a.code ?? '').localeCompare(String(b.code ?? '')));
}

export function createUom(input: unknown): UomResult {
  if (!isRecord(input)) return uomFail('INVALID_INPUT', 'Unit details must be provided as an object.');
  const code = typeof input.code === 'string' ? input.code.trim().toUpperCase() : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (!UOM_CODE_RE.test(code)) {
    return uomFail(
      'INVALID_UOM_CODE',
      'Unit code must be 1-10 characters: letters, digits, dash or underscore (e.g. PCS, BOX, LITRE).'
    );
  }
  if (name.length === 0 || name.length > 120) {
    return uomFail('INVALID_UOM_NAME', 'Unit name is required (max 120 characters).');
  }
  if (description.length > 500) {
    return uomFail('INVALID_UOM_DESCRIPTION', 'Unit description must be 500 characters or fewer.');
  }
  if (allUoms().some((u) => String(u.code ?? '').toUpperCase() === code)) {
    return uomFail('UOM_CODE_EXISTS', `Unit code ${code} already exists.`);
  }
  const now = new Date().toISOString();
  let id = `uom-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const taken = new Set(allUoms().map((u) => String(u.id)));
  if (taken.has(id)) {
    let n = 2;
    while (taken.has(`${id}-${n}`)) n += 1;
    id = `${id}-${n}`;
  }
  const row: UomRow = {
    id,
    code,
    name,
    description,
    is_active: true,
    created_at: now,
    updated_at: now,
  };
  try {
    Repositories.uoms.upsert(row);
  } catch {
    return uomFail('UOM_CODE_EXISTS', `Unit code ${code} already exists.`);
  }
  return { ok: true, uom: row };
}

export function setUomActive(id: unknown, isActive: unknown): UomResult {
  if (typeof id !== 'string' || id.length === 0) return uomFail('UOM_NOT_FOUND', 'Unit was not found.');
  if (typeof isActive !== 'boolean') return uomFail('INVALID_INPUT', 'Active flag must be true or false.');
  const row = allUoms().find((u) => u.id === id);
  if (!row) return uomFail('UOM_NOT_FOUND', 'Unit was not found.');
  if (!isActive) {
    if (isUomReferenced(id)) {
      return uomFail(
        'UOM_REFERENCED',
        `Unit ${String(row.code)} is used by products, stock or invoices and cannot be deactivated.`
      );
    }
    const activeOthers = allUoms().filter((u) => u.id !== id && u.is_active === true);
    if (activeOthers.length === 0) {
      return uomFail('UOM_LAST_ACTIVE', 'At least one unit of measure must stay active.');
    }
  }
  const updated: UomRow = { ...row, is_active: isActive, updated_at: new Date().toISOString() };
  Repositories.uoms.upsert(updated);
  return { ok: true, uom: updated };
}
