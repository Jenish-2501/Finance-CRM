import React, { useState } from 'react';
import { useAccountingStore } from '../../store/accountingStore';
import {
  RotateCcw,
  CheckCircle2,
  ShieldCheck,
  Building2,
  UserCheck,
  Terminal,
  ExternalLink
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { runAccountingTestSuite, TestResult } from '../../tests/testSuite';

export const Header: React.FC = () => {
  const { businessSettings, currentUser, users, setCurrentUser, resetToSeedData } =
    useAccountingStore();
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const handleRunTests = () => {
    const results = runAccountingTestSuite();
    setTestResults(results);
    setIsTestModalOpen(true);
  };

  const handleReset = () => {
    resetToSeedData();
    setResetConfirmOpen(false);
  };

  const allPassed = testResults.length > 0 && testResults.every((t) => t.passed);

  return (
    <>
      <header className="h-16 border-b border-neutral-200 bg-white flex items-center justify-between px-6 shrink-0 no-print">
        {/* Left: Organization context */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-neutral-900 text-white flex items-center justify-center font-bold text-sm tracking-wider">
            AL
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-neutral-900 tracking-tight">
                {businessSettings.business_name}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 bg-neutral-100 border border-neutral-200 rounded text-neutral-600">
                GST: {businessSettings.gst_number}
              </span>
            </div>
            <p className="text-xs text-neutral-500 font-mono">
              FY 2025-26 • State Code: {businessSettings.state_code} ({businessSettings.state})
            </p>
          </div>
        </div>

        {/* Right: Quick actions & User Switcher */}
        <div className="flex items-center gap-3">
          {/* Audit Verification Test Suite Trigger */}
          <button
            onClick={handleRunTests}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-300 rounded hover:bg-emerald-100 transition-colors shadow-2xs"
            title="Run 12 Invariant Tests: Stock, Billing Allocations, Snapshots & Ledger"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Verify Accounting Invariants</span>
          </button>

          {/* Reset Demo State */}
          <button
            onClick={() => setResetConfirmOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-300 rounded hover:bg-neutral-100 transition-colors"
            title="Restore default seed data"
          >
            <RotateCcw className="w-3.5 h-3.5 text-neutral-500" />
            <span>Reset Demo</span>
          </button>

          {/* User / Admin Identity */}
          <div className="flex items-center gap-2 pl-3 border-l border-neutral-200">
            <div className="text-right">
              <div className="text-xs font-medium text-neutral-900">{currentUser?.name}</div>
              <div className="text-[11px] font-mono text-neutral-500">{currentUser?.role}</div>
            </div>
            {Object.values(users).length > 1 ? (
              <select
                value={currentUser?.id || ''}
                onChange={(e) => setCurrentUser(e.target.value)}
                className="text-xs border border-neutral-300 rounded px-2 py-1 bg-white text-neutral-800 font-sans focus:outline-none focus:ring-1 focus:ring-neutral-900 cursor-pointer"
                title="Switch user role"
              >
                {Object.values(users).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[10px] font-mono font-semibold px-2 py-1 bg-neutral-900 text-white rounded tracking-wider flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-neutral-200" />
                ADMIN
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Test Verification Modal */}
      <Modal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        title="Accounting Engine Invariant Verification"
        subtitle="Automated checks of Section 51 requirements across the relational Zustand store"
        maxWidth="2xl"
        footer={
          <button
            onClick={() => setIsTestModalOpen(false)}
            className="px-4 py-1.5 text-xs font-medium text-white bg-neutral-900 rounded hover:bg-neutral-800"
          >
            Done
          </button>
        }
      >
        <div className="space-y-4">
          <div
            className={`p-3.5 rounded border text-xs flex items-center justify-between ${
              allPassed
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <div>
                <div className="font-semibold text-sm">
                  {allPassed ? 'All 12 Accounting Invariants Passed' : 'Some Tests Failed'}
                </div>
                <div className="text-neutral-600 mt-0.5">
                  Verified stock formulas, explicit allocation balances, snapshot immutability, and running ledger.
                </div>
              </div>
            </div>
            <span className="font-mono font-bold text-sm bg-white px-2 py-1 rounded border border-emerald-300">
              {testResults.filter((t) => t.passed).length} / {testResults.length}
            </span>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {testResults.map((t, idx) => (
              <div
                key={t.id}
                className="p-3 bg-neutral-50 border border-neutral-200 rounded text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-neutral-900 flex items-center gap-2">
                    <span className="font-mono text-neutral-400">#{idx + 1}</span>
                    <span>{t.name}</span>
                  </div>
                  <span
                    className={`font-mono text-[11px] px-2 py-0.5 rounded font-semibold ${
                      t.passed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {t.passed ? 'PASSED' : 'FAILED'}
                  </span>
                </div>
                <div className="text-neutral-600 grid grid-cols-2 gap-2 text-[11px] pt-1">
                  <div>
                    <span className="font-semibold text-neutral-500">Expected:</span>{' '}
                    <span className="font-mono text-neutral-800">{t.expected}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-neutral-500">Actual:</span>{' '}
                    <span className="font-mono text-neutral-800">{t.actual}</span>
                  </div>
                </div>
                {t.details && (
                  <div className="text-[11px] text-neutral-500 italic border-t border-neutral-200/60 pt-1">
                    {t.details}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Reset Confirmation Dialog */}
      <Modal
        isOpen={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        title="Reset Demo State to Initial Seed Data?"
        subtitle="This will restore all tables, stock receipts, customers, and invoices to clean seed defaults."
        maxWidth="md"
        footer={
          <>
            <button
              onClick={() => setResetConfirmOpen(false)}
              className="px-3.5 py-1.5 text-xs text-neutral-600 hover:text-neutral-800 border border-neutral-300 rounded bg-white"
            >
              Cancel
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-1.5 text-xs font-medium text-white bg-rose-600 rounded hover:bg-rose-700"
            >
              Confirm Reset
            </button>
          </>
        }
      >
        <p className="text-xs text-neutral-600">
          All modifications made during this demo session (new dispatches, returns, invoices, or settings edits) will be reverted to the seed specification. LocalStorage state will refresh cleanly.
        </p>
      </Modal>
    </>
  );
};
