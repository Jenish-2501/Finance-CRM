import fs from 'fs';
import path from 'path';
import { getSqlite } from '../database/index.js';
import { getDatabaseFilePath } from '../database/client.js';
import { nextBackupPath, pruneBackups } from '../utils/backupPaths.js';
import { getUserDataDir } from '../utils/appPaths.js';
import { logger } from '../utils/logger.js';

export { nextBackupPath, pruneBackups };

// SQLite-safe backup using VACUUM INTO (transaction-aware snapshot,
// unlike naive file copy of a live DB under WAL). Backups live outside
// the active database file: <userData>/backups/app-YYYY-MM-DD-HHmm.sqlite
export function createBackup(): { ok: boolean; file?: string } {
  const backupsDir = path.join(getUserDataDir(), 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });

  const file = nextBackupPath(backupsDir);

  try {
    const sqlite = getSqlite();
    // VACUUM INTO is atomic and safe against concurrent readers.
    // The target is guaranteed fresh (nextBackupPath), since VACUUM INTO
    // refuses to overwrite an existing file.
    sqlite.prepare('VACUUM INTO ?').run(file);
    pruneBackups(backupsDir);
    logger.info('database.backup_created', { count: fs.readdirSync(backupsDir).length });
    return { ok: true, file };
  } catch (err) {
    logger.error('database.backup_failed', {});
    return { ok: false };
  }
}

export function getActiveDatabasePath(): string | null {
  return getDatabaseFilePath();
}
