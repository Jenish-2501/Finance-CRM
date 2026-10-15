import React, { useEffect, useRef, useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { BusinessSettings } from '../types/database';
import { getFyForDate } from '../utils/calculations';
import {
  Building2,
  Landmark,
  FileText,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  Ruler,
  Image as ImageIcon
} from 'lucide-react';
import { Modal } from '../components/common/Modal';
import { ShellBadge } from '../components/common/ShellBadge';
import { Alert, Button, Card, CardTitle, Input, Label, PageHeader, Select, TableShell, Table, THead, TBody, TR, TH, TD, Tabs } from '../components/ui';
import { LanguageSettingsView } from './settings/LanguageSettingsView';
import { useT } from '../i18n';
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
  if (
    !Number.isInteger(form.invoice_start_number) ||
    form.invoice_start_number < 1 ||
    form.invoice_start_number > 999999999
  ) {
    return 'FY start number must be a whole number of 1 or more.';
  }
  if (!GST_SLABS.includes(form.default_gst_rate)) {
    return `Standard GST rate must be a notified slab: ${GST_SLABS.join(', ')}.`;
  }
  return null;
}

type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'success'; localOnly: boolean } | { status: 'error'; message: string };

export const SettingsView: React.FC = () => {
  const { t } = useT();
  const {
    businessSettings,
    uoms,
    invoiceSeries,
    saveBusinessSettings,
    refreshBusinessConfig,
    saveUom,
    setUomActive,
    startNewFySeries,
    setSeriesNextNumber,
    resetToSeedData
  } = useAccountingStore();

  const [formData, setFormData] = useState<BusinessSettings>({ ...businessSettings });
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  // Sub-route under Settings: business profile vs. Gujarati wording editor.
  const [settingsTab, setSettingsTab] = useState<'business' | 'language'>('business');
  const [seriesDraft, setSeriesDraft] = useState<string | null>(null);
  const [seriesMessage, setSeriesMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [custNextDraft, setCustNextDraft] = useState<string | null>(null);
  const [custNextMessage, setCustNextMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [docNextDraft, setDocNextDraft] = useState<string | null>(null);
  const [docNextMessage, setDocNextMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Business logo (PDF watermark): pending file choice, persisted separately.
  const [logoDraft, setLogoDraft] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoMessage, setLogoMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const logoEffective = logoDraft ?? (businessSettings.logo_data || '');
  const MAX_LOGO_BYTES = 1024 * 1024;

  const handleLogoFile = (file: File | undefined) => {
    setLogoMessage(null);
    if (!file) return;
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      setLogoMessage({ kind: 'error', text: t('settings.logoInvalid') });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoMessage({ kind: 'error', text: t('settings.logoTooBig') });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl.startsWith('data:image/')) {
        setLogoMessage({ kind: 'error', text: t('settings.logoInvalid') });
        return;
      }
      setLogoDraft(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const persistLogo = async (value: string) => {
    if (logoBusy) return;
    setLogoMessage(null);
    setLogoBusy(true);
    try {
      const result = await saveBusinessSettings({ logo_data: value });
      if (result.ok) {
        setLogoDraft(null);
        if (logoFileRef.current) logoFileRef.current.value = '';
        setLogoMessage({
          kind: 'success',
          text: result.localOnly ? t('settings.savedLocal') : t('settings.savedDb')
        });
      } else {
        setLogoMessage({ kind: 'error', text: result.error || t('settings.logoInvalid') });
      }
    } finally {
      setLogoBusy(false);
    }
  };

  const currentFy = getFyForDate(new Date().toISOString());
  const currentSeries = Object.values(invoiceSeries).find((s) => s.fy === currentFy) || null;
  const seriesList = Object.values(invoiceSeries).sort((a, b) => b.fy.localeCompare(a.fy));

  const handleSaveSeriesNext = () => {
    const next = Number(seriesDraft);
    const result = setSeriesNextNumber(currentFy, next);
    if (!result.success) {
      setSeriesMessage({ kind: 'error', text: result.error || 'Could not update.' });
      return;
    }
    setSeriesDraft(null);
    setSeriesMessage({ kind: 'success', text: `FY ${currentFy} continues from ${next}.` });
  };

  const handleStartNewFy = () => {
    const result = startNewFySeries();
    setSeriesMessage(
      result.existed
        ? { kind: 'success', text: `FY ${result.fy} series already exists — continuing from it.` }
        : { kind: 'success', text: `FY ${result.fy} series started at ${businessSettings.invoice_start_number}.` }
    );
  };

  const handleSaveCustomerNext = async () => {
    const next = Number(custNextDraft);
    if (!Number.isInteger(next) || next < 1 || next > 999999999) {
      setCustNextMessage({ kind: 'error', text: 'Next customer number must be a whole number of 1 or more.' });
      return;
    }
    const result = await saveBusinessSettings({ customer_next_number: next });
    if (!result.ok) {
      setCustNextMessage({ kind: 'error', text: result.error || 'Could not update.' });
      return;
    }
    setCustNextDraft(null);
    setCustNextMessage({ kind: 'success', text: `Next auto customer number is ${next}.` });
  };

  const handleSaveDocumentNext = async () => {
    const next = Number(docNextDraft);
    if (!Number.isInteger(next) || next < 1 || next > 999999999) {
      setDocNextMessage({ kind: 'error', text: 'Next document number must be a whole number of 1 or more.' });
      return;
    }
    const result = await saveBusinessSettings({ document_next_number: next });
    if (!result.ok) {
      setDocNextMessage({ kind: 'error', text: result.error || 'Could not update.' });
      return;
    }
    setDocNextDraft(null);
    setDocNextMessage({ kind: 'success', text: `Next dispatch document number is ${next} (shared by challans and returns).` });
  };

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
      <PageHeader
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
        actions={
          <Button variant="destructive-outline" size="sm" onClick={() => setResetConfirmOpen(true)}>
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('settings.restoreDemo')}</span>
          </Button>
        }
      />

      {/* Sub-routes: business profile | language wording (DB-backed) */}
      <Tabs
        ariaLabel={t('settings.title')}
        activeId={settingsTab}
        onSelect={(id) => setSettingsTab(id as 'business' | 'language')}
        tabs={[
          { id: 'business', label: t('settings.tabBusiness') },
          { id: 'language', label: t('settings.tabLanguage') },
        ]}
      />

      {settingsTab === 'language' ? (
        <LanguageSettingsView />
      ) : (
      <>
      {saveState.status === 'success' && (
        <Alert tone="success">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {saveState.localOnly
                ? t('settings.savedLocal')
                : t('settings.savedDb')}
            </span>
          </div>
        </Alert>
      )}

      {saveState.status === 'error' && (
        <Alert tone="destructive">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>{saveState.message}</span>
          </div>
        </Alert>
      )}

      {/* Settings Form */}
      <form onSubmit={handleSave} className="space-y-6 text-xs">
        {/* Section 1: Business Identity & GST */}
        <div className="bg-card border border-border rounded-lg p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
              {t('settings.secLegal')}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="mb-1">{t('settings.fBizName')}</Label>
              <Input
                type="text"
                required
                value={formData.business_name}
                onChange={(e) => handleChange('business_name', e.target.value)}
                className="w-full"
              />
            </div>

            <div className="md:col-span-2">
              <Label className="mb-1">{t('settings.fLegalName')}</Label>
              <Input
                type="text"
                required
                value={formData.legal_name}
                onChange={(e) => handleChange('legal_name', e.target.value)}
                className="w-full"
              />
            </div>

            <div>
              <Label className="mb-1">{t('settings.fGstinNum')}</Label>
              <Input
                type="text"
                required
                value={formData.gst_number}
                onChange={(e) => handleChange('gst_number', e.target.value.toUpperCase())}
                className="w-full font-mono uppercase"
              />
            </div>

            <div>
              <Label className="mb-1">{t('settings.fPanNum')}</Label>
              <Input
                type="text"
                required
                value={formData.pan}
                onChange={(e) => handleChange('pan', e.target.value.toUpperCase())}
                className="w-full font-mono uppercase"
              />
            </div>

            <div>
              <Label className="mb-1">{t('settings.fHomeState')}</Label>
              <Input
                type="text"
                required
                value={formData.state_code}
                onChange={(e) => handleChange('state_code', e.target.value)}
                className="w-full font-mono"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Address & Contact */}
        <div className="bg-card border border-border rounded-lg p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
              {t('settings.secAddress')}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label className="mb-1">{t('settings.fStreet')}</Label>
              <Input
                type="text"
                required
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                className="w-full"
              />
            </div>

            <div>
              <Label className="mb-1">{t('settings.fCityB')}</Label>
              <Input
                type="text"
                required
                value={formData.city}
                onChange={(e) => handleChange('city', e.target.value)}
                className="w-full"
              />
            </div>

            <div>
              <Label className="mb-1">{t('settings.fStateB')}</Label>
              <Input
                type="text"
                required
                value={formData.state}
                onChange={(e) => handleChange('state', e.target.value)}
                className="w-full"
              />
            </div>

            <div>
              <Label className="mb-1">{t('settings.fPostal')}</Label>
              <Input
                type="text"
                required
                value={formData.postal_code}
                onChange={(e) => handleChange('postal_code', e.target.value)}
                className="w-full font-mono"
              />
            </div>

            <div>
              <Label className="mb-1">{t('settings.fPhone')}</Label>
              <Input
                type="text"
                required
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                className="w-full font-mono"
              />
            </div>

            <div>
              <Label className="mb-1">{t('settings.fEmailAcct')}</Label>
              <Input
                type="email"
                required
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                className="w-full"
              />
            </div>

            <div>
              <Label className="mb-1">{t('settings.fWebsite')}</Label>
              <Input
                type="text"
                value={formData.website}
                onChange={(e) => handleChange('website', e.target.value)}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Banking Details for Invoices */}
        <div className="bg-card border border-border rounded-lg p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Landmark className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
              {t('settings.secBank')}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label className="mb-1">{t('settings.fBankName')}</Label>
              <Input
                type="text"
                required
                value={formData.bank_name}
                onChange={(e) => handleChange('bank_name', e.target.value)}
                className="w-full"
              />
            </div>

            <div>
              <Label className="mb-1">{t('settings.fAcctNum')}</Label>
              <Input
                type="text"
                required
                value={formData.bank_account_number}
                onChange={(e) => handleChange('bank_account_number', e.target.value)}
                className="w-full font-mono"
              />
            </div>

            <div>
              <Label className="mb-1">{t('settings.fIfsc')}</Label>
              <Input
                type="text"
                required
                value={formData.ifsc}
                onChange={(e) => handleChange('ifsc', e.target.value.toUpperCase())}
                className="w-full font-mono uppercase"
              />
            </div>

            <div>
              <Label className="mb-1">{t('settings.fBranch')}</Label>
              <Input
                type="text"
                required
                value={formData.branch}
                onChange={(e) => handleChange('branch', e.target.value)}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Section 4: FY Numbering & GST Default */}
        <div className="bg-card border border-border rounded-lg p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
              {t('settings.secFy')}
            </h2>
          </div>

          <p className="text-[11px] text-muted-foreground">
            {t('settings.fyNote2')}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-1">{t('settings.fFyStart')}</Label>
              <Input
                type="number"
                required
                min={1}
                value={formData.invoice_start_number}
                onChange={(e) => handleChange('invoice_start_number', Number(e.target.value))}
                className="w-full font-mono"
              />
            </div>

            <div>
              <Label className="mb-1">{t('settings.gstRate')}</Label>
              <Select
                required
                value={formData.default_gst_rate}
                onChange={(e) => handleChange('default_gst_rate', Number(e.target.value))}
                className="w-full font-mono"
              >
                {GST_SLABS.map((slab) => (
                  <option key={slab} value={slab}>
                    {slab > 0 ? t('settings.slabRate', { slab, half: slab / 2 }) : t('settings.slabExempt', { slab })}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="submit" variant="primary" size="md" disabled={saveState.status === 'saving'} className="px-5 py-2">
            {saveState.status === 'saving' ? t('settings.saving') : t('settings.save')}
          </Button>
        </div>
      </form>

      {/* Business logo: stored in the database, watermarked on every PDF */}
      <Card className="p-5 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-muted-foreground" />
            <CardTitle>{t('settings.logoTitle')}</CardTitle>
          </div>
          <ShellBadge />
        </div>
        <p className="text-xs text-muted-foreground">
          {t('settings.logoNote')}
        </p>

        {logoMessage && (
          <Alert tone={logoMessage.kind === 'success' ? 'success' : 'destructive'}>
            <div className="flex items-center gap-2">
              {logoMessage.kind === 'success' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              <span>{logoMessage.text}</span>
            </div>
          </Alert>
        )}

        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className="w-36 h-36 shrink-0 rounded-md border border-border bg-muted flex items-center justify-center overflow-hidden">
            {logoEffective ? (
              <img src={logoEffective} alt={t('settings.logoTitle')} className="max-w-full max-h-full object-contain" />
            ) : (
              <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
            )}
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <Label className="mb-1 sr-only">{t('settings.logoChoose')}</Label>
              <input
                ref={logoFileRef}
                type="file"
                accept="image/png,image/jpeg"
                aria-label={t('settings.logoChoose')}
                onChange={(e) => {
                  handleLogoFile(e.target.files?.[0]);
                }}
                className="bg-card text-foreground border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring disabled:opacity-50 px-3 py-1.5 text-xs font-sans w-full"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                variant="primary"
                size="md"
                disabled={logoBusy || logoDraft === null}
                onClick={() => void persistLogo(logoDraft ?? '')}
                className="px-4 py-2"
              >
                {logoBusy ? t('settings.saving') : t('settings.logoSave')}
              </Button>
              {logoEffective && (
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  disabled={logoBusy}
                  onClick={() => void persistLogo('')}
                  className="px-4 py-2"
                >
                  {t('settings.logoRemove')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* FY invoice series: live counters, rollover, locked history */}
      <Card className="p-5 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <CardTitle>{t('settings.fyTitle', { fy: currentFy })}</CardTitle>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={handleStartNewFy}>
            {t('settings.startNewFy')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('settings.fyNote')}
        </p>

        {seriesMessage && (
          <Alert tone={seriesMessage.kind === 'success' ? 'success' : 'destructive'}>
            <div className="flex items-center gap-2">
              {seriesMessage.kind === 'success' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              <span>{seriesMessage.text}</span>
            </div>
          </Alert>
        )}

        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div>
            <Label className="mb-1">{t('settings.nextNumber', { fy: currentFy })}</Label>
            <Input
              type="number"
              min={1}
              value={seriesDraft ?? String(currentSeries?.next_number ?? businessSettings.invoice_start_number)}
              onChange={(e) => setSeriesDraft(e.target.value)}
              className="w-40 font-mono"
            />
          </div>
          <Button type="button" variant="primary" size="md" onClick={handleSaveSeriesNext} className="px-4 py-2">
            {t('settings.saveCounter')}
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end gap-3 pt-1">
          <div>
            <Label className="mb-1">{t('settings.custNext')}</Label>
            <Input
              type="number"
              min={1}
              value={custNextDraft ?? String(businessSettings.customer_next_number)}
              onChange={(e) => setCustNextDraft(e.target.value)}
              className="w-40 font-mono"
            />
          </div>
          <Button type="button" variant="secondary" size="md" onClick={() => void handleSaveCustomerNext()} className="px-4 py-2">
            {t('common.save')}
          </Button>
          {custNextMessage && (
            <span className={`text-xs ${custNextMessage.kind === 'success' ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive'}`}>
              {custNextMessage.text}
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end gap-3 pt-1">
          <div>
            <Label className="mb-1">{t('settings.docNext')}</Label>
            <Input
              type="number"
              min={1}
              value={docNextDraft ?? String(businessSettings.document_next_number)}
              onChange={(e) => setDocNextDraft(e.target.value)}
              className="w-40 font-mono"
            />
          </div>
          <Button type="button" variant="secondary" size="md" onClick={() => void handleSaveDocumentNext()} className="px-4 py-2">
            {t('common.save')}
          </Button>
          {docNextMessage && (
            <span className={`text-xs ${docNextMessage.kind === 'success' ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive'}`}>
              {docNextMessage.text}
            </span>
          )}
        </div>

        <TableShell>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH className="text-left">{t('settings.thFy')}</TH>
                <TH className="text-right">{t('settings.thStart')}</TH>
                <TH className="text-right">{t('settings.thNext')}</TH>
                <TH className="text-left">{t('settings.thStatus')}</TH>
              </TR>
            </THead>
            <TBody>
              {seriesList.length === 0 ? (
                <tr>
                  <TD colSpan={4} className="text-muted-foreground">
                    {t('settings.noSeries')}
                  </TD>
                </tr>
              ) : (
                seriesList.map((s) => (
                  <TR key={s.id} className="border-t border-border hover:bg-transparent">
                    <TD className="font-mono font-semibold">{s.fy}</TD>
                    <TD className="font-mono text-right">{s.start_number}</TD>
                    <TD className="font-mono text-right">{s.next_number}</TD>
                    <TD>
                      <span
                        className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md border ${
                          s.fy === currentFy
                            ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/25'
                            : 'bg-muted text-muted-foreground border-border'
                        }`}
                      >
                        {s.fy === currentFy ? t('settings.current') : t('settings.locked')}
                      </span>
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </TableShell>
      </Card>

      {/* Section 5: Units of Measure (database-backed) */}
      <Card className="p-5 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Ruler className="w-4 h-4 text-muted-foreground" />
            <CardTitle>{t('settings.uomTitle')}</CardTitle>
          </div>
          <ShellBadge />
        </div>
        <p className="text-xs text-muted-foreground">
          {t('settings.uomNote')}
        </p>

        {uomMessage && (
          <Alert tone={uomMessage.kind === 'success' ? 'success' : 'destructive'}>
            <div className="flex items-center gap-2">
              {uomMessage.kind === 'success' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              <span>{uomMessage.text}</span>
            </div>
          </Alert>
        )}

        <TableShell>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH className="text-left">{t('settings.thCode')}</TH>
                <TH className="text-left">{t('settings.thName')}</TH>
                <TH className="text-left hidden sm:table-cell">{t('settings.thDesc')}</TH>
                <TH className="text-left">{t('settings.thStatus2')}</TH>
                <TH className="text-right">{t('settings.thAction')}</TH>
              </TR>
            </THead>
            <TBody>
              {Object.values(uoms)
                .sort((a, b) => a.code.localeCompare(b.code))
                .map((u) => (
                  <TR key={u.id} className="border-t border-border hover:bg-muted/50">
                    <TD className="font-mono font-semibold">{u.code}</TD>
                    <TD>{u.name}</TD>
                    <TD className="text-muted-foreground hidden sm:table-cell">{u.description}</TD>
                    <TD>
                      <span
                        className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md border ${
                          u.is_active
                            ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/25'
                            : 'bg-muted text-muted-foreground border-border'
                        }`}
                      >
                        {u.is_active ? t('common.active') : t('common.inactive')}
                      </span>
                    </TD>
                    <TD className="text-right">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => void handleToggleUom(u.id, !u.is_active)}
                        className="text-[11px] px-2.5 py-1"
                      >
                        {u.is_active ? t('settings.deactivate') : t('settings.activate')}
                      </Button>
                    </TD>
                  </TR>
                ))}
            </TBody>
          </Table>
        </TableShell>

        <form onSubmit={handleAddUom} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <Label className="mb-1">{t('settings.uomCode')}</Label>
            <Input
              type="text"
              required
              value={newUomCode}
              onChange={(e) => setNewUomCode(e.target.value.toUpperCase())}
              placeholder={t('settings.uomCodePh')}
              maxLength={10}
              className="w-full font-mono uppercase"
            />
          </div>
          <div>
            <Label className="mb-1">{t('settings.uomName')}</Label>
            <Input
              type="text"
              required
              value={newUomName}
              onChange={(e) => setNewUomName(e.target.value)}
              placeholder={t('settings.uomNamePh')}
              className="w-full"
            />
          </div>
          <div>
            <Label className="mb-1">{t('settings.uomDesc')}</Label>
            <Input
              type="text"
              value={newUomDescription}
              onChange={(e) => setNewUomDescription(e.target.value)}
              placeholder={t('settings.uomDescPh')}
              className="w-full"
            />
          </div>
          <div>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={uomBusy || !newUomCode.trim() || !newUomName.trim()}
              className="w-full px-4 py-2"
            >
              {uomBusy ? t('settings.adding') : t('settings.addUnit')}
            </Button>
          </div>
        </form>
      </Card>

      {/* Section 6: App Passcode */}
      <Card className="p-5 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-muted-foreground" />
            <CardTitle>{t('settings.passTitle')}</CardTitle>
          </div>
          <ShellBadge />
        </div>
        <p className="text-xs text-muted-foreground">
          {t('settings.passNote')}
        </p>

        {passcodeMessage && (
          <Alert tone={passcodeMessage.kind === 'success' ? 'success' : 'destructive'}>
            <div className="flex items-center gap-2">
              {passcodeMessage.kind === 'success' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              <span>{passcodeMessage.text}</span>
            </div>
          </Alert>
        )}

        <form onSubmit={handleChangePasscode} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="mb-1">{t('settings.currentPass')}</Label>
            <Input
              type="password"
              autoComplete="current-password"
              value={currentPasscode}
              onChange={(e) => setCurrentPasscode(e.target.value)}
              className="w-full font-mono"
            />
          </div>
          <div>
            <Label className="mb-1">{t('settings.newPass')}</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={newPasscode}
              onChange={(e) => setNewPasscode(e.target.value)}
              className="w-full font-mono"
            />
          </div>
          <div>
            <Label className="mb-1">{t('settings.confirmPass')}</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmPasscode}
              onChange={(e) => setConfirmPasscode(e.target.value)}
              className="w-full font-mono"
            />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={
                changingPasscode ||
                currentPasscode.length === 0 ||
                newPasscode.length === 0 ||
                confirmPasscode.length === 0
              }
              className="px-5 py-2 shadow-2xs"
            >
              {changingPasscode ? t('settings.updating') : t('settings.updatePass')}
            </Button>
          </div>
        </form>
      </Card>

      </>
      )}

      {/* Confirmation Modal */}
      <Modal
        isOpen={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        title={t('settings.resetTitle')}
        subtitle={t('settings.resetSubtitle')}
        maxWidth="md"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setResetConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleConfirmReset}>
              {t('settings.confirmReset')}
            </Button>
          </>
        }
      >
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('settings.resetBody')}
        </p>
      </Modal>
    </div>
  );
};
