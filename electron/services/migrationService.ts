import { getDb } from '../database/database.js';
import { Repositories } from '../database/repositories/repositories.js';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export function hasMigratedLocalStorage() {
  const markerPath = path.join(app.getPath('userData'), 'database', '.migration_complete');
  return fs.existsSync(markerPath);
}

export function markMigrationComplete() {
  const markerPath = path.join(app.getPath('userData'), 'database', '.migration_complete');
  fs.writeFileSync(markerPath, 'done');
}

// Accepts the parsed localStorage 'acculedger_accounting_store_v1' payload
export function migrateLocalStorageToSqlite(localStorageData: any) {
  if (hasMigratedLocalStorage()) return false;

  if (!localStorageData || !localStorageData.state) return false;

  const state = localStorageData.state;
  const db = getDb();

  const transaction = db.transaction(() => {
    for (const [storeKey, repo] of Object.entries(Repositories)) {
      const stateSlice = state[storeKey];
      if (!stateSlice) continue;

      if (Array.isArray(stateSlice)) {
        for (const item of stateSlice) {
           repo.upsert(item);
        }
      } else if (typeof stateSlice === 'object') {
        if (storeKey === 'businessSettings' && stateSlice.business_name) {
           // Business settings object directly
           repo.upsert(stateSlice);
        } else {
           // Record<string, Entity> map
           for (const item of Object.values(stateSlice)) {
             repo.upsert(item);
           }
        }
      }
    }
  });

  try {
    transaction();
    markMigrationComplete();
    console.log("Successfully migrated localStorage to SQLite.");
    return true;
  } catch (err) {
    console.error("Failed to migrate localStorage to SQLite:", err);
    throw err;
  }
}
