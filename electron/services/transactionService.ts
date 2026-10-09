import { getSqlite } from '../database/index.js';
import { Repositories, type RepositoryKey } from '../database/repositories/repositories.js';
import { assertPersistPayload } from '../utils/validate.js';
import { toAppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// Atomic diff persistence. The renderer sends only affected entities;
// everything is written inside ONE SQLite transaction (all-or-nothing).
// Transactions stay short: pure DB writes only, no network/FS/user waits.
export function saveDiffTransaction(payload: Record<string, unknown[]>) {
  assertPersistPayload(payload);

  const db = getSqlite();
  const tx = db.transaction(() => {
    for (const [storeKey, entities] of Object.entries(payload)) {
      const repo = Repositories[storeKey as RepositoryKey];
      if (!repo) continue;
      for (const entity of entities) {
        repo.upsert(entity as Record<string, unknown>);
      }
    }
  });

  try {
    tx();
    return true;
  } catch (err) {
    logger.error('database.persist_failed', { keys: Object.keys(payload) });
    throw toAppError(err);
  }
}

export function loadFullState(): Record<string, unknown> {
  const state: Record<string, unknown> = {};

  for (const [storeKey, repo] of Object.entries(Repositories)) {
    try {
      const rows = repo.findAll() as Record<string, unknown>[];

      if (storeKey === 'auditLogs') {
        state[storeKey] = rows;
      } else if (storeKey === 'businessSettings') {
        state[storeKey] = rows[0] ?? {};
      } else {
        const recordMap: Record<string, unknown> = {};
        for (const row of rows) {
          const id = row.id as string;
          if (id) recordMap[id] = row;
        }
        state[storeKey] = recordMap;
      }
    } catch (err) {
      logger.error('database.load_failed', { storeKey });
      throw toAppError(err);
    }
  }
  return state;
}
