import React, { useState } from 'react';
import { useAccountingStore } from './store/accountingStore';
import { Sidebar, NavigationTab } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DashboardView } from './views/DashboardView';
import { CustomersView } from './views/CustomersView';
import { ProductsView } from './views/ProductsView';
import { CompanyInventoryView } from './views/CompanyInventoryView';
import { CustomerInventoryView } from './views/CustomerInventoryView';
import { BillingView } from './views/BillingView';
import { InvoicesView } from './views/InvoicesView';
import { PaymentsView } from './views/PaymentsView';
import { CustomerLedgerView } from './views/CustomerLedgerView';
import { ReportsView } from './views/ReportsView';
import { SettingsView } from './views/SettingsView';
import { AuditActivityView } from './views/AuditActivityView';
import { UsersRolesView } from './views/UsersRolesView';
import { Modal } from './components/common/Modal';
import { InvoicePrintView } from './components/invoice/InvoicePrintView';

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');
  const [selectedCustomerIdForBilling, setSelectedCustomerIdForBilling] = useState<string>('cust-1');
  const [selectedInvoiceIdForPreview, setSelectedInvoiceIdForPreview] = useState<string | null>(null);
  const [selectedInvoiceIdForPayment, setSelectedInvoiceIdForPayment] = useState<string | null>(null);

  const {
    invoices,
    invoiceItems,
    invoiceAllocations,
    invoicePayments,
    finalizeInvoice,
    cancelInvoice,
    createInvoicePayment
  } = useAccountingStore();

  // Navigation handlers
  const handleOpenBillingForCustomer = (customerId: string) => {
    setSelectedCustomerIdForBilling(customerId);
    setCurrentTab('billing');
  };

  const handleInvoiceCreated = (invoiceId: string) => {
    setSelectedInvoiceIdForPreview(invoiceId);
    setCurrentTab('invoices');
  };

  const handleOpenPaymentModal = (invoiceId: string) => {
    setSelectedInvoiceIdForPayment(invoiceId);
    setCurrentTab('payments');
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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neutral-100 text-neutral-900 font-sans">
      {/* Persistent Left Sidebar */}
      <Sidebar currentTab={currentTab} onSelectTab={(tab) => setCurrentTab(tab)} />

      {/* Main App Layout */}
      <div className="flex flex-col flex-1 h-full min-w-0 overflow-hidden">
        {/* Top Header */}
        <Header />

        {/* Scrollable View Container */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            {currentTab === 'dashboard' && (
              <DashboardView
                onNavigate={(tab) => setCurrentTab(tab as NavigationTab)}
                onOpenInvoice={handleOpenInvoicePreview}
              />
            )}

            {currentTab === 'customers' && (
              <CustomersView
                onSelectCustomerForBilling={handleOpenBillingForCustomer}
                onOpenInvoice={handleOpenInvoicePreview}
              />
            )}

            {currentTab === 'products' && <ProductsView />}

            {currentTab === 'company-inventory' && <CompanyInventoryView />}

            {currentTab === 'customer-inventory' && (
              <CustomerInventoryView onOpenBillingForCustomer={handleOpenBillingForCustomer} />
            )}

            {currentTab === 'billing' && (
              <BillingView
                initialCustomerId={selectedCustomerIdForBilling}
                onInvoiceCreated={handleInvoiceCreated}
              />
            )}

            {currentTab === 'invoices' && (
              <InvoicesView
                selectedInvoiceId={selectedInvoiceIdForPreview}
                onOpenPaymentModal={handleOpenPaymentModal}
                onNavigateToBilling={() => setCurrentTab('billing')}
              />
            )}

            {currentTab === 'payments' && (
              <PaymentsView
                initialInvoiceId={selectedInvoiceIdForPayment}
                onOpenInvoice={handleOpenInvoicePreview}
              />
            )}

            {currentTab === 'ledger' && (
              <CustomerLedgerView
                initialCustomerId={selectedCustomerIdForBilling}
                onOpenInvoice={handleOpenInvoicePreview}
              />
            )}

            {currentTab === 'reports' && <ReportsView />}

            {currentTab === 'settings' && <SettingsView />}

            {currentTab === 'activity' && <AuditActivityView />}

            {currentTab === 'users' && <UsersRolesView />}
          </div>
        </main>
      </div>

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
    </div>
  );
}
