import React from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { formatINR, roundCurrency } from '../utils/calculations';
import {
  TrendingUp,
  CreditCard,
  AlertCircle,
  Layers,
  Truck,
  FileCheck,
  Clock
} from 'lucide-react';
import { Badge } from '../components/common/Badge';
import { Button, Card, CardHeader, CardTitle, KpiCard, PageHeader } from '../components/ui';

interface DashboardViewProps {
  onNavigate: (tab: string) => void;
  onOpenInvoice: (invoiceId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate, onOpenInvoice }) => {
  const {
    invoices,
    invoicePayments,
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
      <PageHeader
        title="Financial & Operations Overview"
        subtitle="Normalized double-entry reconciliation • Real-time movement aggregation"
        actions={
          <>
            <Button variant="primary" size="sm" onClick={() => onNavigate('billing')}>
              <FileCheck className="w-3.5 h-3.5" />
              <span>Bill Customer Inventory</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onNavigate('customer-inventory')}>
              <Truck className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Dispatch Stock</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onNavigate('company-inventory')}>
              <Layers className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Receive Inward Stock</span>
            </Button>
          </>
        }
      />

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total Invoiced Sales"
          value={formatINR(totalSales)}
          sub={`${finalizedInvoices.length} Finalized Invoices`}
          icon={<TrendingUp className="w-4 h-4" />}
          tone="default"
        />
        <KpiCard
          label="Total Collections"
          value={formatINR(totalCollections)}
          sub={`${activePayments.length} Active Receipts`}
          icon={<CreditCard className="w-4 h-4" />}
          tone="success"
          valueClassName="text-emerald-800 dark:text-emerald-300"
          subClassName="text-emerald-700 dark:text-emerald-300"
        />
        <KpiCard
          label="Outstanding Receivables"
          value={formatINR(totalOutstanding)}
          sub="Sales - Receipts Balance"
          icon={<AlertCircle className="w-4 h-4" />}
          tone="warning"
          valueClassName="text-amber-900 dark:text-amber-200"
          subClassName="text-amber-700 dark:text-amber-300"
        />
        <KpiCard
          label="Inventory in Field"
          value={`${totalCustomerHoldingUnits.toLocaleString()} Units`}
          sub={`Company Stock: ${totalCompanyStockUnits.toLocaleString()} Units`}
          icon={<Truck className="w-4 h-4" />}
          tone="info"
        />
      </div>

      {/* Operational Tables Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <Card className="overflow-hidden shadow-2xs">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-muted-foreground" />
              <CardTitle>Recent Invoices</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('invoices')} className="font-mono">
              View all →
            </Button>
          </CardHeader>

          <div className="divide-y divide-border text-xs">
            {recentInvoices.map((inv) => (
              <div
                key={inv.id}
                onClick={() => onOpenInvoice(inv.id)}
                className="p-3.5 hover:bg-muted flex items-center justify-between cursor-pointer transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-foreground">{inv.invoice_number}</span>
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
                  <div className="text-muted-foreground text-[11px] mt-0.5">
                    {inv.customer_snapshot.customer_name}
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-mono font-bold text-foreground">
                    {formatINR(inv.grand_total)}
                  </div>
                  <div className="text-[11px] font-mono text-muted-foreground">
                    {new Date(inv.invoice_date).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Recent Payment Receipts */}
        <Card className="overflow-hidden shadow-2xs">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
              <CardTitle>Recent Payment Collections</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('payments')} className="font-mono">
              View all →
            </Button>
          </CardHeader>

          <div className="divide-y divide-border text-xs">
            {recentPayments.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-xs">No payments recorded yet.</div>
            ) : (
              recentPayments.map((pay) => {
                const inv = invoices[pay.invoice_id];
                return (
                  <div key={pay.id} className="p-3.5 hover:bg-muted flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-emerald-800 dark:text-emerald-300">
                          {formatINR(pay.amount)}
                        </span>
                        <Badge variant="neutral">{pay.payment_method}</Badge>
                      </div>
                      <div className="text-muted-foreground text-[11px] mt-0.5">
                        Against Inv #{inv?.invoice_number || 'N/A'} • {pay.reference_number || 'No Ref'}
                      </div>
                    </div>

                    <div className="text-right text-[11px] font-mono text-muted-foreground">
                      {new Date(pay.payment_date).toLocaleDateString()}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {/* Recent Movements & Audit Trail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Company Movements */}
        <Card className="overflow-hidden shadow-2xs">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-muted-foreground" />
              <CardTitle>Recent Inventory Movements</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('company-inventory')} className="font-mono">
              View ledger →
            </Button>
          </CardHeader>

          <div className="divide-y divide-border text-xs">
            {recentMovements.map((mov) => {
              const prod = products[mov.product_id];
              const isPositive =
                mov.movement_type === 'STOCK_IN' ||
                mov.movement_type === 'CUSTOMER_RETURN' ||
                mov.movement_type === 'ADJUSTMENT_IN';

              return (
                <div key={mov.id} className="p-3.5 flex items-center justify-between hover:bg-muted">
                  <div>
                    <div className="font-semibold text-foreground">{prod?.product_name || 'Item'}</div>
                    <div className="text-muted-foreground text-[11px]">{mov.notes}</div>
                  </div>

                  <div className="text-right">
                    <div
                      className={`font-mono font-bold ${
                        isPositive ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground'
                      }`}
                    >
                      {isPositive ? '+' : '-'}
                      {mov.quantity}
                    </div>
                    <div className="text-[10px] font-mono uppercase text-muted-foreground">
                      {mov.movement_type.replace('_', ' ')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Audit Activity */}
        <Card className="overflow-hidden shadow-2xs">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <CardTitle>Recent System Mutations</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('activity')} className="font-mono">
              Full audit log →
            </Button>
          </CardHeader>

          <div className="divide-y divide-border text-xs">
            {auditLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="p-3.5 flex items-center justify-between hover:bg-muted">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-foreground font-semibold">{log.action}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">by {log.user_name}</span>
                  </div>
                  <div className="text-muted-foreground text-[11px] truncate max-w-xs mt-0.5">
                    {log.entity_type} #{log.entity_id}
                  </div>
                </div>

                <div className="text-right font-mono text-[10px] text-muted-foreground">
                  {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
