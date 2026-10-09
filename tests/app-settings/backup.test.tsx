// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { AppSettingsView } from '../../src/views/AppSettingsView';

afterEach(() => {
  cleanup();
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
});

function stubBridge(exportBackup: () => Promise<{ ok: boolean; file?: string; error?: string }>) {
  (window as unknown as { electronAPI: unknown }).electronAPI = { maintenance: { exportBackup } };
}

describe('App Settings backup download', () => {
  it('renders the backup card and explains full data + structure', () => {
    render(<AppSettingsView />);
    expect(screen.getByText('App Settings')).toBeDefined();
    expect(screen.getByText('Download Full Backup')).toBeDefined();
  });

  it('without the desktop bridge explains browser preview cannot back up', async () => {
    render(<AppSettingsView />);
    fireEvent.click(screen.getByText('Download Full Backup'));
    expect(await screen.findByRole('alert')).toBeDefined();
  });

  it('shows the saved path on success', async () => {
    stubBridge(async () => ({ ok: true, file: 'D:/backups/app-2026.sqlite' }));
    render(<AppSettingsView />);
    fireEvent.click(screen.getByText('Download Full Backup'));
    expect(await screen.findByRole('status')).toBeDefined();
    expect(screen.getByText(/D:\/backups\/app-2026\.sqlite/)).toBeDefined();
  });

  it('stays silent when the save dialog is dismissed', async () => {
    stubBridge(async () => ({ ok: false, error: 'CANCELLED' }));
    render(<AppSettingsView />);
    fireEvent.click(screen.getByText('Download Full Backup'));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an error when the backup fails', async () => {
    stubBridge(async () => ({ ok: false }));
    render(<AppSettingsView />);
    fireEvent.click(screen.getByText('Download Full Backup'));
    expect(await screen.findByRole('alert')).toBeDefined();
  });
});

function stubFullBridge(impl: {
  exportBackup?: () => Promise<{ ok: boolean; file?: string; error?: string }>;
  restoreBackup?: () => Promise<{ ok: boolean; error?: string; safetyFile?: string }>;
}) {
  (window as unknown as { electronAPI: unknown }).electronAPI = { maintenance: impl };
}

describe('App Settings restore with override', () => {
  it('keeps restore locked behind an explicit confirmation checkbox', () => {
    stubFullBridge({ restoreBackup: async () => ({ ok: true }) });
    render(<AppSettingsView />);
    const button = screen.getByText('Restore from Backup…').closest('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByText(/replace all current data/));
    expect((screen.getByText('Restore from Backup…').closest('button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('without the desktop bridge explains restore needs Electron', async () => {
    render(<AppSettingsView />);
    fireEvent.click(screen.getByText(/replace all current data/));
    fireEvent.click(screen.getByText('Restore from Backup…'));
    expect(await screen.findByRole('alert')).toBeDefined();
  });

  it('on success asks to reload so screens read restored data', async () => {
    stubFullBridge({ restoreBackup: async () => ({ ok: true, safetyFile: 'backups/pre-restore.sqlite' }) });
    render(<AppSettingsView />);
    fireEvent.click(screen.getByText(/replace all current data/));
    fireEvent.click(screen.getByText('Restore from Backup…'));
    expect(await screen.findByText('Reload App Data')).toBeDefined();
  });

  it('stays silent when the open dialog is dismissed', async () => {
    stubFullBridge({ restoreBackup: async () => ({ ok: false, error: 'CANCELLED' }) });
    render(<AppSettingsView />);
    fireEvent.click(screen.getByText(/replace all current data/));
    fireEvent.click(screen.getByText('Restore from Backup…'));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Reload App Data')).toBeNull();
  });

  it('rejects invalid backup files with a plain-language error', async () => {
    stubFullBridge({ restoreBackup: async () => ({ ok: false, error: 'INVALID_BACKUP' }) });
    render(<AppSettingsView />);
    fireEvent.click(screen.getByText(/replace all current data/));
    fireEvent.click(screen.getByText('Restore from Backup…'));
    expect(await screen.findByText(/not a valid AccuLedger backup/)).toBeDefined();
  });
});
