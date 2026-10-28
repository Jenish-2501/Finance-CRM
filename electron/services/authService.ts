import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDrizzle } from '../database/client.js';
import { authSettings } from '../database/schema/auth.js';
import { logger } from '../utils/logger.js';

// App-lock credentials. Single row (id = 'local') holding a salted scrypt
// hash — the plaintext passcode is never persisted anywhere.
// Uses Node's built-in crypto only (no extra dependency).

const ROW_ID = 'local';
const DEFAULT_PASSCODE = '1234';

// Counter-staff role: a second credential row in the same table, seeded to
// '2222'. Logging in with it opens a restricted workspace (challan entry,
// product catalog, customer master data only) — the sidebar and cross-links
// are filtered in the renderer; the database layer stays identical, since
// this is a single-machine offline app.
const COUNTER_ROW_ID = 'counter';
const DEFAULT_COUNTER_PASSCODE = '2222';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;

export const PASSCODE_MIN_LEN = 4;
export const PASSCODE_MAX_LEN = 64;

// Brute-force throttle: 5 failed attempts within 60s locks verification.
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 60_000;
let failureStamps: number[] = [];

export type AuthError = 'INVALID' | 'INCORRECT' | 'INCORRECT_CURRENT' | 'LOCKED';

/** Which workspace a successful passcode unlocks. */
export type AuthRole = 'super' | 'counter';

export interface AuthResult {
  ok: boolean;
  error?: AuthError;
  /** Present on success — tells the renderer which role to launch. */
  role?: AuthRole;
}

function hashPasscode(passcode: string): string {
  const salt = crypto.randomBytes(SALT_LEN);
  const hash = crypto.scryptSync(passcode, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyHash(passcode: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0) || N > 1_048_576) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], 'hex');
    expected = Buffer.from(parts[5], 'hex');
  } catch {
    return false;
  }
  if (salt.length !== SALT_LEN || expected.length !== KEY_LEN) return false;
  const actual = crypto.scryptSync(passcode, salt, KEY_LEN, { N, r, p });
  return crypto.timingSafeEqual(actual, expected);
}

function readHash(rowId = ROW_ID): string | null {
  const db = getDrizzle();
  const rows = db.select().from(authSettings).where(eq(authSettings.id, rowId)).all();
  return rows.length > 0 ? rows[0].passwordHash : null;
}

function writeHash(hash: string, rowId = ROW_ID): void {
  const db = getDrizzle();
  const now = new Date().toISOString();
  db.insert(authSettings)
    .values({ id: rowId, passwordHash: hash, updatedAt: now })
    .onConflictDoUpdate({
      target: authSettings.id,
      set: { passwordHash: hash, updatedAt: now },
    })
    .run();
}

/** Idempotent first-launch seed. Creates each credential row only when missing. */
export function ensureDefaultCredentials(): void {
  if (readHash(ROW_ID) === null) {
    writeHash(hashPasscode(DEFAULT_PASSCODE), ROW_ID);
    logger.info('auth.default_seeded', {});
  }
  if (readHash(COUNTER_ROW_ID) === null) {
    writeHash(hashPasscode(DEFAULT_COUNTER_PASSCODE), COUNTER_ROW_ID);
    logger.info('auth.counter_seeded', {});
  }
}

function isLocked(): boolean {
  const cutoff = Date.now() - FAILURE_WINDOW_MS;
  failureStamps = failureStamps.filter((t) => t > cutoff);
  return failureStamps.length >= MAX_FAILURES;
}

function recordFailure(): void {
  failureStamps.push(Date.now());
}

function clearFailures(): void {
  failureStamps = [];
}

/** Test hook: reset in-memory throttle. */
export function resetAuthThrottle(): void {
  failureStamps = [];
}

export function isValidPasscodeFormat(value: unknown): value is string {
  return typeof value === 'string' && value.length >= PASSCODE_MIN_LEN && value.length <= PASSCODE_MAX_LEN;
}

export function verifyPasscode(passcode: unknown): AuthResult {
  if (!isValidPasscodeFormat(passcode)) return { ok: false, error: 'INVALID' };
  if (isLocked()) return { ok: false, error: 'LOCKED' };
  ensureDefaultCredentials();
  const value = passcode as string;
  const stored = readHash(ROW_ID);
  if (stored && verifyHash(value, stored)) {
    clearFailures();
    return { ok: true, role: 'super' };
  }
  // Counter-staff credential: limited workspace (challans/products/customers).
  // Checked after the owner passcode, so the two can never collide on one
  // passcode — the owner credential always wins.
  const counterStored = readHash(COUNTER_ROW_ID);
  if (counterStored && verifyHash(value, counterStored)) {
    clearFailures();
    return { ok: true, role: 'counter' };
  }
  recordFailure();
  return { ok: false, error: 'INCORRECT' };
}

export function changePasscode(current: unknown, next: unknown): AuthResult {
  if (!isValidPasscodeFormat(current) || !isValidPasscodeFormat(next)) {
    return { ok: false, error: 'INVALID' };
  }
  if (isLocked()) return { ok: false, error: 'LOCKED' };
  ensureDefaultCredentials();
  const stored = readHash();
  if (!stored || !verifyHash(current, stored)) {
    recordFailure();
    return { ok: false, error: 'INCORRECT_CURRENT' };
  }
  writeHash(hashPasscode(next));
  clearFailures();
  logger.info('auth.passcode_changed', {});
  return { ok: true };
}
