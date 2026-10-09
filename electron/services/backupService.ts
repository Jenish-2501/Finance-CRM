import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { getSqlite, initDatabase, closeDatabase } from '../database/index.js';
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

// A backup is restorable only if it is an intact SQLite file holding the core
// AccuLedger tables. Older versions are fine — initDatabase migrates forward
// after the replace. Checked on a read-only probe; the live DB is untouched.
const CORE_RESTORE_TABLES = [
  'business_settings',
  'uoms',
  'customers',
  'products',
  'invoices',
  'audit_logs',
];

export function validateBackupFile(filePath: string): { ok: boolean; error?: string } {
  let probe: Database.Database | null = null;
  try {
    probe = new Database(filePath, { readonly: true });
    const check = probe.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
    if (check.map((r) => r.integrity_check).join('; ').toLowerCase() !== 'ok') {
      return { ok: false, error: 'INVALID_BACKUP' };
    }
    const names = new Set(
      (probe.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(
        (r) => r.name
      )
    );
    for (const t of CORE_RESTORE_TABLES) {
      if (!names.has(t)) return { ok: false, error: 'INVALID_BACKUP' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'INVALID_BACKUP' };
  } finally {
    try {
      probe?.close();
    } catch {
      // ignore close errors on a probe handle
    }
  }
}

export interface RestoreResult {
  ok: boolean;
  error?: string;
  safetyFile?: string;
}

// Replace the live database with a validated backup file, overriding current
// data. Safety first: the current file is copied aside BEFORE the replace, and
// if reopening fails the safety copy is rolled back. userDataDir is explicit
// (not read from app state) so this stays unit-testable without Electron.
export function restoreDatabaseFromFile(sourceFile: string, userDataDir: string): RestoreResult {
  const activeFile = getDatabaseFilePath();
  if (!activeFile) return { ok: false, error: 'NO_ACTIVE_DB' };
  try {
    if (fs.realpathSync(sourceFile) === fs.realpathSync(activeFile)) return { ok: true };
  } catch {
    // Either path is unreadable — validation below reports it.
  }
  if (!validateBackupFile(sourceFile).ok) return { ok: false, error: 'INVALID_BACKUP' };

  try {
    getSqlite().prepare('PRAGMA wal_checkpoint(TRUNCATE)').run();
  } catch {
    // best effort — closeDatabase below still releases the handle
  }
  closeDatabase();

  const backupsDir = path.join(userDataDir, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safetyFile = path.join(backupsDir, `pre-restore-${stamp}.sqlite`);
  try {
    fs.copyFileSync(activeFile, safetyFile);
    for (const suffix of ['-wal', '-shm', '-journal']) {
      try {
        fs.rmSync(`${activeFile}${suffix}`, { force: true });
      } catch {
        // ignore sidecar cleanup failures
      }
    }
    fs.copyFileSync(sourceFile, activeFile);
  } catch {
    logger.error('backup.restore_replace_failed', {});
    return { ok: false, error: 'RESTORE_FAILED' };
  }

  try {
    initDatabase(userDataDir);
    pruneBackups(backupsDir);
    return { ok: true, safetyFile };
  } catch {
    logger.error('backup.restore_reopen_failed', {});
    try {
      closeDatabase();
      fs.copyFileSync(safetyFile, activeFile);
      initDatabase(userDataDir);
    } catch {
      // rollback itself failed — operator attention required
    }
    return { ok: false, error: 'RESTORE_FAILED' };
  }
}
