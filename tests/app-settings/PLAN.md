# App Settings backup & restore — Test Plan

`maintenance:exportBackup` takes a VACUUM INTO snapshot (full data + structure) and copies it
to the owner's chosen location via save dialog. `maintenance:restoreBackup` lets the owner pick
a backup file; after validation the live database is replaced (current data safety-backed-up
first, rollback on reopen failure). The Electron main side (dialogs + webContents) cannot run
headless, so automated coverage is:
- `electron/database/__tests__/restore.test.ts` (tsx, temp DBs): full replace cycle with safety
  copy, invalid-file rejection with live DB untouched, same-file no-op. Run: `npm run test:restore`.
- M1-3 IPC channel parity (preload invoke ↔ main handler symmetry, `test:m1`).
- Renderer behavior below (jsdom, stubbed bridge).
Paper restore on the owner machine is manual.

## Scenarios (jsdom, stubbed bridge)
| # | Bridge | Expected UI |
|---|--------|-------------|
| 1 | absent | card + button render; click → browser-preview error, no crash |
| 2 | `{ok:true, file:'D:/backups/app-2026.sqlite'}` | success status shows the saved path |
| 3 | `{ok:false, error:'CANCELLED'}` | dialog dismissed → no status shown (silent) |
| 4 | `{ok:false}` | failure error status shown |
| 5 | restore w/o bridge | browser-preview error |
| 6 | restore `{ok:true}` | checkbox-gated button enables; success asks Reload App Data |
| 7 | restore `{ok:false, error:'CANCELLED'}` | silent |
| 8 | restore `{ok:false, error:'INVALID_BACKUP'}` | plain-language rejection shown |
