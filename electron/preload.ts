import { contextBridge, ipcRenderer } from 'electron';

// Explicit, typed, domain-oriented API. No raw SQL, no table names from the
// renderer beyond the allow-listed store helpers, no Node/fs/database access.

export interface DatabaseHealth {
  connected: boolean;
  migrationStatus: 'OK' | 'PENDING';
  sqliteVersion: string;
  appliedMigrations: number[];
  pendingMigrations: number[];
}

export interface AuthResult {
  ok: boolean;
  error?: 'INVALID' | 'INCORRECT' | 'INCORRECT_CURRENT' | 'LOCKED';
}

export interface Capabilities {
  isElectron: boolean;
  canManagePasscode: boolean;
  canUseLocalDatabase: boolean;
  canAccessFilesystem: boolean;
}

export interface VersionInfo {
  app: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
}

// M2 business configuration envelopes. Validation failures come back as
// { ok: false, error, message } (user-fixable); only unexpected storage
// failures reject the promise.
export interface SettingsUpdateResult {
  ok: boolean;
  settings?: Record<string, unknown>;
  error?: string;
  message?: string;
}

export interface UomResult {
  ok: boolean;
  uom?: Record<string, unknown>;
  error?: string;
  message?: string;
}

const api = {
  app: {
    getVersion: (): Promise<VersionInfo> => ipcRenderer.invoke('app:get-version'),
    getCapabilities: (): Promise<Capabilities> => ipcRenderer.invoke('app:get-capabilities'),
  },
  passcode: {
    verify: (passcode: string): Promise<AuthResult> =>
      ipcRenderer.invoke('passcode:verify', passcode),
    change: (current: string, next: string): Promise<AuthResult> =>
      ipcRenderer.invoke('passcode:change', { current, next }),
  },
  // Legacy alias of passcode (kept for renderers cached across an upgrade).
  auth: {
    login: (passcode: string): Promise<AuthResult> =>
      ipcRenderer.invoke('auth:login', passcode),
    changePasscode: (current: string, next: string): Promise<AuthResult> =>
      ipcRenderer.invoke('auth:changePasscode', { current, next }),
  },
  database: {
    health: (): Promise<DatabaseHealth> => ipcRenderer.invoke('database:health'),
    schema: (): Promise<{
      dbFile: string | null;
      sqliteVersion: string;
      tables: Array<{
        name: string;
        rowCount: number;
        columns: Array<{
          name: string;
          type: string;
          notNull: boolean;
          primaryKey: boolean;
          defaultValue: string | null;
        }>;
      }>;
    }> => ipcRenderer.invoke('database:schema'),
  },
  store: {
    migrateLocalStorage: (data: unknown): Promise<boolean> =>
      ipcRenderer.invoke('store:migrateLocalStorage', data),
    upsert: (entityType: string, data: unknown): Promise<boolean> =>
      ipcRenderer.invoke('store:upsert', entityType, data),
    delete: (entityType: string, id: string): Promise<boolean> =>
      ipcRenderer.invoke('store:delete', entityType, id),
    loadAll: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('store:loadAll'),
    persistChanges: (payload: Record<string, unknown[]>): Promise<boolean> =>
      ipcRenderer.invoke('store:persistChanges', payload),
  },
  business_settings: {
    upsert: (data: unknown): Promise<boolean> => ipcRenderer.invoke('business_settings:upsert', data),
    get: (): Promise<Record<string, unknown> | null> =>
      ipcRenderer.invoke('business-settings:get'),
    update: (data: unknown): Promise<SettingsUpdateResult> =>
      ipcRenderer.invoke('business-settings:update', data),
  },
  uoms: {
    list: (): Promise<Record<string, unknown>[]> => ipcRenderer.invoke('uoms:list'),
    create: (data: unknown): Promise<UomResult> => ipcRenderer.invoke('uoms:create', data),
    setActive: (id: string, isActive: boolean): Promise<UomResult> =>
      ipcRenderer.invoke('uoms:set-active', { id, is_active: isActive }),
  },
  language: {
    list: (): Promise<Record<string, string>> => ipcRenderer.invoke('language:list'),
    save: (overrides: Record<string, string>): Promise<{ ok: boolean; saved?: number; error?: string; message?: string }> =>
      ipcRenderer.invoke('language:save', overrides),
    reset: (keyOrAll: string | { key: string } | { all: true }): Promise<{ ok: boolean; saved?: number; error?: string; message?: string }> =>
      ipcRenderer.invoke('language:reset', keyOrAll),
  },
  customers: {
    upsert: (data: unknown): Promise<boolean> => ipcRenderer.invoke('customers:upsert', data),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('customers:delete', id),
  },
  products: {
    upsert: (data: unknown): Promise<boolean> => ipcRenderer.invoke('products:upsert', data),
  },
  product_prices: {
    upsert: (data: unknown): Promise<boolean> => ipcRenderer.invoke('product_prices:upsert', data),
  },
  product_units: {
    upsert: (data: unknown): Promise<boolean> => ipcRenderer.invoke('product_units:upsert', data),
  },
  stock_receipts: {
    upsert: (data: unknown): Promise<boolean> => ipcRenderer.invoke('stock_receipts:upsert', data),
  },
  stock_receipt_items: {
    upsert: (data: unknown): Promise<boolean> => ipcRenderer.invoke('stock_receipt_items:upsert', data),
  },
  inventory_movements: {
    upsert: (data: unknown): Promise<boolean> => ipcRenderer.invoke('inventory_movements:upsert', data),
  },
  customer_inventory_movements: {
    upsert: (data: unknown): Promise<boolean> =>
      ipcRenderer.invoke('customer_inventory_movements:upsert', data),
  },
  invoices: {
    transaction: (payload: Record<string, unknown[]>): Promise<boolean> =>
      ipcRenderer.invoke('invoices:transaction', payload),
  },
  invoice_payments: {
    upsert: (data: unknown): Promise<boolean> => ipcRenderer.invoke('invoice_payments:upsert', data),
  },
  audit_logs: {
    upsert: (data: unknown): Promise<boolean> => ipcRenderer.invoke('audit_logs:upsert', data),
  },
  maintenance: {
    health: (): Promise<DatabaseHealth> => ipcRenderer.invoke('maintenance:health'),
    integrity: (): Promise<{ ok: boolean; detail: string }> =>
      ipcRenderer.invoke('maintenance:integrity'),
    backup: (): Promise<{ ok: boolean; file?: string }> => ipcRenderer.invoke('maintenance:backup'),
    exportBackup: (): Promise<{ ok: boolean; file?: string; error?: string }> =>
      ipcRenderer.invoke('maintenance:exportBackup'),
    restoreBackup: (): Promise<{ ok: boolean; error?: string; safetyFile?: string }> =>
      ipcRenderer.invoke('maintenance:restoreBackup'),
  },
  files: {
    saveCSV: (filename: string, content: string): Promise<boolean> =>
      ipcRenderer.invoke('files:saveCSV', { filename, content }),
    savePDFBytes: (filename: string, data: string): Promise<boolean> =>
      ipcRenderer.invoke('files:savePDFBytes', { filename, data }),
  },
  printers: {
    list: (): Promise<Array<{ name: string; displayName: string; description: string }>> =>
      ipcRenderer.invoke('printers:list'),
  },
  printing: {
    printPage: (opts: { deviceName?: string; copies?: number; silent?: boolean }): Promise<{
      ok: boolean;
      error?: string;
    }> => ipcRenderer.invoke('printing:printPage', opts),
  },
};

export type ElectronAPI = typeof api;

contextBridge.exposeInMainWorld('electronAPI', api);
