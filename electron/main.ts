import { app, BrowserWindow, dialog, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, closeDatabase, checkDatabaseHealth } from './database/index.js';
import { registerIpcHandlers } from './ipc/handlers.js';
import { verifyPasscode, changePasscode, resetAuthThrottle } from './services/authService.js';
import { Repositories } from './database/repositories/repositories.js';
import { logger } from './utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

let mainWindow: BrowserWindow | null = null;
let dbReady = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      // NOTE: the preload bundle is CJS (`.cjs`, uses `require('electron')`).
      // `.cjs` matters because package.json is `"type": "module"` (a `.js`
      // preload would be parsed as ESM and throw "require is not defined",
      // leaving `window.electronAPI` undefined -> "SHELL ERROR - BRIDGE
      // MISSING"). Sandbox stays off while the preload uses require;
      // contextIsolation + no nodeIntegration still keeps renderer
      // code unprivileged.
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: isDev,
    },
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL as string);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Production lockdown: no popups, no navigation away from the app.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed =
      (!isDev && url.startsWith('file://')) ||
      (isDev && url.startsWith(process.env.VITE_DEV_SERVER_URL as string));
    if (!allowed) {
      event.preventDefault();
      logger.warn('app.navigation_blocked', {});
    }
  });

  if (!isDev) {
    // Belt-and-braces: DevTools must never be reachable in production.
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow?.webContents.closeDevTools();
    });
  }
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function openExternal(url: string): void {
  // Single choke point if renderer ever needs external links (none today).
  shell.openExternal(url).catch(() => {
    logger.error('app.open_external_failed', {});
  });
}

// Dev hot-reload for preload scripts (vite-plugin-electron rebuilds them
// on change and notifies the Electron process; reload picks up the new
// bridge without a full restart). No-op in production.
process.on('message', (msg: unknown) => {
  if (msg === 'electron-vite&type=hot-reload') {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.reload();
    }
  }
});

function showFatalError(message: string): void {
  logger.error('app.database_init_failed', {});
  try {
    dialog.showErrorBox(
      'Database initialization failed',
      `${message}\n\nThe application will now close. Your data in the app data folder was not modified beyond the failed startup.`
    );
  } catch {
    // dialog unavailable (e.g. very early failure) — fall through to quit
  }
}

function closeDbBestEffort(): void {
  if (!dbReady) return;
  try {
    closeDatabase();
  } catch {
    // best-effort close on shutdown
  }
  dbReady = false;
}

