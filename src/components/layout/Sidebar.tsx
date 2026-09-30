import React from 'react';
import {
  LayoutDashboard,
  Users,
  Package,
  Layers,
  FileText,
  CreditCard,
  BookOpen,
  ArrowRightLeft,
  Truck,
  BarChart3,
  Settings,
  History,
  Shield,
  FileCheck
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
  | 'users'
  | 'activity';

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
        { id: 'activity' as NavigationTab, label: 'Audit Trail', icon: History },
        { id: 'users' as NavigationTab, label: 'Users & Roles', icon: Shield }
      ]
    }
  ];

  return (
    <aside className="w-64 bg-neutral-900 text-neutral-300 flex flex-col shrink-0 border-r border-neutral-800 select-none no-print">
      {/* Brand logo & product title */}
      <div className="h-16 flex items-center px-6 border-b border-neutral-800 gap-3">
        <div className="w-7 h-7 bg-white text-neutral-950 font-bold flex items-center justify-center rounded text-xs font-mono">
          ₹
        </div>
        <div>
          <div className="text-sm font-bold text-white tracking-wide">AccuLedger</div>
          <div className="text-[10px] text-neutral-400 font-mono tracking-tight uppercase">
            Enterprise ERP Prototype
          </div>
        </div>
      </div>

      {/* Nav items */}
      <div className="flex-1 py-4 px-3 overflow-y-auto space-y-6">
        {navSections.map((sec) => (
          <div key={sec.title}>
            <div className="text-[10px] font-mono tracking-wider font-semibold text-neutral-500 uppercase px-3 mb-1.5">
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
                    className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded transition-colors text-left ${
                      isActive
                        ? 'bg-neutral-800 text-white font-semibold shadow-2xs border-l-2 border-white'
                        : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-neutral-400'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footnote / Architecture info */}
      <div className="p-4 border-t border-neutral-800 text-[11px] text-neutral-500 font-mono">
        <div>Zustand Relational Store</div>
        <div className="text-[10px] text-neutral-400">PostgreSQL Schema Contract</div>
      </div>
    </aside>
  );
};
