import { Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';



declare global {
  interface Window {
    electronAPI: {
      app: {
        getVersion: () => Promise<{
          app: string;
          electron: string;
          chrome: string;
          node: string;
          platform: string;
        }>;
        getCapabilities: () => Promise<{
          isElectron: boolean;
          canManagePasscode: boolean;
          canUseLocalDatabase: boolean;
          canAccessFilesystem: boolean;
        }>;
      };
      passcode: {
        verify: (passcode: string) => Promise<{
          ok: boolean;
          error?: 'INVALID' | 'INCORRECT' | 'INCORRECT_CURRENT' | 'LOCKED';
        }>;
        change: (
          current: string,
          next: string
        ) => Promise<{
          ok: boolean;
          error?: 'INVALID' | 'INCORRECT' | 'INCORRECT_CURRENT' | 'LOCKED';
        }>;
      };
      /** Legacy alias of passcode. */
      auth: {
        login: (passcode: string) => Promise<{
          ok: boolean;
          error?: 'INVALID' | 'INCORRECT' | 'INCORRECT_CURRENT' | 'LOCKED';
        }>;
        changePasscode: (
          current: string,
          next: string
        ) => Promise<{
          ok: boolean;
          error?: 'INVALID' | 'INCORRECT' | 'INCORRECT_CURRENT' | 'LOCKED';
        }>;
      };
      store: {
        migrateLocalStorage: (data: unknown) => Promise<boolean>;
        upsert: (entityType: string, data: unknown) => Promise<boolean>;
        delete: (entityType: string, id: string) => Promise<boolean>;
        loadAll: () => Promise<Record<string, unknown>>;
        persistChanges: (payload: Record<string, unknown[]>) => Promise<boolean>;
      };
      business_settings: {
        upsert: (data: unknown) => Promise<boolean>;
        get: () => Promise<Record<string, unknown> | null>;
        update: (data: unknown) => Promise<{
          ok: boolean;
          settings?: Record<string, unknown>;
          error?: string;
          message?: string;
        }>;
      };
      uoms: {
        list: () => Promise<Record<string, unknown>[]>;
        create: (data: unknown) => Promise<{
          ok: boolean;
          uom?: Record<string, unknown>;
          error?: string;
          message?: string;
        }>;
        setActive: (
          id: string,
          isActive: boolean
        ) => Promise<{
          ok: boolean;
          uom?: Record<string, unknown>;
          error?: string;
          message?: string;
        }>;
      };
      customers: {
        upsert: (data: unknown) => Promise<boolean>;
        delete: (id: string) => Promise<boolean>;
      };
      products: { upsert: (data: unknown) => Promise<boolean> };
      product_prices: { upsert: (data: unknown) => Promise<boolean> };
      product_units: { upsert: (data: unknown) => Promise<boolean> };
      stock_receipts: { upsert: (data: unknown) => Promise<boolean> };
      stock_receipt_items: { upsert: (data: unknown) => Promise<boolean> };
      inventory_movements: { upsert: (data: unknown) => Promise<boolean> };
      customer_inventory_movements: { upsert: (data: unknown) => Promise<boolean> };
      invoices: { transaction: (payload: Record<string, unknown[]>) => Promise<boolean> };
      invoice_payments: { upsert: (data: unknown) => Promise<boolean> };
      audit_logs: { upsert: (data: unknown) => Promise<boolean> };
      database: {
        health: () => Promise<{
          connected: boolean;
          migrationStatus: 'OK' | 'PENDING';
          sqliteVersion: string;
          appliedMigrations: number[];
          pendingMigrations: number[];
        }>;
        schema: () => Promise<{
          dbFile: string | null;
          sqliteVersion: string;
          tables: Array<{
            name: string;
            rowCount: number;
            columns: Array<{
              name: string;
              type: string;
              notNull: boolean;
              primaryKey: boolean;
              defaultValue: string | null;
            }>;
          }>;
        }>;
      };
      maintenance: {
        health: () => Promise<{
          connected: boolean;
          migrationStatus: 'OK' | 'PENDING';
          sqliteVersion: string;
          appliedMigrations: number[];
          pendingMigrations: number[];
        }>;
        integrity: () => Promise<{ ok: boolean; detail: string }>;
        backup: () => Promise<{ ok: boolean; file?: string }>;
        exportBackup: () => Promise<{ ok: boolean; file?: string; error?: string }>;
        restoreBackup: () => Promise<{ ok: boolean; error?: string; safetyFile?: string }>;
      };
      files: {
        saveCSV: (filename: string, content: string) => Promise<boolean>;
        savePDFBytes: (filename: string, data: string) => Promise<boolean>;
      };
      printers: {
        list: () => Promise<Array<{ name: string; displayName: string; description: string }>>;
      };
      printing: {
        printPage: (opts: { deviceName?: string; copies?: number; silent?: boolean }) => Promise<{
          ok: boolean;
          error?: string;
        }>;
      };
    };
  }
}




interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  handleReset = () => {
    localStorage.clear();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6 text-foreground font-sans">
          <div className="max-w-md w-full bg-card p-6 rounded-lg border border-border shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-destructive/10 text-destructive flex items-center justify-center font-bold text-sm">
                !
              </div>
              <h2 className="text-base font-semibold text-foreground">Application Initialization Issue</h2>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              An unexpected error occurred during rendering. You can restore the default application state below:
            </p>
            {this.state.error?.message && (
              <pre className="p-3 bg-muted rounded-md border border-border text-[11px] font-mono text-foreground overflow-x-auto">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReset}
              className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              Reset Application Cache &amp; Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  );
}
