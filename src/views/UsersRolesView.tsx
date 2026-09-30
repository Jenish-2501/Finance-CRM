import React, { useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { AppUser, RoleType } from '../types/database';
import { Shield, User, Key, Check, X, UserCheck } from 'lucide-react';
import { Badge } from '../components/common/Badge';

export const UsersRolesView: React.FC = () => {
  const { users, currentUser, setCurrentUser } = useAccountingStore();

  const roleDefinitions: Record<
    RoleType,
    { title: string; description: string; permissions: string[] }
  > = {
    ADMIN: {
      title: 'System Administrator',
      description: 'Full unconstrained privileges across billing, inventory, settings, and audits',
      permissions: ['All Permissions (*)']
    },
    ACCOUNTANT: {
      title: 'Senior Accountant',
      description: 'Manage sales invoices, record collections, audit financial ledger, and tax reports',
      permissions: ['invoices.create', 'invoices.finalize', 'payments.create', 'ledger.view', 'reports.tax']
    },
    INVENTORY_MANAGER: {
      title: 'Warehouse & Logistics Manager',
      description: 'Receive inward stock, dispatch goods to customer sites, and audit warehouse inventory',
      permissions: ['stock.receive', 'dispatch.create', 'returns.create', 'inventory.adjust']
    },
    SALES_EXECUTIVE: {
      title: 'Sales & Consignment Officer',
      description: 'Customer directory management, dispatch request creation, and viewing invoices',
      permissions: ['customers.create', 'customers.view', 'invoices.view', 'billing.view']
    },
    AUDITOR: {
      title: 'Statutory Auditor / CA',
      description: 'Read-only audit inspection of ledgers, invoices, payments, and immutable mutation logs',
      permissions: ['audit.view', 'reports.view', 'ledger.view', 'invoices.view']
    }
  };

  const modulePermissionsList = [
    { module: 'Dashboard & Metrics', perms: ['dashboard.view'] },
    { module: 'Customers Management', perms: ['customers.view', 'customers.create', 'customers.update'] },
    { module: 'Product & Pricing Catalog', perms: ['products.view', 'products.create', 'pricing.update'] },
    { module: 'Company Warehouse Stock', perms: ['stock.receive', 'stock.adjust', 'inventory.view'] },
    { module: 'Customer Consignments', perms: ['dispatch.create', 'returns.create', 'consignment.view'] },
    { module: 'Sales & Tax Billing', perms: ['billing.create', 'invoices.finalize', 'invoices.cancel'] },
    { module: 'Payments & Receipts', perms: ['payments.create', 'payments.cancel'] },
    { module: 'Customer Financial Ledger', perms: ['ledger.view', 'ledger.export'] },
    { module: 'Statutory Reports & GST', perms: ['reports.view', 'reports.export'] },
    { module: 'Audit Trail & Compliance', perms: ['audit.view'] }
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white border border-neutral-200 rounded-lg shadow-2xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-950">Identity &amp; Role-Based Access Control</h1>
          <p className="text-xs text-neutral-500 font-mono mt-0.5">
            app_users relational entity • Single Root Administrator • Full Unconstrained Privileges (*)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="success" size="md">
            Active User: {currentUser?.name} ({currentUser?.role})
          </Badge>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-neutral-200 rounded-lg shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-neutral-200 bg-neutral-50/70 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-800">
            Provisioned Application Users ({Object.keys(users).length})
          </span>
          <span className="text-[11px] font-mono text-neutral-500 bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded">
            Security Policy: Administrator Only
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 font-mono text-neutral-600 text-[11px]">
                <th className="py-3 px-4">User Name</th>
                <th className="py-3 px-3">Email Address</th>
                <th className="py-3 px-3">Assigned Role</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-4 text-right">Session State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 font-sans">
              {Object.values(users).map((u) => {
                const isCurrent = currentUser?.id === u.id;
                return (
                  <tr key={u.id} className="hover:bg-neutral-50/70">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-neutral-900 flex items-center gap-2">
                        <span>{u.name}</span>
                        {isCurrent && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 bg-neutral-900 text-white rounded">
                            CURRENT
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-neutral-400">ID: #{u.id}</div>
                    </td>

                    <td className="py-3 px-3 font-mono text-neutral-600 text-[11px]">{u.email}</td>

                    <td className="py-3 px-3">
                      <Badge variant={u.role === 'ADMIN' ? 'neutral' : 'info'}>{u.role}</Badge>
                    </td>

                    <td className="py-3 px-3">
                      <Badge variant={u.is_active ? 'success' : 'neutral'}>
                        {u.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </Badge>
                    </td>

                    <td className="py-3 px-4 text-right">
                      {isCurrent ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-medium">
                          <Check className="w-3 h-3 text-emerald-600" /> Active Session
                        </span>
                      ) : (
                        <button
                          onClick={() => setCurrentUser(u.id)}
                          className="px-2.5 py-1 text-[11px] font-medium bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-300 rounded"
                        >
                          Switch User
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role Definitions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(roleDefinitions).map(([key, role]) => {
          const isActiveRole = key === 'ADMIN';
          return (
            <div
              key={key}
              className={`p-4 bg-white border rounded-lg shadow-2xs space-y-2 text-xs transition-colors ${
                isActiveRole
                  ? 'border-neutral-900 ring-1 ring-neutral-900/10'
                  : 'border-neutral-200 opacity-60'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-neutral-950 font-mono text-xs">{key}</span>
                  {isActiveRole && (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded font-semibold">
                      ACTIVE
                    </span>
                  )}
                </div>
                <Shield className={`w-4 h-4 ${isActiveRole ? 'text-neutral-900' : 'text-neutral-400'}`} />
              </div>
              <div className="font-semibold text-neutral-800">{role.title}</div>
              <p className="text-neutral-500 text-[11px] leading-relaxed">{role.description}</p>
              <div className="border-t border-neutral-100 pt-2 space-y-1">
                {role.permissions.map((p) => (
                  <div key={p} className="font-mono text-[10px] text-neutral-600 flex items-center gap-1.5">
                    <Check className={`w-3 h-3 ${isActiveRole ? 'text-emerald-600' : 'text-neutral-400'}`} />
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
