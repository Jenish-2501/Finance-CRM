import { useState } from 'react';
import { useAccountingStore } from './store/accountingStore';
import { Sidebar, NavigationTab } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DashboardView } from './views/DashboardView';
import { CustomersView } from './views/CustomersView';
import { ProductsView } from './views/ProductsView';
import { CompanyInventoryView } from './views/CompanyInventoryView';
import { CustomerInventoryView } from './views/CustomerInventoryView';
import { BillingView } from './views/BillingView';
import { CustomerPricingView } from './views/CustomerPricingView';
import { InvoicesView } from './views/InvoicesView';
import { PaymentsView } from './views/PaymentsView';
import { CustomerLedgerView } from './views/CustomerLedgerView';
import { ReportsView } from './views/ReportsView';
import { SettingsView } from './views/SettingsView';
import { LanguageSettingsView } from './views/settings/LanguageSettingsView';
import { AuditActivityView } from './views/AuditActivityView';
import { AppSettingsView } from './views/AppSettingsView';
import { Modal } from './components/common/Modal';
import { AppShell, ThemeProvider } from './components/ui';
import { LanguageProvider } from './i18n';
import { InvoicePrintView } from './components/invoice/InvoicePrintView';
import { LoginView } from './views/LoginView';

const AUTH_SESSION_KEY = 'acculedger-auth';

// Counter-staff workspace tabs: challan entry (Customer Inventory), product
// catalog and customer master data. Must mirror Sidebar's COUNTER_ALLOWED_TABS.
const COUNTER_ALLOWED_TABS: NavigationTab[] = ['customer-inventory', 'products', 'customers'];

