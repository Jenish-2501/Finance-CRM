import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { Repositories } from '../database/repositories/repositories.js';
import { deleteRow } from '../database/repositories/mappers.js';
import { saveDiffTransaction, loadFullState } from '../services/transactionService.js';
import { migrateLocalStorageToSqlite } from '../services/migrationService.js';
import { checkDatabaseHealth, checkDatabaseIntegrity } from '../database/index.js';
import { getDatabaseStructure } from '../services/schemaService.js';
import { createBackup, restoreDatabaseFromFile } from '../services/backupService.js';
import { getUserDataDir } from '../utils/appPaths.js';
import { verifyPasscode, changePasscode, isValidPasscodeFormat } from '../services/authService.js';
import {
  getBusinessSettings,
  updateBusinessSettings,
  listUoms,
  createUom,
  setUomActive,
} from '../services/businessService.js';
import {
  listLanguageOverrides,
  saveLanguageOverrides,
  resetLanguageOverrides,
} from '../services/languageService.js';
import { buildCapabilities, buildVersion } from '../utils/capabilities.js';
import {
  assertRowWithId,
  assertPersistPayload,
  assertEntityType,
  isTextId,
  isRecord,
  isNonEmptyString,
} from '../utils/validate.js';
import { toAppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

function safeHandler<T extends unknown[]>(channel: string, fn: (...args: T) => unknown): void {
  ipcMain.handle(channel, async (_event, ...args: T) => {
    try {
      return await fn(...args);
    } catch (err) {
      logger.error('ipc.handler_failed', { channel });
      // Never leak raw SQL / paths / stacks to the renderer.
      throw toAppError(err);
    }
  });
}

function assertUpsertInput(data: unknown, entity: string): asserts data is Record<string, unknown> {
  assertRowWithId(data, entity);
}

function assertFilePayload(payload: unknown): asserts payload is { filename: string; content?: string; data?: string } {
  if (!isRecord(payload)) throw new Error('VALIDATION_FAILED:file payload must be an object');
  const filename = payload.filename;
  if (!isNonEmptyString(filename, 128)) throw new Error('VALIDATION_FAILED:filename invalid');
  // Prevent path traversal: only a bare file name with a safe extension.
  const base = path.basename(filename);
  if (base !== filename || filename.includes('..')) {
    throw new Error('VALIDATION_FAILED:filename invalid');
  }
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  // ---- Store lifecycle (used by Zustand electronStorage) ----
  safeHandler('store:migrateLocalStorage', (data: unknown) => {
    if (!isRecord(data)) return false;
    return migrateLocalStorageToSqlite(data);
  });

  safeHandler('store:loadAll', () => loadFullState());

  safeHandler('store:persistChanges', (payload: unknown) => {
    assertPersistPayload(payload);
    return saveDiffTransaction(payload);
  });

  // ---- Explicit domain upserts (matches existing renderer calls) ----
  const domainUpserts: Array<[string, { upsert: (e: Record<string, unknown>) => void }]> = [
    ['business_settings:upsert', Repositories.businessSettings],
    ['customers:upsert', Repositories.customers],
    ['products:upsert', Repositories.products],
    ['product_prices:upsert', Repositories.productPrices],
    ['product_units:upsert', Repositories.productUnits],
    ['stock_receipts:upsert', Repositories.stockReceipts],
    ['stock_receipt_items:upsert', Repositories.stockReceiptItems],
    ['inventory_movements:upsert', Repositories.inventoryMovements],
    ['customer_inventory_movements:upsert', Repositories.customerInventoryMovements],
    ['invoice_payments:upsert', Repositories.invoicePayments],
    ['audit_logs:upsert', Repositories.auditLogs],
  ];

  for (const [channel, repo] of domainUpserts) {
    safeHandler(channel, (data: unknown) => {
      assertUpsertInput(data, channel);
      repo.upsert(data);
      return true;
    });
  }

  safeHandler('customers:delete', (id: unknown) => {
    if (!isTextId(id)) throw new Error('VALIDATION_FAILED:id invalid');
    deleteRow('customers', id);
    return true;
  });

  // Transactional invoice diff (atomic multi-entity write).
  safeHandler('invoices:transaction', (payload: unknown) => {
    assertPersistPayload(payload as Record<string, unknown>);
    return saveDiffTransaction(payload as Record<string, unknown[]>);
  });

  // ---- Backward-compat generic entity routes (allow-listed, validated) ----
  safeHandler('store:upsert', (entityType: unknown, data: unknown) => {
    assertEntityType(entityType);
    assertUpsertInput(data, entityType);
    const repo = Repositories[entityType as keyof typeof Repositories];
    repo.upsert(data);
    return true;
  });

  safeHandler('store:delete', (entityType: unknown, id: unknown) => {
    assertEntityType(entityType);
    if (!isTextId(id)) throw new Error('VALIDATION_FAILED:id invalid');
    deleteRow(entityType, id);
    return true;
  });

  // ---- App lock (passcode verified against scrypt hash in SQLite) ----
  // Canonical channels are passcode:*. auth:* are legacy aliases kept for
  // renderers cached across an upgrade. Returns an envelope, never throws
  // for wrong passcodes; malformed input throws.
  const verifyWith = (passcode: unknown) => {
    if (typeof passcode !== 'string') throw new Error('VALIDATION_FAILED:passcode must be a string');
    return verifyPasscode(passcode);
  };
  const changeWith = (payload: unknown) => {
    if (!isRecord(payload)) throw new Error('VALIDATION_FAILED:payload must be an object');
    const { current, next } = payload as { current: unknown; next: unknown };
    if (!isValidPasscodeFormat(current) || !isValidPasscodeFormat(next)) {
      throw new Error('VALIDATION_FAILED:passcode must be 4-64 characters');
    }
    return changePasscode(current, next);
  };
  safeHandler('passcode:verify', verifyWith);
  safeHandler('passcode:change', changeWith);
  safeHandler('auth:login', verifyWith);
  safeHandler('auth:changePasscode', changeWith);

  // ---- Business configuration (M2: DB-authoritative, validated) ----
  // business_settings:upsert (domain table above) stays as the legacy raw
  // write path; the channels below validate GSTIN/PAN/state-code consistency,
  // notified GST slabs, and invoice numbering before touching SQLite, and
  // return envelopes ({ ok, error }) instead of throwing for user-fixable
  // input. Only unexpected storage failures throw (mapped to AppDbError).
  safeHandler('business-settings:get', () => getBusinessSettings());
  safeHandler('business-settings:update', (data: unknown) => updateBusinessSettings(data));
  safeHandler('uoms:list', () => listUoms());
  safeHandler('uoms:create', (data: unknown) => createUom(data));
  safeHandler('uoms:set-active', (payload: unknown) => {
    if (!isRecord(payload)) throw new Error('VALIDATION_FAILED:payload must be an object');
    const { id, is_active } = payload as { id: unknown; is_active: unknown };
    return setUomActive(id, is_active);
  });

  // ---- Gujarati wording overrides (Language route under Settings) ----
  // language:list returns the stored customizations as { "nav.dashboard": "…" }.
  // language:save upserts a map (empty string = reset to bundled wording).
  // language:reset clears one key ({ key }) or everything ('all' / { all: true }).
  // Only unexpected storage failures throw; user-fixable input problems come
  // back as { ok:false, error, message } envelopes.
  safeHandler('language:list', () => listLanguageOverrides());
  safeHandler('language:save', (data: unknown) => saveLanguageOverrides(data));
  safeHandler('language:reset', (data: unknown) => resetLanguageOverrides(data));

  // ---- App identity + capabilities (main process is authoritative) ----
  safeHandler('app:get-version', () =>
    buildVersion({
      app: app.getVersion(),
      electron: process.versions.electron ?? 'unknown',
      chrome: process.versions.chrome ?? 'unknown',
      node: process.versions.node ?? 'unknown',
      platform: process.platform,
    })
  );
  safeHandler('app:get-capabilities', () => buildCapabilities());

  // ---- Maintenance / diagnostics (no SQL exposed) ----
  safeHandler('database:health', () => checkDatabaseHealth());
  safeHandler('database:schema', () => getDatabaseStructure());
  safeHandler('maintenance:health', () => checkDatabaseHealth());
  safeHandler('maintenance:integrity', () => checkDatabaseIntegrity());
  safeHandler('maintenance:backup', () => createBackup());
  // Full-database download for periodic client backups: takes a VACUUM INTO
  // snapshot (complete data + structure, transaction-safe under WAL), then lets
  // the owner choose where to save it (desktop, pen drive, …) via save dialog.
  // The internal retained copy stays under userData/backups (pruned to 7).
  // { ok:false, error:'CANCELLED' } when the dialog is dismissed — stay silent.
  safeHandler('maintenance:exportBackup', async () => {
    const made = createBackup();
    if (!made.ok || !made.file) return { ok: false };
    const win = getWindow();
    if (!win) return { ok: false, error: 'NO_WINDOW' };
    const { filePath, canceled } = await dialog.showSaveDialog(win, {
      title: 'Save Database Backup',
      defaultPath: path.basename(made.file),
      filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }],
    });
    if (canceled || !filePath) return { ok: false, error: 'CANCELLED' };
    try {
      await fs.promises.copyFile(made.file, filePath);
      return { ok: true, file: filePath };
    } catch {
      logger.error('backup.export_failed', {});
      return { ok: false };
    }
  });

  // Restore with override: the owner picks a backup file; after validation the
  // live database is replaced (current data is safety-backed-up first). The
  // renderer then reloads itself from the restored database.
  safeHandler('maintenance:restoreBackup', async () => {
    const win = getWindow();
    if (!win) return { ok: false, error: 'NO_WINDOW' };
    const { filePaths, canceled } = await dialog.showOpenDialog(win, {
      title: 'Restore Database Backup (replaces current data)',
      filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return { ok: false, error: 'CANCELLED' };
    return restoreDatabaseFromFile(filePaths[0], getUserDataDir());
  });

  // ---- Printing (renderer never touches webContents directly) ----
  // printers:list returns the OS printer list (name/displayName/isDefault/status).
  // printing:printPage prints the current window with print CSS applied, so the
  // output matches the on-screen challan/invoice. silent:true prints straight to
  // deviceName with no dialog; silent:false opens the OS print dialog instead.
  // Returns envelopes ({ ok, error }) — only malformed input throws.
  safeHandler('printers:list', async () => {
    const win = getWindow();
    if (!win) return [];
    try {
      const printers = await win.webContents.getPrintersAsync();
      // Electron 44 PrinterInfo: { name, displayName, description, options }.
      return printers.map((p) => ({
        name: p.name,
        displayName: p.displayName,
        description: p.description,
      }));
    } catch {
      logger.error('print.list_failed', {});
      return [];
    }
  });

  safeHandler('printing:printPage', async (payload: unknown) => {
    if (!isRecord(payload)) throw new Error('VALIDATION_FAILED:payload must be an object');
    const { deviceName, copies, silent } = payload as {
      deviceName?: unknown;
      copies?: unknown;
      silent?: unknown;
    };
    if (deviceName !== undefined && (typeof deviceName !== 'string' || deviceName.length > 256)) {
      throw new Error('VALIDATION_FAILED:deviceName invalid');
    }
    const nCopies = copies === undefined ? 1 : copies;
    if (typeof nCopies !== 'number' || !Number.isInteger(nCopies) || nCopies < 1 || nCopies > 99) {
      throw new Error('VALIDATION_FAILED:copies must be 1-99');
    }
    const win = getWindow();
    if (!win) return { ok: false, error: 'NO_WINDOW' };
    if (deviceName) {
      try {
        const printers = await win.webContents.getPrintersAsync();
        if (!printers.some((p) => p.name === deviceName)) {
          return { ok: false, error: 'PRINTER_NOT_FOUND' };
        }
      } catch {
        logger.error('print.list_failed', {});
        return { ok: false, error: 'PRINTER_LOOKUP_FAILED' };
      }
    }
    const ok = await new Promise<boolean>((resolve) => {
      try {
        win.webContents.print(
          {
            silent: silent !== false,
            deviceName: deviceName || undefined,
            copies: nCopies,
            printBackground: true,
          },
          (success, failureReason) => {
            if (!success) logger.error('print.failed', { reason: String(failureReason) });
            resolve(success);
          }
        );
      } catch {
        logger.error('print.failed', {});
        resolve(false);
      }
    });
    return ok ? { ok: true } : { ok: false, error: 'PRINT_FAILED' };
  });

  // ---- File exports (dialog-gated, renderer never touches fs) ----
  safeHandler('files:saveCSV', async (payload: unknown) => {
    assertFilePayload(payload);
    const { filename, content } = payload as { filename: string; content: string };
    if (typeof content !== 'string' || content.length > 20_000_000) {
      throw new Error('VALIDATION_FAILED:content too large');
    }
    const win = getWindow();
    if (!win) return false;
    const { filePath } = await dialog.showSaveDialog(win, {
      title: 'Save CSV',
      defaultPath: filename,
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
    });
    if (filePath) {
      await fs.promises.writeFile(filePath, content, 'utf8');
      return true;
    }
    return false;
  });

  safeHandler('files:savePDFBytes', async (payload: unknown) => {
    assertFilePayload(payload);
    const { filename, data } = payload as { filename: string; data: string };
    if (typeof data !== 'string' || data.length > 40_000_000) {
      throw new Error('VALIDATION_FAILED:content too large');
    }
    const win = getWindow();
    if (!win) return false;
    try {
      const { filePath } = await dialog.showSaveDialog(win, {
        title: 'Save PDF',
        defaultPath: filename,
        filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
      });
      if (filePath) {
        await fs.promises.writeFile(filePath, Buffer.from(data, 'base64'));
        return true;
      }
      return false;
    } catch {
      logger.error('files.save_pdf_failed', {});
      return false;
    }
  });
}
