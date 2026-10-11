import React, { useState } from 'react';
import { DatabaseBackup, Download, CheckCircle2, AlertTriangle, HardDrive, RotateCcw, Palette } from 'lucide-react';
import { isElectronShell } from '../utils/shellEnv';
import { ThemeToggle, Alert, Button, Card, CardTitle } from '../components/ui';

export const AppSettingsView: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [restored, setRestored] = useState(false);

  const restoreErrorText = (error?: string): string => {
    if (error === 'INVALID_BACKUP') return 'That file is not a valid AccuLedger backup. Pick a .sqlite backup file created by this app.';
    if (error === 'NO_WINDOW' || error === 'NO_ACTIVE_DB') return 'App database unavailable. Restart the app and try again.';
    return 'Restore failed — your current data is untouched. Try again or pick a different backup file.';
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
          <HardDrive className="w-5 h-5" /> App Settings
        </h1>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">
          Periodic database backups • Full data + structure snapshots
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-primary" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">Appearance</h2>
          </div>
          <ThemeToggle />
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Switch between light and dark. Legal documents (invoices, challans, ledgers) always stay black-on-white for print parity.
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <DatabaseBackup className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Full Database Backup
          </h2>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Downloads one file containing the <strong>entire database — every record plus the full
          table structure</strong>. Restoring it later brings back everything exactly as it was.
          Tip for periodic backups: plug in a pen drive, click below, and save the file there with
          the date in its name (e.g. onto <span className="font-mono">AccuLedger-Backup</span> folder).
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
            <span>{busy ? 'Preparing backup…' : 'Download Full Backup'}</span>
          </button>
        </div>
      </div>

      <Card className="border-destructive/25 p-5 space-y-4 shadow-2xs">
        <div className="flex items-center gap-2 border-b border-destructive/20 pb-3">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <CardTitle>
            Restore Database from Backup — Replaces All Current Data
          </CardTitle>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Pick a backup file and the app <strong>overrides everything currently stored</strong> with
          it. Before replacing, your present database is automatically safety-backed-up. After a
          successful restore, reload the app so every screen reads the restored data.
        </p>

        {restored ? (
          <div className="space-y-3">
            <Alert tone="success" role="status">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Database restored. Your previous data was safety-backed-up automatically. Reload now to use the restored data.</span>
              </div>
            </Alert>
            <Button variant="primary" size="md" onClick={handleReload} className="px-5 py-2 text-xs">
              <RotateCcw className="w-4 h-4" />
              <span>Reload App Data</span>
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
              <span>I understand this will <strong>replace all current data</strong> with the backup file.</span>
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
                <span>{restoring ? 'Restoring…' : 'Restore from Backup…'}</span>
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
