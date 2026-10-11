import React, { useState } from 'react';
import { useAccountingStore } from '../../store/accountingStore';
import {
  CheckCircle2,
  ShieldCheck,
  LogOut
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { ThemeToggle } from '../ui/ThemeToggle';
import { runAccountingTestSuite, TestResult } from '../../tests/testSuite';
import { getFyForDate } from '../../utils/calculations';

interface HeaderProps {
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onLogout }) => {
  const { businessSettings } =
    useAccountingStore();
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);

  const handleRunTests = () => {
    const results = runAccountingTestSuite();
    setTestResults(results);
    setIsTestModalOpen(true);
  };

  const allPassed = testResults.length > 0 && testResults.every((t) => t.passed);

  return (
    <>
      <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 shrink-0 no-print">
        {/* Left: Organization context */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm tracking-wider">
            AL
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground tracking-tight">
                {businessSettings.business_name}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 bg-secondary border border-border rounded text-secondary-foreground">
                GST: {businessSettings.gst_number}
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              FY {getFyForDate(new Date().toISOString())} • State Code: {businessSettings.state_code} ({businessSettings.state})
            </p>
          </div>
        </div>

        {/* Right: Quick actions & User Switcher */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {/* Audit Verification Test Suite Trigger */}
          <Button
            variant="success-outline"
            size="sm"
            onClick={handleRunTests}
            title="Run 12 Invariant Tests: Stock, Billing Allocations, Snapshots & Ledger"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Verify Accounting Invariants</span>
          </Button>

          {/* Owner Identity (single-user app) */}
          <div className="flex items-center gap-2 pl-3 border-l border-border">
            <div className="text-right">
              <div className="text-xs font-medium text-foreground">Owner</div>
              <div className="text-[11px] font-mono text-muted-foreground">Single user</div>
            </div>
            <span className="text-[10px] font-mono font-semibold px-2 py-1 bg-primary text-primary-foreground rounded-md tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              OWNER
            </span>
            {onLogout && (
              <Button variant="secondary" size="sm" onClick={onLogout} title="Lock app and return to sign in">
                <LogOut className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Logout</span>
              </Button>
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
          <Button variant="primary" size="sm" onClick={() => setIsTestModalOpen(false)}>
            Done
          </Button>
        }
      >
        <div className="space-y-4">
          <Alert tone={allPassed ? 'success' : 'destructive'}>
            <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              <div>
                <div className="font-semibold text-sm">
                  {allPassed ? 'All 12 Accounting Invariants Passed' : 'Some Tests Failed'}
                </div>
                <div className="opacity-80 mt-0.5">
                  Verified stock formulas, explicit allocation balances, snapshot immutability, and running ledger.
                </div>
              </div>
            </div>
            <span className="font-mono font-bold text-sm bg-card px-2 py-1 rounded-md border border-border">
              {testResults.filter((t) => t.passed).length} / {testResults.length}
            </span>
            </div>
          </Alert>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {testResults.map((t, idx) => (
              <div key={t.id} className="p-3 bg-muted border border-border rounded-md text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-foreground flex items-center gap-2">
                    <span className="font-mono text-muted-foreground">#{idx + 1}</span>
                    <span>{t.name}</span>
                  </div>
                  <span
                    className={`font-mono text-[11px] px-2 py-0.5 rounded border font-semibold ${
                      t.passed
                        ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/25'
                        : 'bg-destructive/10 text-destructive border-destructive/25'
                    }`}
                  >
                    {t.passed ? 'PASSED' : 'FAILED'}
                  </span>
                </div>
                <div className="text-muted-foreground grid grid-cols-2 gap-2 text-[11px] pt-1">
                  <div>
                    <span className="font-semibold">Expected:</span>{' '}
                    <span className="font-mono text-foreground">{t.expected}</span>
                  </div>
                  <div>
                    <span className="font-semibold">Actual:</span>{' '}
                    <span className="font-mono text-foreground">{t.actual}</span>
                  </div>
                </div>
                {t.details && (
                  <div className="text-[11px] italic border-t border-border pt-1 text-muted-foreground">
                    {t.details}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
};
