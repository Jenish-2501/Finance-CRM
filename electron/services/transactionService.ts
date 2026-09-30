import { getDb } from '../database/database.js';
import { Repositories } from '../database/repositories/repositories.js';

// The user requested we use a transaction wrapper for operations spanning multiple repositories.
// Because we are relying on Zustand to generate IDs and maintain complex UI logic (per instruction: "Surgically modify the existing persistence side effects. Existing Zustand actions should continue to: 1. Update in-memory state. 2. Execute the required business logic. 3. Persist only the affected entity/entities through IPC."), the backend's primary transactional responsibility is to accept the atomic diff from Zustand and save it reliably inside an SQLite transaction.

export function saveDiffTransaction(payload: Record<string, any[]>) {
  const db = getDb();

  const transaction = db.transaction(() => {
    for (const [storeKey, entities] of Object.entries(payload)) {
      const repo = Repositories[storeKey as keyof typeof Repositories];
      if (!repo) continue;

      for (const entity of entities) {
        repo.upsert(entity);
      }
    }
  });

  try {
    transaction();
    return true;
  } catch (err) {
    console.error('Failed to persist transaction:', err);
    throw err;
  }
}

export function loadFullState() {
  const state: any = {};

  for (const [storeKey, repo] of Object.entries(Repositories)) {
    const rows = repo.findAll();

    if (storeKey === 'auditLogs') {
      state[storeKey] = rows;
    } else {
      const recordMap: any = {};
      for (const row of rows) {
        if (storeKey === 'businessSettings' && rows.length > 0) {
           Object.assign(recordMap, row);
           break;
        } else {
           recordMap[row.id] = row;
        }
      }

      if (storeKey === 'businessSettings') {
          state[storeKey] = recordMap.id ? recordMap : rows[0] || {};
      } else {
          state[storeKey] = recordMap;
      }
    }
  }
  return state;
}
