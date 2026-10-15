import React, { useState } from 'react';
import { DatabaseBackup, Download, CheckCircle2, AlertTriangle, HardDrive, RotateCcw, Palette } from 'lucide-react';
import { isElectronShell } from '../utils/shellEnv';
import { ThemeToggle, Alert, Button, Card, CardTitle } from '../components/ui';
import { LanguageToggle, useT } from '../i18n';

export const AppSettingsView: React.FC = () => {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [restored, setRestored] = useState(false);

  const restoreErrorText = (error?: string): string => {
    if (error === 'INVALID_BACKUP') return t('appSettings.errInvalidBackup');
    if (error === 'NO_WINDOW' || error === 'NO_ACTIVE_DB') return t('appSettings.errNoDb');
    return t('appSettings.errRestoreFailed');
  };

  const handleRestoreBackup = async () => {
    const bridge = window.electronAPI?.maintenance;
    if (!bridge?.restoreBackup) {
      setRestoreStatus({
        kind: 'error',
        text: isElectronShell()
          ? 'Desktop shell failed to load its database bridge. Fully quit and relaunch the app.'
          : 'Restore needs the desktop app — open AccuLedger in Electron, not the browser preview.',
      });
      return;
    }
    setRestoring(true);
    setRestoreStatus(null);
    try {
      const result = await bridge.restoreBackup();
      if (result.ok) {
        setRestored(true);
      } else if (result.error !== 'CANCELLED') {
        setRestoreStatus({ kind: 'error', text: restoreErrorText(result.error) });
      }
    } catch {
      setRestoreStatus({
        kind: 'error',
        text: 'Desktop app is out of date. Please fully quit and restart AccuLedger, then try again.',
      });
    } finally {
      setRestoring(false);
    }
  };

  const handleReload = () => {
    window.location.reload();
  };

  const handleDownloadBackup = async () => {
    const bridge = window.electronAPI?.maintenance;
    if (!bridge?.exportBackup) {
      setStatus({
        kind: 'error',
        text: isElectronShell()
          ? 'Desktop shell failed to load its database bridge. Fully quit and relaunch the app.'
          : 'Backups need the desktop app — open AccuLedger in Electron, not the browser preview.',
      });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const result = await bridge.exportBackup();
      if (result.ok) {
        setStatus({
          kind: 'success',
          text: `Full backup saved${result.file ? ` to ${result.file}` : ''}. It contains the complete database — all data and structure.`,
        });
      } else if (result.error !== 'CANCELLED') {
        setStatus({
          kind: 'error',
          text: 'Backup failed. Make sure the destination drive is connected and try again.',
        });
      }
    } catch {
      setStatus({
        kind: 'error',
        text: 'Desktop app is out of date. Please fully quit and restart AccuLedger, then try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-5 bg-card border border-border rounded-lg shadow-2xs">
        <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <HardDrive className="w-5 h-5" /> {t('appSettings.title')}
        </h1>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">
          {t('appSettings.subtitle')}
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-primary" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">{t('appSettings.appearance')}</h2>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('appSettings.appearanceNote')}
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <DatabaseBackup className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
            {t('appSettings.backupTitle')}
          </h2>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('appSettings.backupBodyPre')} <strong>{t('appSettings.backupBodyStrong')}</strong>
          {t('appSettings.backupBodyPost')} <span className="font-mono">{t('appSettings.backupFolder')}</span> {t('appSettings.backupBodyEnd')}
        </p>

        {status && (
          <Alert tone={status.kind === 'success' ? 'success' : 'destructive'} role={status.kind === 'success' ? 'status' : 'alert'}>
            <div className="flex items-center gap-2">
            {status.kind === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span className="break-all">{status.text}</span>
            </div>
          </Alert>
        )}

        <div>
          <button
            onClick={() => void handleDownloadBackup()}
            disabled={busy}
            className="px-5 py-2 font-semibold bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-2 text-xs"
          >
            <Download className="w-4 h-4" />
            <span>{busy ? t('appSettings.preparing') : t('appSettings.downloadBackup')}</span>
          </button>
        </div>
      </div>

      <Card className="border-destructive/25 p-5 space-y-4 shadow-2xs">
        <div className="flex items-center gap-2 border-b border-destructive/20 pb-3">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <CardTitle>
            {t('appSettings.restoreTitle')}
          </CardTitle>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('appSettings.restoreBodyPre')} <strong>{t('appSettings.restoreBodyStrong')}</strong> {t('appSettings.restoreBodyPost')}
        </p>

        {restored ? (
          <div className="space-y-3">
            <Alert tone="success" role="status">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{t('appSettings.restored')}</span>
              </div>
            </Alert>
            <Button variant="primary" size="md" onClick={handleReload} className="px-5 py-2 text-xs">
              <RotateCcw className="w-4 h-4" />
              <span>{t('appSettings.reload')}</span>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {restoreStatus && (
              <Alert tone="destructive" role="alert">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span className="break-all">{restoreStatus.text}</span>
                </div>
              </Alert>
            )}

            <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={confirmRestore}
                onChange={(e) => setConfirmRestore(e.target.checked)}
                className="mt-0.5 accent-primary"
              />
              <span>{t('appSettings.consentPre')} <strong>{t('appSettings.consentStrong')}</strong> {t('appSettings.consentPost')}</span>
            </label>

            <div>
              <Button
                variant="destructive"
                size="md"
                onClick={() => void handleRestoreBackup()}
                disabled={!confirmRestore || restoring}
                className="px-5 py-2 text-xs"
              >
                <DatabaseBackup className="w-4 h-4" />
                <span>{restoring ? t('appSettings.restoring') : t('appSettings.restoreBtn')}</span>
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
