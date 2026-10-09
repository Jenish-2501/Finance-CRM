import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema/index.js';
import { logger } from '../utils/logger.js';

let sqlite: Database.Database | null = null;
let drizzleDb: BetterSQLite3Database<typeof schema> | null = null;
let dbPath: string | null = null;

// Dev and production use separate files so development never touches real
// data: dev.sqlite under the Vite dev server, app.sqlite in production.
// A legacy application.db (pre-split installs) is adopted once by copying
// it to the new name; the -shm sidecar is skipped (transient, rebuilt).
function resolveDatabaseFile(userDataPath: string): string {
  const dbDir = path.join(userDataPath, 'database');
  fs.mkdirSync(dbDir, { recursive: true });

  const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
  const target = path.join(dbDir, isDev ? 'dev.sqlite' : 'app.sqlite');
  if (!fs.existsSync(target)) {
    const legacy = path.join(dbDir, 'application.db');
    if (fs.existsSync(legacy)) {
      fs.copyFileSync(legacy, target);
      const legacyWal = `${legacy}-wal`;
      if (fs.existsSync(legacyWal)) fs.copyFileSync(legacyWal, `${target}-wal`);
      logger.info('database.legacy_adopted', {});
    }
  }
  return target;
}
// Production PRAGMA evaluation (better-sqlite3 v13, SQLite 3.50):
// - foreign_keys=ON: enforced per-connection. Required.
// - journal_mode=WAL: verified below; falls back safely if the FS rejects it
//   (e.g. some network drives). Never MEMORY (durability loss on crash).
// - synchronous=NORMAL: safe with WAL (WAL already crash-safe); OFF is forbidden.
// - busy_timeout=5000: lets concurrent readers/writers wait instead of SQLITE_BUSY.
export function openDatabase(userDataPath: string): BetterSQLite3Database<typeof schema> {
  if (drizzleDb && sqlite) return drizzleDb;

  dbPath = resolveDatabaseFile(userDataPath);
  sqlite = new Database(dbPath);

  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');

  try {
    const mode = (sqlite.pragma('journal_mode = WAL', { simple: true }) as string | undefined) ?? '';
    if (typeof mode === 'string' && mode.toUpperCase() !== 'WAL') {
      logger.warn('database.wal_fallback', { mode });
    }
  } catch (err) {
    // WAL unsupported on this filesystem — DELETE mode remains, still safe.
    logger.warn('database.wal_unavailable', {});
  }

  // Verify critical settings actually took effect.
  const fk = sqlite.pragma('foreign_keys', { simple: true });
  if (Number(fk) !== 1) {
    throw new Error('Failed to enable SQLite foreign keys');
  }

  drizzleDb = drizzle(sqlite, { schema });
  logger.info('database.opened', { wal: true });
  return drizzleDb;
}

export function getDrizzle(): BetterSQLite3Database<typeof schema> {
  if (!drizzleDb) throw new Error('Database not initialized');
  return drizzleDb;
}

export function getSqlite(): Database.Database {
  if (!sqlite) throw new Error('Database not initialized');
  return sqlite;
}

export function getDatabaseFilePath(): string | null {
  return dbPath;
}

export function closeDatabase(): void {
  if (sqlite) {
    try {
      sqlite.close();
    } catch {
      // closing an already-closed handle is harmless
    }
  }
  sqlite = null;
  drizzleDb = null;
  dbPath = null;
}
