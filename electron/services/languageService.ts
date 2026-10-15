// Admin-customized UI wording (Language route under Settings).
//
// Storage: `language_overrides` table (see migration 0014). One row per
// (locale, dictionary key), id = `${locale}:${key}`. An empty value means
// "fall back to the bundled dictionary file" — rows are never deleted, reset
// is a save with an empty string. The renderer merges these OVER the bundled
// gu.ts at boot (see src/i18n/LanguageProvider.tsx).
//
// Only the 'gu' locale is writable today — English is the source language and
// must stay exactly as bundled. Validation mirrors businessService: user
// fixable problems return envelopes ({ ok, error, message }); only unexpected
// storage failures throw (safeHandler maps those to AppDbError).
import { getSqlite } from '../database/index.js';
import { isRecord } from '../utils/validate.js';

export interface LanguageOverrideEntry {
  locale: string;
  key: string;
  value: string;
}

export interface LanguageListResult {
  ok: boolean;
  overrides?: Record<string, string>;
}

export interface LanguageSaveResult {
  ok: boolean;
  saved?: number;
  error?: string;
  message?: string;
}

const WRITABLE_LOCALE = 'gu';
// Dictionary keys are dot paths like "nav.dashboard" / "billing.thPrice".
// Keep the charset tight so a crafted key can never become SQL or a path.
const KEY_RE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const MAX_KEY_LEN = 128;
const MAX_VALUE_LEN = 2000;
const MAX_BATCH = 2000;

function fail(error: string, message: string): LanguageSaveResult {
  return { ok: false, error, message };
}

function ensureTable(): void {
  // Belt-and-braces for DBs created before migration 0014 was registered
  // (e.g. a dev.sqlite snapshotted mid-upgrade): the migration itself uses
  // CREATE TABLE IF NOT EXISTS, so re-running the DDL here is idempotent and
  // never touches live rows.
  getSqlite().exec(`
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
}

/** All stored Gujarati customizations as { "nav.dashboard": "..." }. */
export function listLanguageOverrides(): Record<string, string> {
  ensureTable();
  // Empty values mean "fall back to bundled" (reset rows) — never surface them.
  const rows = getSqlite()
    .prepare("SELECT key, value FROM language_overrides WHERE locale = ? AND TRIM(value) != ''")
    .all(WRITABLE_LOCALE) as Array<{ key: string; value: string }>;
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (typeof r.key === 'string' && typeof r.value === 'string') out[r.key] = r.value;
  }
  return out;
}

/**
 * Upsert a batch of Gujarati wordings. Accepts either a plain map
 * ({ "nav.dashboard": "..." }) or { overrides: [...] }. Empty/whitespace-only
 * values reset that key to the bundled wording (stored as '' per the table
 * contract, never deleted). Unknown keys are rejected — the renderer only
 * sends keys flattened from the bundled en.ts dictionary.
 */
export function saveLanguageOverrides(input: unknown): LanguageSaveResult {
  let entries: Array<{ key: unknown; value: unknown }> | null = null;
  if (isRecord(input) && Array.isArray((input as { overrides?: unknown }).overrides)) {
    const arr = (input as { overrides: unknown }).overrides as unknown[];
    entries = arr.filter(isRecord).map((r) => ({
      key: (r as Record<string, unknown>).key,
      value: (r as Record<string, unknown>).value,
    }));
  } else if (isRecord(input) && !Array.isArray(input)) {
    // Plain map form: { "nav.dashboard": "ડેશબોર્ડ" }
    // A nested { overrides } key is handled above; anything else is a map.
    entries = Object.entries(input).map(([key, value]) => ({ key, value }));
  }
  if (!entries) return fail('INVALID_INPUT', 'Overrides must be an object map or { overrides: [...] }.');
  if (entries.length > MAX_BATCH) {
    return fail('TOO_MANY', `At most ${MAX_BATCH} overrides can be saved at once.`);
  }

  const clean: Array<{ key: string; value: string }> = [];
  for (const e of entries) {
    if (typeof e.key !== 'string' || e.key.length === 0 || e.key.length > MAX_KEY_LEN || !KEY_RE.test(e.key)) {
      return fail('INVALID_KEY', `Invalid language key: ${String(e.key).slice(0, 80)}.`);
    }
    if (typeof e.value !== 'string' || e.value.length > MAX_VALUE_LEN) {
      return fail(
        'INVALID_VALUE',
        `Wording for "${e.key}" must be text of ${MAX_VALUE_LEN} characters or fewer.`
      );
    }
    // Whitespace-only resets to the bundled wording (stored as '').
    clean.push({ key: e.key, value: e.value.trim().length === 0 ? '' : e.value });
  }

  ensureTable();
  const db = getSqlite();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO language_overrides (id, locale, key, value, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );
  const tx = db.transaction(() => {
    for (const c of clean) {
      stmt.run(`${WRITABLE_LOCALE}:${c.key}`, WRITABLE_LOCALE, c.key, c.value, now);
    }
  });
  tx();
  return { ok: true, saved: clean.length };
}

/** Reset one key (or every key) to the bundled wording. Never deletes rows. */
export function resetLanguageOverrides(input: unknown): LanguageSaveResult {
  ensureTable();
  const db = getSqlite();
  const now = new Date().toISOString();
  if (input === 'all' || (isRecord(input) && (input as { all?: unknown }).all === true)) {
    db.prepare('UPDATE language_overrides SET value = ?, updated_at = ? WHERE locale = ?').run(
      '',
      now,
      WRITABLE_LOCALE
    );
    return { ok: true, saved: 0 };
  }
  const key = isRecord(input) ? (input as { key?: unknown }).key : input;
  if (typeof key !== 'string' || !KEY_RE.test(key)) {
    return fail('INVALID_KEY', 'A valid language key is required to reset.');
  }
  db.prepare(
    `INSERT INTO language_overrides (id, locale, key, value, updated_at)
     VALUES (?, ?, ?, '', ?)
     ON CONFLICT(id) DO UPDATE SET value = '', updated_at = excluded.updated_at`
  ).run(`${WRITABLE_LOCALE}:${key}`, WRITABLE_LOCALE, key, now);
  return { ok: true, saved: 1 };
}
