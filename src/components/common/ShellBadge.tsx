import React from 'react';
import { hasDesktopBridge, isElectronShell } from '../../utils/shellEnv';

// Shows which shell the UI is running in. This permanently disambiguates
// "the desktop build" (SQLite-backed) from a browser preview (no database),
// where passcode management and persistence are unavailable.
export const ShellBadge: React.FC = () => {
  if (hasDesktopBridge()) {
    return (
      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded tracking-wider">
        DESKTOP APP • LOCAL DATABASE
      </span>
    );
  }
  if (isElectronShell()) {
    return (
      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 bg-rose-50 text-rose-800 border border-rose-200 rounded tracking-wider">
        SHELL ERROR • BRIDGE MISSING
      </span>
    );
  }
  return (
    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded tracking-wider">
      BROWSER PREVIEW • NO DATABASE
    </span>
  );
};
