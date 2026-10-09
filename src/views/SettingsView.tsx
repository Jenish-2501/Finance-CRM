import React, { useEffect, useRef, useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { BusinessSettings } from '../types/database';
import {
  Building2,
  Landmark,
  FileText,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  Ruler
} from 'lucide-react';
import { Modal } from '../components/common/Modal';
import { ShellBadge } from '../components/common/ShellBadge';
import { isElectronShell } from '../utils/shellEnv';

// Notified GST slabs (total %). Must stay in sync with GST_SLABS in
// electron/services/businessService.ts, which is authoritative.
const GST_SLABS = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28];

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function validateSettingsForm(form: BusinessSettings): string | null {
  const required: Array<[keyof BusinessSettings, string]> = [
    ['business_name', 'Trade business name is required.'],
    ['legal_name', 'Full legal corporate name is required.'],
    ['address', 'Registered street address is required.'],
    ['city', 'City is required.'],
    ['state', 'State is required.'],
    ['country', 'Country is required.'],
    ['postal_code', 'Postal code is required.'],
    ['phone', 'Phone is required.'],
    ['bank_name', 'Bank name is required.'],
    ['bank_account_number', 'Bank account number is required.'],
    ['ifsc', 'IFSC code is required.'],
    ['branch', 'Branch name is required.'],
    ['currency', 'Currency is required.']
  ];
  for (const [field, message] of required) {
    if (!String(form[field] ?? '').trim()) return message;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return 'Accounts email is not a valid email address.';
  }
  if (!GSTIN_RE.test(form.gst_number.trim().toUpperCase())) {
    return 'GSTIN must be 15 characters (e.g. 24AAACA9999P1Z1).';
  }
  if (!PAN_RE.test(form.pan.trim().toUpperCase())) {
    return 'Company PAN must match AAAAA9999A format (e.g. AAACA9999P).';
  }
  if (!/^(0[1-9]|[12][0-9]|3[0-8])$/.test(form.state_code.trim())) {
    return 'Home state code must be a 2-digit GST state code (01-38).';
  }
  if (form.gst_number.trim().toUpperCase().slice(0, 2) !== form.state_code.trim()) {
    return 'GSTIN state prefix does not match the home state code — intra/inter-state tax will be wrong.';
  }
  if (!form.invoice_prefix.trim() || form.invoice_prefix.length > 24) {
    return 'Invoice prefix is required (max 24 characters).';
  }
  if (!Number.isInteger(form.invoice_next_number) || form.invoice_next_number < 1) {
    return 'Next sequence number must be a whole number of 1 or more.';
  }
  if (!GST_SLABS.includes(form.default_gst_rate)) {
    return `Standard GST rate must be a notified slab: ${GST_SLABS.join(', ')}.`;
  }
  return null;
}

type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'success'; localOnly: boolean } | { status: 'error'; message: string };

