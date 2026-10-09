import React, { useState } from 'react';
import { DatabaseBackup, Download, CheckCircle2, AlertTriangle, HardDrive, RotateCcw } from 'lucide-react';
import { isElectronShell } from '../utils/shellEnv';

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
      <div className="p-5 bg-white border border-neutral-200 rounded-lg shadow-2xs">
        <h1 className="text-xl font-bold tracking-tight text-neutral-950 flex items-center gap-2">
          <HardDrive className="w-5 h-5" /> App Settings
        </h1>
        <p className="text-xs text-neutral-500 font-mono mt-0.5">
          Periodic database backups • Full data + structure snapshots
        </p>
      </div>

      <div className="bg-white border border-neutral-200 rounded-lg p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-neutral-200 pb-3">
          <DatabaseBackup className="w-4 h-4 text-neutral-600" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
            Full Database Backup
          </h2>
        </div>

        <p className="text-xs text-neutral-600 leading-relaxed">
          Downloads one file containing the <strong>entire database — every record plus the full
          table structure</strong>. Restoring it later brings back everything exactly as it was.
          Tip for periodic backups: plug in a pen drive, click below, and save the file there with
          the date in its name (e.g. onto <span className="font-mono">AccuLedger-Backup</span> folder).
        </p>

        {status && (
          <div
            role={status.kind === 'error' ? 'alert' : 'status'}
            className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
              status.kind === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border border-rose-200 text-rose-900'
            }`}
          >
            {status.kind === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="break-all">{status.text}</span>
          </div>
        )}

        <div>
          <button
            onClick={() => void handleDownloadBackup()}
            disabled={busy}
            className="px-5 py-2 font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-2 text-xs"
          >
            <Download className="w-4 h-4" />
            <span>{busy ? 'Preparing backup…' : 'Download Full Backup'}</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-rose-200 rounded-lg p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-rose-100 pb-3">
          <AlertTriangle className="w-4 h-4 text-rose-600" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
            Restore Database from Backup — Replaces All Current Data
          </h2>
        </div>

        <p className="text-xs text-neutral-600 leading-relaxed">
          Pick a backup file and the app <strong>overrides everything currently stored</strong> with
          it. Before replacing, your present database is automatically safety-backed-up. After a
          successful restore, reload the app so every screen reads the restored data.
        </p>

        {restored ? (
          <div className="space-y-3">
            <div
              role="status"
              className="p-3 rounded-lg text-xs flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-900"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Database restored. Your previous data was safety-backed-up automatically. Reload now to use the restored data.</span>
            </div>
            <button
              onClick={handleReload}
              className="px-5 py-2 font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors shadow-2xs flex items-center gap-2 text-xs"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reload App Data</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {restoreStatus && (
              <div
                role="alert"
                className="p-3 rounded-lg text-xs flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-900"
              >
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="break-all">{restoreStatus.text}</span>
              </div>
            )}

            <label className="flex items-start gap-2 text-xs text-neutral-700 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmRestore}
                onChange={(e) => setConfirmRestore(e.target.checked)}
                className="mt-0.5"
              />
              <span>I understand this will <strong>replace all current data</strong> with the backup file.</span>
            </label>

            <div>
              <button
                onClick={() => void handleRestoreBackup()}
                disabled={!confirmRestore || restoring}
                className="px-5 py-2 font-semibold bg-rose-600 text-white rounded hover:bg-rose-700 transition-colors shadow-2xs disabled:opacity-40 flex items-center gap-2 text-xs"
              >
                <DatabaseBackup className="w-4 h-4" />
                <span>{restoring ? 'Restoring…' : 'Restore from Backup…'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
