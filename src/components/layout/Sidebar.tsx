import React from 'react';
import { useT } from '../../i18n';
import { useAccountingStore } from '../../store/accountingStore';
import {
  LayoutDashboard,
  Users,
  Package,
  Layers,
  FileText,
  CreditCard,
  BookOpen,
  Truck,
  BarChart3,
  Settings,
  History,
  FileCheck,
  Tag,
  DatabaseBackup,
  Languages
} from 'lucide-react';

export type NavigationTab =
  | 'dashboard'
  | 'billing'
  | 'invoices'
  | 'payments'
  | 'ledger'
  | 'customers'
  | 'products'
  | 'company-inventory'
  | 'customer-inventory'
  | 'reports'
  | 'settings'
  | 'language-settings'
  | 'activity'
  | 'pricing'
  | 'app-settings';

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  /** Role workspace: 'counter' keeps only operator tabs, 'super' everything. Defaults to 'super'. */
  role?: 'super' | 'counter';
}

// Counter-staff workspace: challan entry (Customer Inventory), product
// catalog and customer master data only — billing, invoices, payments,
// reports and administration are hidden, not merely disabled.
const COUNTER_ALLOWED_TABS: NavigationTab[] = ['customer-inventory', 'products', 'customers'];

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab, role = 'super' }) => {
  const { t } = useT();
  const { businessSettings } = useAccountingStore();
  const allow = (tab: NavigationTab) =>
    role !== 'counter' || COUNTER_ALLOWED_TABS.includes(tab);
  const navSections = [
    {
      title: t('nav.sections.core'),
      items: [
        { id: 'dashboard' as NavigationTab, label: t('nav.dashboard'), icon: LayoutDashboard }
      ]
    },
    {
      title: t('nav.sections.sales'),
      items: [
        { id: 'billing' as NavigationTab, label: t('nav.billing'), icon: FileCheck },
        { id: 'pricing' as NavigationTab, label: t('nav.pricing'), icon: Tag },
        { id: 'invoices' as NavigationTab, label: t('nav.invoices'), icon: FileText },
        { id: 'payments' as NavigationTab, label: t('nav.payments'), icon: CreditCard },
        { id: 'ledger' as NavigationTab, label: t('nav.ledger'), icon: BookOpen }
      ]
    },
    {
      title: t('nav.sections.master'),
      items: [
        { id: 'customers' as NavigationTab, label: t('nav.customers'), icon: Users },
        { id: 'products' as NavigationTab, label: t('nav.products'), icon: Package }
      ]
    },
    {
      title: t('nav.sections.inventory'),
      items: [
        { id: 'company-inventory' as NavigationTab, label: t('nav.companyInventory'), icon: Layers },
        { id: 'customer-inventory' as NavigationTab, label: t('nav.customerInventory'), icon: Truck }
      ]
    },
    {
      title: t('nav.sections.analytics'),
      items: [
        { id: 'reports' as NavigationTab, label: t('nav.reports'), icon: BarChart3 }
      ]
    },
    {
      title: t('nav.sections.admin'),
      items: [
        { id: 'settings' as NavigationTab, label: t('nav.settings'), icon: Settings },
        { id: 'language-settings' as NavigationTab, label: t('nav.languageSettings'), icon: Languages },
        { id: 'app-settings' as NavigationTab, label: t('nav.appSettings'), icon: DatabaseBackup },
        { id: 'activity' as NavigationTab, label: t('nav.activity'), icon: History }
      ]
    }
  ];

  return (
    <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col shrink-0 border-r border-sidebar-border select-none no-print">
      {/* Brand logo & product title (business identity, not the static app name) */}
      <div className="h-16 flex items-center px-6 border-b border-sidebar-border gap-3">
        <div className="w-7 h-7 bg-sidebar-primary text-sidebar-primary-foreground font-bold flex items-center justify-center rounded-md text-xs font-mono">
          ₹
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-sidebar-foreground tracking-wide truncate" title={businessSettings.business_name}>{businessSettings.business_name}</div>
          <div className="text-[10px] text-muted-foreground font-mono tracking-tight">
            {businessSettings.gst_number}
          </div>
        </div>
        {role === 'counter' && (
          <span className="ml-auto shrink-0 text-[9px] font-mono font-bold tracking-wider text-muted-foreground bg-muted border border-border rounded px-1.5 py-0.5">
            {t('shell.counterBadge')}
          </span>
        )}
      </div>

      {/* Nav items */}
      <nav aria-label={t('nav.primary')} className="flex-1 py-4 px-3 overflow-y-auto space-y-6">
        {navSections
          .map((sec) => ({ ...sec, items: sec.items.filter((item) => allow(item.id)) }))
          .filter((sec) => sec.items.length > 0)
          .map((sec) => (
          <div key={sec.title}>
            <div className="text-[10px] font-mono tracking-wider font-semibold text-muted-foreground uppercase px-3 mb-1.5">
              {sec.title}
            </div>
            <div className="space-y-0.5">
              {sec.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectTab(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-md transition-colors text-left ${
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-2xs border-l-2 border-sidebar-primary'
                        : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/60'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-sidebar-accent-foreground' : 'text-muted-foreground'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footnote / Architecture info */}
      <div className="p-4 border-t border-sidebar-border text-[11px] text-muted-foreground font-mono">
        <div>{t('shell.storeLine1')}</div>
        <div className="text-[10px] opacity-80">{t('shell.storeLine2')}</div>
      </div>
    </aside>
  );
};
