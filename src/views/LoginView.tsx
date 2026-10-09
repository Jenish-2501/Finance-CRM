import React, { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { ShellBadge } from '../components/common/ShellBadge';

interface LoginViewProps {
  onLogin: () => void;
}

// Web-dev fallback only (no Electron main process, hence no database).
// The desktop app ALWAYS verifies against the scrypt hash in SQLite.
const DEV_FALLBACK_PASSCODE = '1234';

const ERROR_COPY: Record<string, string> = {
  INCORRECT: 'Incorrect passcode. Please try again.',
  INVALID: 'Passcode must be 4-64 characters.',
  LOCKED: 'Too many failed attempts. Please wait a minute and try again.',
};

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (checking || passcode.length === 0) return;
    setChecking(true);
    setError(null);
    try {
      const bridge = window.electronAPI?.passcode;
      const legacy = window.electronAPI?.auth;
      if (bridge) {
        const result = await bridge.verify(passcode);
        if (result.ok) {
          onLogin();
        } else {
          setError(ERROR_COPY[result.error ?? 'INCORRECT'] ?? ERROR_COPY.INCORRECT);
        }
      } else if (legacy) {
        const result = await legacy.login(passcode);
        if (result.ok) {
          onLogin();
        } else {
          setError(ERROR_COPY[result.error ?? 'INCORRECT'] ?? ERROR_COPY.INCORRECT);
        }
      } else {
        // Browser dev mode without the desktop shell.
        if (passcode === DEV_FALLBACK_PASSCODE) {
          onLogin();
        } else {
          setError(ERROR_COPY.INCORRECT);
        }
      }
    } catch {
      setError('Desktop app is out of date. Please fully quit and restart AccuLedger, then try again.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-neutral-100 p-6 font-sans text-neutral-900">
      <div className="w-full max-w-sm bg-white border border-neutral-200 rounded-lg shadow-2xs overflow-hidden">
        {/* Brand header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-neutral-200 bg-neutral-50/70">
          <div className="w-9 h-9 bg-neutral-900 text-white font-bold flex items-center justify-center rounded text-sm font-mono">
            ₹
          </div>
          <div>
            <div className="text-sm font-bold text-neutral-950 tracking-wide">AccuLedger</div>
            <div className="text-[10px] text-neutral-500 font-mono uppercase tracking-wider">
              Offline Billing Ledger
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-xl font-bold tracking-tight text-neutral-950">Sign in</h1>
              <ShellBadge />
            </div>
            <p className="text-xs text-neutral-500 font-mono mt-1">
              Enter your passcode to open the billing counter
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800"
            >
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="login-passcode"
              className="text-xs font-semibold text-neutral-800 flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5 text-neutral-500" />
              Passcode
            </label>
            <div className="relative">
              <input
                id="login-passcode"
                type={showPasscode ? 'text' : 'password'}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter passcode"
                autoFocus
                autoComplete="current-password"
                className="w-full px-3 py-2 pr-10 text-sm bg-white border border-neutral-300 rounded text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-900 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPasscode((v) => !v)}
                aria-label={showPasscode ? 'Hide passcode' : 'Show passcode'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-700 rounded"
              >
                {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-neutral-500 font-mono">
              Initial default is 1234 — change it in Settings.
            </p>
          </div>

          <button
            type="submit"
            disabled={passcode.length === 0 || checking}
            className="w-full py-2 px-4 bg-neutral-900 text-white rounded text-xs font-semibold hover:bg-neutral-800 transition-colors disabled:opacity-40"
          >
            {checking ? 'Checking…' : 'Unlock App'}
          </button>
        </form>
      </div>
    </div>
  );
};
