import fs from 'fs';
import path from 'path';

// Pure backup-path helpers. No Electron/DB imports so self-tests can
// exercise them directly in plain Node.

export const MAX_BACKUPS = 7;

/** First non-existing backup path in dir (same-second safe). */
export function nextBackupPath(dir: string, at: Date = new Date()): string {
  const stamp = at.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const base = path.join(dir, `app-${stamp}.sqlite`);
  if (!fs.existsSync(base)) return base;
  let n = 1;
  while (fs.existsSync(path.join(dir, `app-${stamp}-${n}.sqlite`))) n++;
  return path.join(dir, `app-${stamp}-${n}.sqlite`);
}

/** Keeps the newest MAX_BACKUPS snapshots, deletes the rest. */
export function pruneBackups(dir: string): void {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('app-') && f.endsWith('.sqlite'))
    .map((f) => path.join(dir, f))
    .sort();
  while (files.length > MAX_BACKUPS) {
    const oldest = files.shift();
    if (oldest) {
      try {
        fs.unlinkSync(oldest);
      } catch {
        break;
      }
    }
  }
}
