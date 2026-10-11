import React from 'react';
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
  DatabaseBackup
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
  | 'activity'
  | 'pricing'
  | 'app-settings';

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
  const navSections = [
    {
      title: 'CORE',
      items: [
        { id: 'dashboard' as NavigationTab, label: 'Dashboard', icon: LayoutDashboard }
      ]
    },
    {
      title: 'SALES & BILLING',
      items: [
        { id: 'billing' as NavigationTab, label: 'Billing Wizard', icon: FileCheck },
        { id: 'pricing' as NavigationTab, label: 'Customer Pricing', icon: Tag },
        { id: 'invoices' as NavigationTab, label: 'Invoices', icon: FileText },
        { id: 'payments' as NavigationTab, label: 'Payments', icon: CreditCard },
        { id: 'ledger' as NavigationTab, label: 'Customer Ledger', icon: BookOpen }
      ]
    },
    {
      title: 'MASTER DATA',
      items: [
        { id: 'customers' as NavigationTab, label: 'Customers', icon: Users },
        { id: 'products' as NavigationTab, label: 'Products & UOM', icon: Package }
      ]
    },
    {
      title: 'INVENTORY LEDGER',
      items: [
        { id: 'company-inventory' as NavigationTab, label: 'Company Stock', icon: Layers },
        { id: 'customer-inventory' as NavigationTab, label: 'Customer Holding', icon: Truck }
      ]
    },
    {
      title: 'ANALYTICS & COMPLIANCE',
      items: [
        { id: 'reports' as NavigationTab, label: 'Financial Reports', icon: BarChart3 }
      ]
    },
    {
      title: 'ADMINISTRATION',
      items: [
        { id: 'settings' as NavigationTab, label: 'Business Settings', icon: Settings },
        { id: 'app-settings' as NavigationTab, label: 'App Settings', icon: DatabaseBackup },
        { id: 'activity' as NavigationTab, label: 'Audit Trail', icon: History }
      ]
    }
  ];

  return (
    <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col shrink-0 border-r border-sidebar-border select-none no-print">
      {/* Brand logo & product title */}
      <div className="h-16 flex items-center px-6 border-b border-sidebar-border gap-3">
        <div className="w-7 h-7 bg-sidebar-primary text-sidebar-primary-foreground font-bold flex items-center justify-center rounded-md text-xs font-mono">
          ₹
        </div>
        <div>
          <div className="text-sm font-bold text-sidebar-foreground tracking-wide">AccuLedger</div>
          <div className="text-[10px] text-muted-foreground font-mono tracking-tight uppercase">
            Enterprise ERP Prototype
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav aria-label="Primary" className="flex-1 py-4 px-3 overflow-y-auto space-y-6">
        {navSections.map((sec) => (
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
        <div>Zustand Relational Store</div>
        <div className="text-[10px] opacity-80">PostgreSQL Schema Contract</div>
      </div>
    </aside>
  );
};
