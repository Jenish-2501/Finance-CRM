import React, { useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { BusinessSettings } from '../types/database';
import {
  Settings,
  Building2,
  Landmark,
  FileText,
  RotateCcw,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { Modal } from '../components/common/Modal';

export const SettingsView: React.FC = () => {
  const { businessSettings, updateBusinessSettings, resetToSeedData } = useAccountingStore();

  const [formData, setFormData] = useState<BusinessSettings>({ ...businessSettings });
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const handleChange = (field: keyof BusinessSettings, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateBusinessSettings(formData);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleConfirmReset = () => {
    resetToSeedData();
    setFormData({ ...useAccountingStore.getState().businessSettings });
    setResetConfirmOpen(false);
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

      {saveSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>
            Business settings updated in centralized state! Existing historical invoice snapshots remain unchanged.
          </span>
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
              <input
                type="number"
                step="0.1"
                required
                value={formData.default_gst_rate}
                onChange={(e) => handleChange('default_gst_rate', Number(e.target.value))}
                className="w-full p-2 border border-neutral-300 rounded font-mono"
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="submit"
            className="px-5 py-2 font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors shadow-2xs"
          >
            Save Business Settings
          </button>
        </div>
      </form>

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
