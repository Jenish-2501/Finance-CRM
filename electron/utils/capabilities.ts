// Authoritative capability contract. The MAIN process decides what the
// runtime can do; the renderer only reads this (never self-claims).
// Pure (no Electron import) so self-tests can exercise it in plain Node.

export interface AppCapabilities {
  /** Always true when answered by the real main process. Never faked in React. */
  isElectron: boolean;
  /** Passcode verify/change backed by SQLite in this runtime. */
  canManagePasscode: boolean;
  /** Local SQLite database available through IPC. */
  canUseLocalDatabase: boolean;
  /** Main-process file dialogs (CSV/PDF export) available. */
  canAccessFilesystem: boolean;
}

export interface AppVersion {
  app: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
}

export function buildCapabilities(): AppCapabilities {
  return {
    isElectron: true,
    canManagePasscode: true,
    canUseLocalDatabase: true,
    canAccessFilesystem: true,
  };
}

export function buildVersion(info: {
  app: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
}): AppVersion {
  return { ...info };
}