// --smoke: headless self-test of the REAL packaged/dev runtime.
// No window is created. Exit code 0 = all checks passed.
async function runSmokeTest(userDataDir: string): Promise<number> {
  const fail = (step: string, detail?: unknown): number => {
    const extra =
      detail instanceof Error ? ` :: ${detail.message}` : detail !== undefined ? ` :: ${String(detail)}` : '';
    console.log(`SMOKE FAIL ${step}${extra}`);
    logger.error('smoke.failed', { step });
    return 1;
  };
  try {
    initDatabase(userDataDir);
    dbReady = true;
  } catch (err) {
    return fail('init', err);
  }
  // The IPC round-trip below needs real handlers, exactly like the normal
  // startup path. Without this, every invoke() rejects with "no handler".
  let smokeWindow: BrowserWindow | null = null;
  registerIpcHandlers(() => smokeWindow);

  resetAuthThrottle();
  const login = verifyPasscode('1234');
  if (!login.ok) {
    closeDbBestEffort();
    return fail('passcode-verify-default');
  }

  // True IPC round-trip through preload in a hidden window (packaged app).
  try {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        // Must match createWindow(): CJS preload (.cjs) + no sandbox.
        sandbox: false,
      },
    });
    smokeWindow = win;
    await win.loadURL('about:blank');
    const caps = (await win.webContents.executeJavaScript(
      'window.electronAPI.app.getCapabilities()'
    )) as { isElectron: boolean; canManagePasscode: boolean } | null;
    if (!caps || caps.isElectron !== true || caps.canManagePasscode !== true) {
      win.close();
      closeDbBestEffort();
      return fail('ipc-capabilities');
    }
    const ipcLogin = (await win.webContents.executeJavaScript(
      "window.electronAPI.passcode.verify('1234')"
    )) as { ok: boolean } | null;
    if (!ipcLogin || ipcLogin.ok !== true) {
      win.close();
      closeDbBestEffort();
      return fail('ipc-passcode-verify');
    }
    const health = (await win.webContents.executeJavaScript(
      'window.electronAPI.database.health()'
    )) as { connected: boolean } | null;
    if (!health || health.connected !== true) {
      win.close();
      closeDbBestEffort();
      return fail('ipc-health');
    }
    win.close();
    smokeWindow = null;
    console.log('SMOKE IPC PASS');
  } catch (err) {
    smokeWindow = null;
    closeDbBestEffort();
    return fail('ipc-transport', err);
  }
  const changed = changePasscode('1234', 'smoke-5678');
  if (!changed.ok) {
    closeDbBestEffort();
    return fail('passcode-change');
  }
  resetAuthThrottle();
  if (!verifyPasscode('smoke-5678').ok || verifyPasscode('1234').ok) {
    closeDbBestEffort();
    return fail('passcode-verify-updated');
  }

  try {
    const now = new Date().toISOString();
    Repositories.customers.upsert({
      id: 'cust-smoke',
      customer_name: 'Smoke Test',
      customer_number: 'C-9001',
      pan: 'AAAAA0000A',
      gst_number: '24AAAAA0000A1Z5',
      email: 'smoke@example.com',
      mobile: '9000000000',
      address: 'Addr',
      city: 'Surat',
      state: 'Gujarat',
      country: 'India',
      postal_code: '395001',
      state_code: '24',
      bank_details: null,
      credit_limit: null,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
    const found = (Repositories.customers.findAll() as Array<{ id: string }>).some(
      (c) => c.id === 'cust-smoke'
    );
    if (!found) {
      closeDbBestEffort();
      return fail('crud');
    }
  } catch (err) {
    closeDbBestEffort();
    return fail('crud', err);
  }

  const health = checkDatabaseHealth();
  if (!health.connected || health.migrationStatus !== 'OK') {
    closeDbBestEffort();
    return fail('health');
  }

  closeDbBestEffort();
  console.log('SMOKE PASS');
  return 0;
}

const smokeIndex = process.argv.indexOf('--smoke');
const userDataIndex = process.argv.indexOf('--user-data-dir');
const argvUserData =
  userDataIndex !== -1 && process.argv[userDataIndex + 1] ? process.argv[userDataIndex + 1] : null;

// Test-only isolation hook (E2E): ACCULEDGER_TEST_USERDATA redirects the entire
// userData directory (database, backups, markers) at a fresh temp dir per test.
// Honored ONLY in unpackaged dev runs. app.isPackaged is Electron-native and
// cannot be spoofed via env, and VITE_DEV_SERVER_URL never exists in production
// builds — so in a packaged app this variable is completely ignored and
// production data can never be redirected. Explicit --user-data-dir wins.
function resolveTestUserData(): string | null {
  const testDir = process.env.ACCULEDGER_TEST_USERDATA;
  if (!testDir) return null;
  if (app.isPackaged || !isDev) {
    logger.error('app.test_userdata_rejected_not_dev', {});
    return null;
  }
  if (!path.isAbsolute(testDir)) {
    logger.error('app.test_userdata_rejected_not_absolute', {});
    return null;
  }
  return testDir;
}

const effectiveUserData = argvUserData ?? resolveTestUserData();
if (effectiveUserData) {
  // Must run before app.ready() for initDatabase to honor it.
  app.setPath('userData', effectiveUserData);
  if (!argvUserData) logger.warn('app.test_userdata_active', {});
}

if (smokeIndex !== -1) {
  const dirFlag = effectiveUserData ?? app.getPath('userData');
  app.whenReady().then(async () => {
    const code = await runSmokeTest(dirFlag);
    app.exit(code);
  });
} else {
  app.whenReady().then(() => {
    // Startup order: userData -> mkdir -> open -> PRAGMAs -> migrations ->
    // seeds -> IPC -> window.
    try {
      initDatabase(app.getPath('userData'));
      dbReady = true;
    } catch (err) {
      showFatalError('The local database could not be prepared.');
      app.quit();
      return;
    }

    registerIpcHandlers(() => mainWindow);

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  const quitShutdown = () => {
    closeDbBestEffort();
  };
  app.on('before-quit', quitShutdown);
  app.on('will-quit', quitShutdown);
  app.on('window-all-closed', () => {
    closeDbBestEffort();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
