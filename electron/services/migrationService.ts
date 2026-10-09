import fs from 'fs';
import path from 'path';
import { getSqlite } from '../database/index.js';
import { Repositories } from '../database/repositories/repositories.js';
import { isRecord } from '../utils/validate.js';
import { getUserDataDir } from '../utils/appPaths.js';
import { logger } from '../utils/logger.js';

export interface LocalStorageMigrationOptions {
  /** Override for tests: directory holding the .migration_complete marker. */
  markerDir?: string;
}

function markerPath(opts?: LocalStorageMigrationOptions): string {
  const dir = opts?.markerDir ?? path.join(getUserDataDir(), 'database');
  return path.join(dir, '.migration_complete');
}

export function hasMigratedLocalStorage(opts?: LocalStorageMigrationOptions): boolean {
  return fs.existsSync(markerPath(opts));
}

export function markMigrationComplete(opts?: LocalStorageMigrationOptions): void {
  fs.writeFileSync(markerPath(opts), 'done');
}

// One-time import of the legacy localStorage payload into SQLite.
// Idempotent via marker file; runs inside a single transaction.
export function migrateLocalStorageToSqlite(
  localStorageData: unknown,
  opts?: LocalStorageMigrationOptions
): boolean {
  if (hasMigratedLocalStorage(opts)) return false;
  if (!isRecord(localStorageData)) return false;

  const state = localStorageData.state;
  if (!isRecord(state)) return false;

  const db = getSqlite();
  const tx = db.transaction(() => {
    for (const [storeKey, repo] of Object.entries(Repositories)) {
      const slice: unknown = (state as Record<string, unknown>)[storeKey];
      if (!slice) continue;

      if (Array.isArray(slice)) {
        for (const item of slice) {
          if (isRecord(item)) repo.upsert(item);
        }
      } else if (isRecord(slice)) {
        if (storeKey === 'businessSettings' && typeof slice.business_name === 'string') {
          repo.upsert(slice);
        } else {
          for (const item of Object.values(slice)) {
            if (isRecord(item)) repo.upsert(item);
          }
        }
      }
    }
  });

  try {
    tx();
    markMigrationComplete(opts);
    logger.info('database.localstorage_migrated', {});
    return true;
  } catch (err) {
    logger.error('database.localstorage_migration_failed', {});
    throw err;
  }
}
