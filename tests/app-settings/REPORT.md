# App Settings backup & restore — Report

Date: 2026-10-09. Status: GREEN (10/10 jsdom + 3/3 tsx restore cycle).

## Delivered
- New **App Settings** tab (Administration): one **Download Full Backup** button. Main process
  takes a VACUUM INTO snapshot (complete data + structure, safe under WAL), then opens a save
  dialog defaulting to a dated filename so the client can store it on desktop / pen drive.
  Dialog-cancel stays silent; failures report plain-language errors; stale-bridge case handled.
- **Restore from Backup** (danger card): explicit confirmation checkbox → main file dialog →
  read-only validation (integrity + core tables; older versions accepted, migrated forward) →
  automatic safety backup of current data → checkpoint, close, replace, reopen. Reopen failure
  rolls back to the safety copy. Success asks for **Reload App Data** (renderer re-reads SQLite).
- IPC: `maintenance:exportBackup` + `maintenance:restoreBackup` (+ `printers:list`/`printing:printPage`
  from the printer work); preload + `main.tsx` typings updated. No DB/schema change.

## Counts
- `backup.test.tsx`: 10 passed (renders; no-bridge messages; export success/CANCELLED/failure;
  restore checkbox gating, no-bridge, success→reload prompt, CANCELLED silent, INVALID_BACKUP text).
- `electron/database/__tests__/restore.test.ts` (`npm run test:restore`): 3 passed — full tamper→
  restore→override cycle with safety file; invalid (junk + wrong-schema) rejection with live DB
  untouched and handle usable; same-file no-op.
- Regressions: `tsc` (+unused), all vitest files, `test:db`, `test:m1`, `test:m2` green.

## Commands
- `npx vitest run tests/app-settings` · `npm run test:restore`
