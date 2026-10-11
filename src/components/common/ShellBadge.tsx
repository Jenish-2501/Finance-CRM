import React from 'react';
import { hasDesktopBridge, isElectronShell } from '../../utils/shellEnv';
import { Badge } from './Badge';

// Shows which shell the UI is running in. This permanently disambiguates
// "the desktop build" (SQLite-backed) from a browser preview (no database),
// where passcode management and persistence are unavailable.
// Environment semantics — intentionally NOT themed violet.
export const ShellBadge: React.FC = () => {
  if (hasDesktopBridge()) {
    return (
      <Badge variant="success" className="text-[10px] font-semibold tracking-wider">
        DESKTOP APP • LOCAL DATABASE
      </Badge>
    );
  }
  if (isElectronShell()) {
    return (
      <Badge variant="danger" className="text-[10px] font-semibold tracking-wider">
        SHELL ERROR • BRIDGE MISSING
      </Badge>
    );
  }
  return (
    <Badge variant="warning" className="text-[10px] font-semibold tracking-wider">
      BROWSER PREVIEW • NO DATABASE
    </Badge>
  );
};
