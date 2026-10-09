// @vitest-environment jsdom
// Import-surface guard: every view must load and every shared helper it
// imports must provide the names the views use. Catches exactly the class of
// failure where Vite HMR (or a bad edit) leaves an importer referencing a
// missing export — e.g. firstCustomerId missing from CustomerPicker.
import { describe, it, expect } from 'vitest';
import { CustomerPicker, customerMatchesQuery, firstCustomerId, formatCustomerLabel } from '../../src/components/common/CustomerPicker';
import { DashboardView } from '../../src/views/DashboardView';
import { BillingView } from '../../src/views/BillingView';
import { CustomerPricingView } from '../../src/views/CustomerPricingView';
import { InvoicesView } from '../../src/views/InvoicesView';
import { PaymentsView } from '../../src/views/PaymentsView';
import { CustomerLedgerView } from '../../src/views/CustomerLedgerView';
import { CustomersView } from '../../src/views/CustomersView';
import { ProductsView } from '../../src/views/ProductsView';
import { CompanyInventoryView } from '../../src/views/CompanyInventoryView';
import { CustomerInventoryView } from '../../src/views/CustomerInventoryView';
import { ReportsView } from '../../src/views/ReportsView';
import { SettingsView } from '../../src/views/SettingsView';
import { AuditActivityView } from '../../src/views/AuditActivityView';
import { DatabaseStructureView } from '../../src/views/DatabaseStructureView';
import { LoginView } from '../../src/views/LoginView';

describe('view import surface', () => {
  it('CustomerPicker provides every helper the views import', () => {
    expect(typeof CustomerPicker).toBe('function');
    expect(typeof customerMatchesQuery).toBe('function');
    expect(typeof firstCustomerId).toBe('function');
    expect(typeof formatCustomerLabel).toBe('function');
  });

  it('all views load', () => {
    for (const view of [
      DashboardView, BillingView, CustomerPricingView, InvoicesView, PaymentsView,
      CustomerLedgerView, CustomersView, ProductsView, CompanyInventoryView,
      CustomerInventoryView, ReportsView, SettingsView, AuditActivityView,
      DatabaseStructureView, LoginView,
    ]) {
      expect(typeof view).toBe('function');
    }
  });
});
