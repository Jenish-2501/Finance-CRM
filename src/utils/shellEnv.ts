// Runtime shell detection. The same UI can be served in two shells that look
// identical: the Electron desktop app (SQLite-backed) and a browser preview
// (vite dev server — no database). Bridge presence is the primary signal
// (canonical `passcode` namespace, legacy `auth` alias); the Electron
// user-agent string is the tiebreaker when the bridge is absent
// (broken preload in a real shell vs. an actual browser).
// Capability *values* always come from app:get-capabilities in main;
// these helpers only detect which shell is hosting the renderer.
// Globals are injectable so self-tests can exercise the matrix in plain Node.
interface BridgeShape {
  passcode?: unknown;
  auth?: unknown;
}

export function hasDesktopBridge(api?: BridgeShape | null): boolean {
  const resolved =
    api ?? (typeof window !== 'undefined'
      ? (window.electronAPI as unknown as BridgeShape | undefined)
      : undefined);
  return Boolean(resolved?.passcode ?? resolved?.auth);
}

export function isElectronShell(userAgent?: string): boolean {
  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  return ua.includes('Electron');
}