export const SettingsView: React.FC = () => {
  const {
    businessSettings,
    uoms,
    saveBusinessSettings,
    refreshBusinessConfig,
    saveUom,
    setUomActive,
    resetToSeedData
  } = useAccountingStore();

  const [formData, setFormData] = useState<BusinessSettings>({ ...businessSettings });
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const [newUomCode, setNewUomCode] = useState('');
  const [newUomName, setNewUomName] = useState('');
  const [newUomDescription, setNewUomDescription] = useState('');
  const [uomBusy, setUomBusy] = useState(false);
  const [uomMessage, setUomMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const [currentPasscode, setCurrentPasscode] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [passcodeMessage, setPasscodeMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [changingPasscode, setChangingPasscode] = useState(false);

  // Load the DB-authoritative snapshot on mount (heals stale memory after an
  // out-of-band change), then keep the form in sync with committed state.
  const lastSyncedRef = useRef<string>(businessSettings.updated_at);
  useEffect(() => {
    void refreshBusinessConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (businessSettings.updated_at !== lastSyncedRef.current) {
      lastSyncedRef.current = businessSettings.updated_at;
      setFormData({ ...businessSettings });
    }
  }, [businessSettings]);

  const handleChange = (field: keyof BusinessSettings, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saveState.status === 'saving') return;
    const clientError = validateSettingsForm(formData);
    if (clientError) {
      setSaveState({ status: 'error', message: clientError });
      return;
    }
    setSaveState({ status: 'saving' });
    const result = await saveBusinessSettings(formData);
    if (result.ok) {
      lastSyncedRef.current = useAccountingStore.getState().businessSettings.updated_at;
      setSaveState({ status: 'success', localOnly: result.localOnly ?? false });
      setTimeout(() => setSaveState({ status: 'idle' }), 4000);
    } else {
      setSaveState({ status: 'error', message: result.error ?? 'Business settings could not be saved.' });
    }
  };

  const handleAddUom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uomBusy) return;
    setUomMessage(null);
    setUomBusy(true);
    try {
      const result = await saveUom({ code: newUomCode, name: newUomName, description: newUomDescription });
      if (result.ok) {
        setUomMessage({
          kind: 'success',
          text: result.localOnly
            ? `Unit ${result.uom?.code} added locally (browser preview — no database).`
            : `Unit ${result.uom?.code} saved to the database.`
        });
        setNewUomCode('');
        setNewUomName('');
        setNewUomDescription('');
      } else {
        setUomMessage({ kind: 'error', text: result.error ?? 'Unit could not be saved.' });
      }
    } finally {
      setUomBusy(false);
    }
  };

  const handleToggleUom = async (id: string, next: boolean) => {
    setUomMessage(null);
    const result = await setUomActive(id, next);
    if (!result.ok) {
      setUomMessage({ kind: 'error', text: result.error ?? 'Unit could not be updated.' });
    }
  };

  const handleConfirmReset = () => {
    resetToSeedData();
    const fresh = { ...useAccountingStore.getState().businessSettings };
    lastSyncedRef.current = fresh.updated_at;
    setFormData(fresh);
    setResetConfirmOpen(false);
  };

  const handleChangePasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasscodeMessage(null);
    if (newPasscode !== confirmPasscode) {
      setPasscodeMessage({ kind: 'error', text: 'New passcode and confirmation do not match.' });
      return;
    }
    const passcodeBridge = window.electronAPI?.passcode;
    const legacyBridge = window.electronAPI?.auth;
    if (!passcodeBridge && !legacyBridge) {
      setPasscodeMessage({
        kind: 'error',
        text: isElectronShell()
          ? 'Desktop shell failed to load its database bridge. Fully quit (end all electron processes) and relaunch the app.'
          : 'Passcode management needs the desktop app — please open AccuLedger in Electron, not the browser preview.'
      });
      return;
    }
    setChangingPasscode(true);
    try {
      const result = passcodeBridge
        ? await passcodeBridge.change(currentPasscode, newPasscode)
        : await legacyBridge!.changePasscode(currentPasscode, newPasscode);
      if (result.ok) {
        setPasscodeMessage({ kind: 'success', text: 'App passcode updated successfully.' });
        setCurrentPasscode('');
        setNewPasscode('');
        setConfirmPasscode('');
      } else if (result.error === 'INCORRECT_CURRENT') {
        setPasscodeMessage({ kind: 'error', text: 'Current passcode is incorrect.' });
      } else if (result.error === 'LOCKED') {
        setPasscodeMessage({ kind: 'error', text: 'Too many failed attempts. Please wait a minute.' });
      } else {
        setPasscodeMessage({ kind: 'error', text: 'Passcode must be 4-64 characters.' });
      }
    } catch {
      // Typically a stale main process (started before this feature was added):
      // the running Electron shell has no 'auth:changePasscode' handler yet.
      setPasscodeMessage({
        kind: 'error',
        text: 'Desktop app is out of date. Please fully quit and restart AccuLedger, then try again.'
      });
    } finally {
      setChangingPasscode(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white border border-neutral-200 rounded-lg shadow-2xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-950">Company Profile &amp; Statutory Settings</h1>
          <p className="text-xs text-neutral-500 font-mono mt-0.5">
            Legal entity parameters • Tax configuration • Banking snapshots • Demo state controls
          </p>
        </div>

        <button
          onClick={() => setResetConfirmOpen(true)}
          className="px-3.5 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded hover:bg-rose-100 transition-colors flex items-center gap-1.5 shadow-2xs"
        >
          <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
          <span>Restore Default Demo Data</span>
        </button>
      </div>

      {saveState.status === 'success' && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>
            {saveState.localOnly
              ? 'Business settings saved locally (browser preview — no database). Open the desktop app to persist them.'
              : 'Business settings saved to the database. Existing historical invoice snapshots remain unchanged.'}
          </span>
        </div>
      )}

      {saveState.status === 'error' && (
        <div
          role="alert"
          className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-lg text-xs flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-rose-600" />
          <span>{saveState.message}</span>
        </div>
      )}

      {/* Settings Form */}
      <form onSubmit={handleSave} className="space-y-6 text-xs">
        {/* Section 1: Business Identity & GST */}
        <div className="bg-white border border-neutral-200 rounded-lg p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-neutral-200 pb-3">
            <Building2 className="w-4 h-4 text-neutral-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
              Legal Business Information &amp; GST Identification
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Trade Business Name</label>
              <input
                type="text"
                required
                value={formData.business_name}
                onChange={(e) => handleChange('business_name', e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block font-semibold text-neutral-700 mb-1">Full Legal Corporate Name</label>
              <input
                type="text"
                required
                value={formData.legal_name}
                onChange={(e) => handleChange('legal_name', e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">GSTIN Number</label>
              <input
                type="text"
                required
                value={formData.gst_number}
                onChange={(e) => handleChange('gst_number', e.target.value.toUpperCase())}
                className="w-full p-2 border border-neutral-300 rounded font-mono uppercase"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Company PAN</label>
              <input
                type="text"
                required
                value={formData.pan}
                onChange={(e) => handleChange('pan', e.target.value.toUpperCase())}
                className="w-full p-2 border border-neutral-300 rounded font-mono uppercase"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Home State Code (GST)</label>
              <input
                type="text"
                required
                value={formData.state_code}
                onChange={(e) => handleChange('state_code', e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded font-mono"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Address & Contact */}
        <div className="bg-white border border-neutral-200 rounded-lg p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-neutral-200 pb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
              Registered Office Address &amp; Contact
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block font-semibold text-neutral-700 mb-1">Street Address</label>
              <input
                type="text"
                required
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">City</label>
              <input
                type="text"
                required
                value={formData.city}
                onChange={(e) => handleChange('city', e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">State</label>
              <input
                type="text"
                required
                value={formData.state}
                onChange={(e) => handleChange('state', e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Postal Code</label>
              <input
                type="text"
                required
                value={formData.postal_code}
                onChange={(e) => handleChange('postal_code', e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Phone</label>
              <input
                type="text"
                required
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Accounts Email</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Website</label>
              <input
                type="text"
                value={formData.website}
                onChange={(e) => handleChange('website', e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Banking Details for Invoices */}
        <div className="bg-white border border-neutral-200 rounded-lg p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-neutral-200 pb-3">
            <Landmark className="w-4 h-4 text-neutral-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
              Primary Banking Details (Snapshotted on Invoices)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Bank Name</label>
              <input
                type="text"
                required
                value={formData.bank_name}
                onChange={(e) => handleChange('bank_name', e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Account Number</label>
              <input
                type="text"
                required
                value={formData.bank_account_number}
                onChange={(e) => handleChange('bank_account_number', e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">IFSC Code</label>
              <input
                type="text"
                required
                value={formData.ifsc}
                onChange={(e) => handleChange('ifsc', e.target.value.toUpperCase())}
                className="w-full p-2 border border-neutral-300 rounded font-mono uppercase"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Branch Name</label>
              <input
                type="text"
                required
                value={formData.branch}
                onChange={(e) => handleChange('branch', e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Invoice Numbering & GST Default */}
        <div className="bg-white border border-neutral-200 rounded-lg p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-neutral-200 pb-3">
            <FileText className="w-4 h-4 text-neutral-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
              Invoice Auto-Numbering &amp; Statutory Tax Rates
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Invoice Prefix</label>
              <input
                type="text"
                required
                value={formData.invoice_prefix}
                onChange={(e) => handleChange('invoice_prefix', e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Next Sequence Number</label>
              <input
                type="number"
                required
                value={formData.invoice_next_number}
                onChange={(e) => handleChange('invoice_next_number', Number(e.target.value))}
                className="w-full p-2 border border-neutral-300 rounded font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Standard GST Rate (%)</label>
              <select
                required
                value={formData.default_gst_rate}
                onChange={(e) => handleChange('default_gst_rate', Number(e.target.value))}
                className="w-full p-2 border border-neutral-300 rounded font-mono bg-white"
              >
                {GST_SLABS.map((slab) => (
                  <option key={slab} value={slab}>
                    {slab}%{slab > 0 ? ` (${slab / 2}% CGST + ${slab / 2}% SGST intra-state / ${slab}% IGST inter-state)` : ' (exempt)'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={saveState.status === 'saving'}
            className="px-5 py-2 font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors shadow-2xs disabled:opacity-50"
          >
            {saveState.status === 'saving' ? 'Saving to database…' : 'Save Business Settings'}
          </button>
        </div>
      </form>

      {/* Section 5: Units of Measure (database-backed) */}
      <div className="bg-white border border-neutral-200 rounded-lg p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-neutral-200 pb-3">
          <div className="flex items-center gap-2">
            <Ruler className="w-4 h-4 text-neutral-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
              Units of Measure (Shared Billing &amp; Inventory)
            </h2>
          </div>
          <ShellBadge />
        </div>
        <p className="text-xs text-neutral-500">
          Units are stored in the database and shared by products, stock, dispatches, and invoices.
          A unit in use cannot be deactivated.
        </p>

        {uomMessage && (
          <div
            role="alert"
            className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
              uomMessage.kind === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border border-rose-200 text-rose-900'
            }`}
          >
            {uomMessage.kind === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            )}
            <span>{uomMessage.text}</span>
          </div>
        )}

        <div className="border border-neutral-200 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-neutral-50 text-neutral-600 uppercase tracking-wider text-[10px]">
                <th className="text-left px-3 py-2 font-semibold">Code</th>
                <th className="text-left px-3 py-2 font-semibold">Name</th>
                <th className="text-left px-3 py-2 font-semibold hidden sm:table-cell">Description</th>
                <th className="text-left px-3 py-2 font-semibold">Status</th>
                <th className="text-right px-3 py-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(uoms)
                .sort((a, b) => a.code.localeCompare(b.code))
                .map((u) => (
                  <tr key={u.id} className="border-t border-neutral-200">
                    <td className="px-3 py-2 font-mono font-semibold">{u.code}</td>
                    <td className="px-3 py-2">{u.name}</td>
                    <td className="px-3 py-2 text-neutral-500 hidden sm:table-cell">{u.description}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${
                          u.is_active
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-neutral-100 text-neutral-500 border-neutral-200'
                        }`}
                      >
                        {u.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void handleToggleUom(u.id, !u.is_active)}
                        className="px-2.5 py-1 text-[11px] font-medium border border-neutral-300 rounded bg-white hover:bg-neutral-50"
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <form onSubmit={handleAddUom} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block font-semibold text-neutral-700 mb-1">Code</label>
            <input
              type="text"
              required
              value={newUomCode}
              onChange={(e) => setNewUomCode(e.target.value.toUpperCase())}
              placeholder="e.g. CARTON"
              maxLength={10}
              className="w-full p-2 border border-neutral-300 rounded font-mono uppercase"
            />
          </div>
          <div>
            <label className="block font-semibold text-neutral-700 mb-1">Name</label>
            <input
              type="text"
              required
              value={newUomName}
              onChange={(e) => setNewUomName(e.target.value)}
              placeholder="e.g. Cartons"
              className="w-full p-2 border border-neutral-300 rounded"
            />
          </div>
          <div>
            <label className="block font-semibold text-neutral-700 mb-1">Description</label>
            <input
              type="text"
              value={newUomDescription}
              onChange={(e) => setNewUomDescription(e.target.value)}
              placeholder="Optional"
              className="w-full p-2 border border-neutral-300 rounded"
            />
          </div>
          <div>
            <button
              type="submit"
              disabled={uomBusy || !newUomCode.trim() || !newUomName.trim()}
              className="w-full px-4 py-2 font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors disabled:opacity-40"
            >
              {uomBusy ? 'Adding…' : 'Add Unit'}
            </button>
          </div>
        </form>
      </div>

      {/* Section 6: App Passcode */}
      <div className="bg-white border border-neutral-200 rounded-lg p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-neutral-200 pb-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-neutral-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
              App Lock Passcode
            </h2>
          </div>
          <ShellBadge />
        </div>
        <p className="text-xs text-neutral-500">
          The sign-in passcode is stored as a salted hash in the local database — never as plain
          text. Changing it takes effect on the next sign-in.
        </p>

        {passcodeMessage && (
          <div
            role="alert"
            className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
              passcodeMessage.kind === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border border-rose-200 text-rose-900'
            }`}
          >
            {passcodeMessage.kind === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            )}
            <span>{passcodeMessage.text}</span>
          </div>
        )}

        <form onSubmit={handleChangePasscode} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block font-semibold text-neutral-700 mb-1">Current Passcode</label>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPasscode}
              onChange={(e) => setCurrentPasscode(e.target.value)}
              className="w-full p-2 border border-neutral-300 rounded font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-neutral-700 mb-1">New Passcode</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPasscode}
              onChange={(e) => setNewPasscode(e.target.value)}
              className="w-full p-2 border border-neutral-300 rounded font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-neutral-700 mb-1">Confirm New Passcode</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPasscode}
              onChange={(e) => setConfirmPasscode(e.target.value)}
              className="w-full p-2 border border-neutral-300 rounded font-mono"
            />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={
                changingPasscode ||
                currentPasscode.length === 0 ||
                newPasscode.length === 0 ||
                confirmPasscode.length === 0
              }
              className="px-5 py-2 font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors shadow-2xs disabled:opacity-40"
            >
              {changingPasscode ? 'Updating…' : 'Update Passcode'}
            </button>
          </div>
        </form>
      </div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        title="Reset Entire Database to Seed State?"
        subtitle="Restores all original customers, products, stock movements, invoices, and audit logs."
        maxWidth="md"
        footer={
          <>
            <button
              onClick={() => setResetConfirmOpen(false)}
              className="px-3.5 py-1.5 text-xs text-neutral-700 border border-neutral-300 rounded bg-white"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmReset}
              className="px-4 py-1.5 text-xs font-semibold bg-rose-600 text-white rounded hover:bg-rose-700"
            >
              Confirm Full Reset
            </button>
          </>
        }
      >
        <p className="text-xs text-neutral-600 leading-relaxed">
          This restores the prototype to its default seeded relational contract (ABC Industries Pvt Ltd, 9 UOMs, 5 customers, 10 products, stock receipts, and demo dispatches).
        </p>
      </Modal>
    </div>
  );
};