export default function App() {
  const [authRole, setAuthRole] = useState<'super' | 'counter' | null>(() => {
    try {
      // Legacy sessions stored the bare flag 'true' — treat as super.
      const v = sessionStorage.getItem(AUTH_SESSION_KEY);
      if (v === 'super' || v === 'counter') return v;
      if (v === 'true') return 'super';
    } catch {
      // sessionStorage unavailable (e.g. tests) — in-memory only
    }
    return null;
  });
  const [currentTab, setCurrentTab] = useState<NavigationTab>(
    () => (authRole === 'counter' ? 'customer-inventory' : 'dashboard')
  );
  const [selectedCustomerIdForBilling, setSelectedCustomerIdForBilling] = useState<string>('cust-1');
  const [selectedInvoiceIdForPreview, setSelectedInvoiceIdForPreview] = useState<string | null>(null);
  const [selectedInvoiceIdForPayment, setSelectedInvoiceIdForPayment] = useState<string | null>(null);

  const {
    invoices,
    invoiceItems,
    invoiceAllocations,
    invoicePayments,
    finalizeInvoice,
    cancelInvoice
  } = useAccountingStore();

  // Defensive default: any caller that still passes no role (legacy bundles,
  // stale HMR module graphs) unlocks the full app — only an explicit
  // 'counter' from the verified passcode gets the restricted workspace.
  const handleLogin = (role?: 'super' | 'counter') => {
    const effectiveRole = role === 'counter' ? 'counter' : 'super';
    try {
      sessionStorage.setItem(AUTH_SESSION_KEY, effectiveRole);
    } catch {
      // sessionStorage unavailable (e.g. tests) — fall back to in-memory auth
    }
    setAuthRole(effectiveRole);
    setCurrentTab(effectiveRole === 'counter' ? 'customer-inventory' : 'dashboard');
  };

  const handleLogout = () => {
    try {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
    } catch {
      // ignore
    }
    setAuthRole(null);
    setCurrentTab('dashboard');
  };

  // Counter role sees only 3 tabs: navigation into anything else is a no-op,
  // and cross-view buttons leading to billing/invoices are simply not passed
  // down, so this guards any direct navigation calls too.
  const navigateTab = (tab: NavigationTab) => {
    if (authRole === 'counter' && !COUNTER_ALLOWED_TABS.includes(tab)) return;
    setCurrentTab(tab);
  };

  // Navigation handlers
  const handleOpenBillingForCustomer = (customerId: string) => {
    setSelectedCustomerIdForBilling(customerId);
    navigateTab('billing');
  };

  const handleInvoiceCreated = (invoiceId: string) => {
    setSelectedInvoiceIdForPreview(invoiceId);
    navigateTab('invoices');
  };

  const handleOpenPaymentModal = (invoiceId: string) => {
    setSelectedInvoiceIdForPayment(invoiceId);
    navigateTab('payments');
  };

  const handleOpenInvoicePreview = (invoiceId: string) => {
    setSelectedInvoiceIdForPreview(invoiceId);
  };

  // Preview data
  const previewInvoice = selectedInvoiceIdForPreview ? invoices[selectedInvoiceIdForPreview] : null;
  const previewItems = selectedInvoiceIdForPreview
    ? Object.values(invoiceItems).filter((i) => i.invoice_id === selectedInvoiceIdForPreview)
    : [];
  const previewAllocations = selectedInvoiceIdForPreview
    ? Object.values(invoiceAllocations).filter((a) => a.invoice_id === selectedInvoiceIdForPreview)
    : [];
  const previewPayments = selectedInvoiceIdForPreview
    ? Object.values(invoicePayments).filter((p) => p.invoice_id === selectedInvoiceIdForPreview)
    : [];

  if (!authRole) {
    return (
      <ThemeProvider>
        <LanguageProvider>
          <LoginView onLogin={handleLogin} />
        </LanguageProvider>
      </ThemeProvider>
    );
  }

  // Restricted landing: counter role never renders disallowed views even if
  // state somehow carries a stray tab across sessions.
  const activeTab =
    authRole === 'counter' && !COUNTER_ALLOWED_TABS.includes(currentTab)
      ? 'customer-inventory'
      : currentTab;

  // In counter mode the billing/invoice cross-links are withheld, so those
  // actions disappear from the allowed views' UI.
  const passCrossNav = authRole !== 'counter';

  return (
    <ThemeProvider>
      <LanguageProvider>
    <AppShell sidebar={<Sidebar currentTab={activeTab} role={authRole} onSelectTab={(tab) => navigateTab(tab)} />} header={<Header onLogout={handleLogout} />}>
            {activeTab === 'dashboard' && (
              <DashboardView
                onNavigate={(tab) => navigateTab(tab as NavigationTab)}
                onOpenInvoice={handleOpenInvoicePreview}
              />
            )}

            {activeTab === 'customers' && (
              <CustomersView
                onSelectCustomerForBilling={passCrossNav ? handleOpenBillingForCustomer : undefined}
                onOpenInvoice={passCrossNav ? handleOpenInvoicePreview : undefined}
              />
            )}

            {activeTab === 'products' && <ProductsView />}

            {activeTab === 'company-inventory' && <CompanyInventoryView />}

            {activeTab === 'customer-inventory' && (
              <CustomerInventoryView onOpenBillingForCustomer={passCrossNav ? handleOpenBillingForCustomer : undefined} />
            )}

            {activeTab === 'billing' && (
              <BillingView
                initialCustomerId={selectedCustomerIdForBilling}
                onInvoiceCreated={handleInvoiceCreated}
              />
            )}

            {activeTab === 'invoices' && (
              <InvoicesView
                selectedInvoiceId={selectedInvoiceIdForPreview}
                onOpenPaymentModal={handleOpenPaymentModal}
                onNavigateToBilling={() => navigateTab('billing')}
              />
            )}

            {activeTab === 'payments' && (
              <PaymentsView
                initialInvoiceId={selectedInvoiceIdForPayment}
                onOpenInvoice={handleOpenInvoicePreview}
              />
            )}

            {activeTab === 'ledger' && (
              <CustomerLedgerView
                initialCustomerId={selectedCustomerIdForBilling}
                onOpenInvoice={handleOpenInvoicePreview}
              />
            )}

            {activeTab === 'reports' && <ReportsView />}

            {activeTab === 'settings' && <SettingsView />}

            {activeTab === 'language-settings' && <LanguageSettingsView />}

            {activeTab === 'activity' && <AuditActivityView />}

            {activeTab === 'pricing' && <CustomerPricingView />}

            {activeTab === 'app-settings' && <AppSettingsView />}
    </AppShell>

      {/* Global Invoice Preview Modal */}
      {previewInvoice && (
        <Modal
          isOpen={Boolean(selectedInvoiceIdForPreview)}
          onClose={() => setSelectedInvoiceIdForPreview(null)}
          title={`Tax Invoice #${previewInvoice.invoice_number}`}
          subtitle={`Customer: ${previewInvoice.customer_snapshot.customer_name} • Date: ${new Date(previewInvoice.invoice_date).toLocaleDateString()}`}
          maxWidth="full"
        >
          <InvoicePrintView
            invoice={previewInvoice}
            items={previewItems}
            payments={previewPayments}
            allocations={previewAllocations}
            onClose={() => setSelectedInvoiceIdForPreview(null)}
            onFinalize={() => finalizeInvoice(previewInvoice.id)}
            onCancel={(reason) => cancelInvoice(previewInvoice.id, reason)}
            onOpenPayment={() => {
              const id = previewInvoice.id;
              setSelectedInvoiceIdForPreview(null);
              handleOpenPaymentModal(id);
            }}
          />
        </Modal>
      )}
      </LanguageProvider>
    </ThemeProvider>
  );
}
