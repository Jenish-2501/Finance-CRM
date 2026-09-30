import React from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { formatINR, roundCurrency } from '../utils/calculations';
import {
  TrendingUp,
  CreditCard,
  AlertCircle,
  Users,
  Package,
  Layers,
  Truck,
  ArrowUpRight,
  ArrowDownLeft,
  FileCheck,
  ShieldCheck,
  Clock
} from 'lucide-react';
import { Badge } from '../components/common/Badge';

interface DashboardViewProps {
  onNavigate: (tab: string) => void;
  onOpenInvoice: (invoiceId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate, onOpenInvoice }) => {
  const {
    invoices,
    invoicePayments,
    customers,
    products,
    inventoryMovements,
    customerInventoryMovements,
    auditLogs,
    getCurrentCompanyStock
  } = useAccountingStore();

  // Metrics derived from centralized normalized store
  const finalizedInvoices = Object.values(invoices).filter((i) => i.status === 'FINALIZED');
  const totalSales = finalizedInvoices.reduce((sum, i) => roundCurrency(sum + i.grand_total), 0);

  const activePayments = Object.values(invoicePayments).filter((p) => p.status === 'ACTIVE');
  const totalCollections = activePayments.reduce((sum, p) => roundCurrency(sum + p.amount), 0);

  const totalOutstanding = Math.max(0, roundCurrency(totalSales - totalCollections));

  const totalCustomers = Object.keys(customers).length;
  const totalProducts = Object.keys(products).length;

  // Total primary units across all company stock
  const totalCompanyStockUnits = Object.keys(products).reduce(
    (sum, pId) => sum + getCurrentCompanyStock(pId),
    0
  );

  // Total items held across all customer inventories
  const totalCustomerHoldingUnits = Object.values(customerInventoryMovements).reduce(
    (sum, m) => {
      if (m.movement_type === 'DISPATCH' || m.movement_type === 'ADJUSTMENT_IN') {
        return sum + m.quantity;
      } else if (m.movement_type === 'RETURN' || m.movement_type === 'ADJUSTMENT_OUT') {
        return sum - m.quantity;
      }
      return sum;
    },
    0
  );

  const recentInvoices = Object.values(invoices)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const recentPayments = Object.values(invoicePayments)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const recentMovements = Object.values(inventoryMovements)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Shortcuts */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white border border-neutral-200 rounded-lg shadow-2xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-950">Financial &amp; Operations Overview</h1>
          <p className="text-xs text-neutral-500 font-mono mt-0.5">
            Normalized double-entry reconciliation • Real-time movement aggregation
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onNavigate('billing')}
            className="px-3 py-1.5 text-xs font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <FileCheck className="w-3.5 h-3.5" />
            <span>Bill Customer Inventory</span>
          </button>
          <button
            onClick={() => onNavigate('customer-inventory')}
            className="px-3 py-1.5 text-xs font-medium bg-white text-neutral-700 border border-neutral-300 rounded hover:bg-neutral-50 transition-colors flex items-center gap-1.5"
          >
            <Truck className="w-3.5 h-3.5 text-neutral-500" />
            <span>Dispatch Stock</span>
          </button>
          <button
            onClick={() => onNavigate('company-inventory')}
            className="px-3 py-1.5 text-xs font-medium bg-white text-neutral-700 border border-neutral-300 rounded hover:bg-neutral-50 transition-colors flex items-center gap-1.5"
          >
            <Layers className="w-3.5 h-3.5 text-neutral-500" />
            <span>Receive Inward Stock</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Sales */}
        <div className="p-4 bg-white border border-neutral-200 rounded-lg shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Total Invoiced Sales
            </span>
            <div className="p-1.5 bg-neutral-100 rounded text-neutral-700">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-neutral-950">
            {formatINR(totalSales)}
          </div>
          <div className="mt-1 text-[11px] text-neutral-500 font-mono">
            {finalizedInvoices.length} Finalized Invoices
          </div>
        </div>

        {/* Total Collections */}
        <div className="p-4 bg-white border border-neutral-200 rounded-lg shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Total Collections
            </span>
            <div className="p-1.5 bg-emerald-50 rounded text-emerald-700">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-emerald-800">
            {formatINR(totalCollections)}
          </div>
          <div className="mt-1 text-[11px] text-emerald-700 font-mono">
            {activePayments.length} Active Receipts
          </div>
        </div>

        {/* Outstanding Receivables */}
        <div className="p-4 bg-white border border-neutral-200 rounded-lg shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Outstanding Receivables
            </span>
            <div className="p-1.5 bg-amber-50 rounded text-amber-700">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-amber-900">
            {formatINR(totalOutstanding)}
          </div>
          <div className="mt-1 text-[11px] text-amber-700 font-mono">
            Sales - Receipts Balance
          </div>
        </div>

        {/* Inventory Holdings */}
        <div className="p-4 bg-white border border-neutral-200 rounded-lg shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Inventory in Field
            </span>
            <div className="p-1.5 bg-sky-50 rounded text-sky-700">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-neutral-900">
            {totalCustomerHoldingUnits.toLocaleString()} <span className="text-sm font-normal text-neutral-500">Units</span>
          </div>
          <div className="mt-1 text-[11px] text-neutral-500 font-mono">
            Company Stock: {totalCompanyStockUnits.toLocaleString()} Units
          </div>
        </div>
      </div>

      {/* Operational Tables Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <div className="bg-white border border-neutral-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/60">
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-neutral-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                Recent Invoices
              </h2>
            </div>
            <button
              onClick={() => onNavigate('invoices')}
              className="text-xs text-neutral-600 hover:text-neutral-900 font-medium font-mono"
            >
              View all →
            </button>
          </div>

          <div className="divide-y divide-neutral-200 text-xs">
            {recentInvoices.map((inv) => (
              <div
                key={inv.id}
                onClick={() => onOpenInvoice(inv.id)}
                className="p-3.5 hover:bg-neutral-50 flex items-center justify-between cursor-pointer transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-neutral-900">{inv.invoice_number}</span>
                    <Badge
                      variant={
                        inv.status === 'FINALIZED'
                          ? 'success'
                          : inv.status === 'DRAFT'
                          ? 'warning'
                          : 'danger'
                      }
                    >
                      {inv.status}
                    </Badge>
                  </div>
                  <div className="text-neutral-600 text-[11px] mt-0.5">
                    {inv.customer_snapshot.customer_name}
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-mono font-bold text-neutral-950">
                    {formatINR(inv.grand_total)}
                  </div>
                  <div className="text-[11px] font-mono text-neutral-400">
                    {new Date(inv.invoice_date).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Payment Receipts */}
        <div className="bg-white border border-neutral-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/60">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-neutral-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                Recent Payment Collections
              </h2>
            </div>
            <button
              onClick={() => onNavigate('payments')}
              className="text-xs text-neutral-600 hover:text-neutral-900 font-medium font-mono"
            >
              View all →
            </button>
          </div>

          <div className="divide-y divide-neutral-200 text-xs">
            {recentPayments.length === 0 ? (
              <div className="p-6 text-center text-neutral-400 text-xs">No payments recorded yet.</div>
            ) : (
              recentPayments.map((pay) => {
                const inv = invoices[pay.invoice_id];
                return (
                  <div key={pay.id} className="p-3.5 hover:bg-neutral-50 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-emerald-800">
                          {formatINR(pay.amount)}
                        </span>
                        <Badge variant="neutral">{pay.payment_method}</Badge>
                      </div>
                      <div className="text-neutral-500 text-[11px] mt-0.5">
                        Against Inv #{inv?.invoice_number || 'N/A'} • {pay.reference_number || 'No Ref'}
                      </div>
                    </div>

                    <div className="text-right text-[11px] font-mono text-neutral-500">
                      {new Date(pay.payment_date).toLocaleDateString()}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Recent Movements & Audit Trail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Company Movements */}
        <div className="bg-white border border-neutral-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/60">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-neutral-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                Recent Inventory Movements
              </h2>
            </div>
            <button
              onClick={() => onNavigate('company-inventory')}
              className="text-xs text-neutral-600 hover:text-neutral-900 font-medium font-mono"
            >
              View ledger →
            </button>
          </div>

          <div className="divide-y divide-neutral-200 text-xs">
            {recentMovements.map((mov) => {
              const prod = products[mov.product_id];
              const isPositive =
                mov.movement_type === 'STOCK_IN' ||
                mov.movement_type === 'CUSTOMER_RETURN' ||
                mov.movement_type === 'ADJUSTMENT_IN';

              return (
                <div key={mov.id} className="p-3.5 flex items-center justify-between hover:bg-neutral-50">
                  <div>
                    <div className="font-semibold text-neutral-900">{prod?.product_name || 'Item'}</div>
                    <div className="text-neutral-500 text-[11px]">{mov.notes}</div>
                  </div>

                  <div className="text-right">
                    <div
                      className={`font-mono font-bold ${
                        isPositive ? 'text-emerald-700' : 'text-neutral-800'
                      }`}
                    >
                      {isPositive ? '+' : '-'}
                      {mov.quantity}
                    </div>
                    <div className="text-[10px] font-mono uppercase text-neutral-400">
                      {mov.movement_type.replace('_', ' ')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Audit Activity */}
        <div className="bg-white border border-neutral-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/60">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-neutral-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                Recent System Mutations
              </h2>
            </div>
            <button
              onClick={() => onNavigate('activity')}
              className="text-xs text-neutral-600 hover:text-neutral-900 font-medium font-mono"
            >
              Full audit log →
            </button>
          </div>

          <div className="divide-y divide-neutral-200 text-xs">
            {auditLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="p-3.5 flex items-center justify-between hover:bg-neutral-50">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-neutral-800 font-semibold">{log.action}</span>
                    <span className="text-[10px] font-mono text-neutral-400">by {log.user_name}</span>
                  </div>
                  <div className="text-neutral-500 text-[11px] truncate max-w-xs mt-0.5">
                    {log.entity_type} #{log.entity_id}
                  </div>
                </div>

                <div className="text-right font-mono text-[10px] text-neutral-400">
                  {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
