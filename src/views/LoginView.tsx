import React, { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { ShellBadge } from '../components/common/ShellBadge';
import { useAccountingStore } from '../store/accountingStore';
import { useT, type TKey } from '../i18n';

interface LoginViewProps {
  /** Role carried from the verified passcode: 'super' (owner) or 'counter'. */
  onLogin: (role: 'super' | 'counter') => void;
}

// Web-dev fallback only (no Electron main process, hence no database).
// The desktop app ALWAYS verifies against the scrypt hash in SQLite.
const DEV_FALLBACK_PASSCODE = '1234';
const DEV_FALLBACK_COUNTER_PASSCODE = '2222';

const ERROR_KEYS: Record<string, TKey> = {
  INCORRECT: 'login.errIncorrect',
  INVALID: 'login.errInvalid',
  LOCKED: 'login.errLocked',
  INCORRECT_CURRENT: 'login.errIncorrect',
};

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const { t } = useT();
  const { businessSettings } = useAccountingStore();
  const logoDataUrl = businessSettings.logo_data || null;
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const errText = (code?: string): string =>
    t(ERROR_KEYS[code ?? 'INCORRECT'] ?? 'login.errIncorrect');

  const roleOf = (code: string): 'super' | 'counter' =>
    code === DEV_FALLBACK_COUNTER_PASSCODE ? 'counter' : 'super';

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
          onLogin(result.role === 'counter' ? 'counter' : 'super');
        } else {
          setError(errText(result.error));
        }
      } else if (legacy) {
        const result = await legacy.login(passcode);
        if (result.ok) {
          onLogin(result.role === 'counter' ? 'counter' : 'super');
        } else {
          setError(errText(result.error));
        }
      } else {
        // Browser dev mode without the desktop shell.
        if (passcode === DEV_FALLBACK_PASSCODE || passcode === DEV_FALLBACK_COUNTER_PASSCODE) {
          onLogin(roleOf(passcode));
        } else {
          setError(t('login.errIncorrect'));
        }
      }
    } catch {
      setError(t('login.errStale'));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-background p-6 font-sans text-foreground">
      <div className="w-full max-w-3xl bg-card border border-border rounded-lg shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-2">
        {/* Left: business brand panel — same logo as PDF watermark */}
        <div className="flex flex-col items-center justify-center gap-4 px-8 py-10 border-b md:border-b-0 md:border-r border-border bg-muted/70 text-center">
          {logoDataUrl ? (
            <img
              src={logoDataUrl}
              alt={businessSettings.business_name}
              className="max-w-full max-h-48 object-contain"
            />
          ) : (
            <div className="w-16 h-16 bg-primary text-primary-foreground font-bold flex items-center justify-center rounded-md text-2xl font-mono">
              ₹
            </div>
          )}
          <div>
            <div className="text-base font-bold text-foreground tracking-wide">
              {businessSettings.business_name || t('common.appName')}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mt-1">
              {t('login.brandSub')}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">{t('login.title')}</h1>
              <ShellBadge />
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-1">
              {t('login.subtitle')}
            </p>
          </div>

          {error && (
            <div role="alert" className="p-3 bg-destructive/10 border border-destructive/25 rounded-md text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="login-passcode"
              className="text-xs font-semibold text-foreground flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5 text-muted-foreground" />
              {t('login.passcode')}
            </label>
            <div className="relative">
              <input
                id="login-passcode"
                type={showPasscode ? 'text' : 'password'}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder={t('login.placeholder')}
                autoFocus
                autoComplete="current-password"
                className="w-full px-3 py-2 pr-10 text-sm bg-card border border-input rounded-md text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPasscode((v) => !v)}
                aria-label={showPasscode ? t('login.hidePasscode') : t('login.showPasscode')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded-md"
              >
                {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground font-mono">
              {t('login.hint')}
            </p>
          </div>

          <button
            type="submit"
            disabled={passcode.length === 0 || checking}
            className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            {checking ? t('login.checking') : t('login.unlock')}
          </button>
        </form>
      </div>
    </div>
  );
};
