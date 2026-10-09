// Centralized mapping of raw SQLite/Drizzle failures to safe
// application-level errors. Raw messages never leave the main process.

export interface AppDbError {
  code: string;
  message: string;
}

const SAFE_MESSAGES: Record<string, string> = {
  UNIQUE_VIOLATION: 'A record with this information already exists.',
  FOREIGN_KEY_VIOLATION: 'This operation references data that does not exist.',
  NOT_FOUND: 'The requested record was not found.',
  DATABASE_BUSY: 'The database is busy. Please try again.',
  DATABASE_LOCKED: 'The database is temporarily locked. Please try again.',
  DATABASE_CORRUPT: 'The local database appears to be damaged. Please restore from backup.',
  MIGRATION_FAILED: 'Failed to prepare the local database. Please restart the application.',
  VALIDATION_FAILED: 'Invalid data was provided.',
  INTERNAL: 'An unexpected database error occurred.',
};

function codeFor(raw: string): string {
  const msg = raw.toUpperCase();
  if (msg.includes('SQLITE_CONSTRAINT_UNIQUE') || msg.includes('UNIQUE CONSTRAINT FAILED')) {
    return 'UNIQUE_VIOLATION';
  }
  if (msg.includes('SQLITE_CONSTRAINT_FOREIGNKEY') || msg.includes('FOREIGN KEY CONSTRAINT FAILED')) {
    return 'FOREIGN_KEY_VIOLATION';
  }
  if (msg.includes('SQLITE_BUSY')) return 'DATABASE_BUSY';
  if (msg.includes('SQLITE_LOCKED')) return 'DATABASE_LOCKED';
  if (msg.includes('MALFORMED') || msg.includes('NOT A DATABASE') || msg.includes('FILE IS NOT A DATABASE')) {
    return 'DATABASE_CORRUPT';
  }
  return 'INTERNAL';
}

export function toAppError(err: unknown, fallback: string = 'INTERNAL'): AppDbError {
  const raw = err instanceof Error ? err.message : String(err);
  const code = codeFor(raw) === 'INTERNAL' ? fallback : codeFor(raw);
  return { code, message: SAFE_MESSAGES[code] ?? SAFE_MESSAGES.INTERNAL };
}

export function appError(code: keyof typeof SAFE_MESSAGES, message?: string): AppDbError {
  return { code, message: message ?? SAFE_MESSAGES[code] };
}
