import React, { useMemo } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { formatINR, roundCurrency } from '../utils/calculations';
import {
  TrendingUp,
  CreditCard,
  AlertCircle,
  Users,
  FileCheck,
  Truck,
  BellRing,
  PackagePlus,
} from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, KpiCard, PageHeader } from '../components/ui';
import { TableShell, Table, THead, TBody, TR, TH, TD } from '../components/ui';
import {
  lastMonths,
  monthKeyOf,
  DeltaBadge,
  GroupedBars,
  SingleBars,
  compactINR,
  compactNum,
} from '../components/dashboard/MonthlyCharts';
import { useT } from '../i18n';

interface DashboardViewProps {
  onNavigate: (tab: string) => void;
  onOpenInvoice: (invoiceId: string) => void;
}

const MONTHS = 6;

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate, onOpenInvoice }) => {
  const { t } = useT();
  const { invoices, invoicePayments, customers, customerInventoryMovements } = useAccountingStore();

  const buckets = useMemo(() => lastMonths(MONTHS), []);
  const idxOf = useMemo(() => {
    const m = new Map<string, number>();
    buckets.forEach((b, i) => m.set(b.key, i));
    return m;
  }, [buckets]);
  const blank = () => new Array<number>(MONTHS).fill(0);

  // ---- Month-over-month series (last 6 calendar months) ----
  const salesByMonth = useMemo(() => {
    const out = blank();
    for (const inv of Object.values(invoices)) {
      if (inv.status !== 'FINALIZED') continue;
      const k = monthKeyOf(inv.invoice_date);
      const i = k ? idxOf.get(k) : undefined;
      if (i !== undefined) out[i] = roundCurrency(out[i] + inv.grand_total);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, idxOf]);

  const collByMonth = useMemo(() => {
    const out = blank();
    for (const p of Object.values(invoicePayments)) {
      if (p.status !== 'ACTIVE') continue;
      const k = monthKeyOf(p.payment_date);
      const i = k ? idxOf.get(k) : undefined;
      if (i !== undefined) out[i] = roundCurrency(out[i] + p.amount);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoicePayments, idxOf]);

  const invCountByMonth = useMemo(() => {
    const out = blank();
    for (const inv of Object.values(invoices)) {
      if (inv.status !== 'FINALIZED') continue;
      const k = monthKeyOf(inv.invoice_date);
      const i = k ? idxOf.get(k) : undefined;
      if (i !== undefined) out[i] += 1;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, idxOf]);

  const dispatchByMonth = useMemo(() => {
    const out = blank();
    for (const m of Object.values(customerInventoryMovements)) {
      if (m.movement_type !== 'DISPATCH' && m.movement_type !== 'ADJUSTMENT_IN') continue;
      const k = monthKeyOf(m.movement_date || m.created_at);
      const i = k ? idxOf.get(k) : undefined;
      if (i !== undefined) out[i] += m.quantity;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerInventoryMovements, idxOf]);

  const returnByMonth = useMemo(() => {
    const out = blank();
    for (const m of Object.values(customerInventoryMovements)) {
      if (m.movement_type !== 'RETURN' && m.movement_type !== 'ADJUSTMENT_OUT') continue;
      const k = monthKeyOf(m.movement_date || m.created_at);
      const i = k ? idxOf.get(k) : undefined;
      if (i !== undefined) out[i] += m.quantity;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerInventoryMovements, idxOf]);

  const newCustByMonth = useMemo(() => {
    const out = blank();
    for (const c of Object.values(customers)) {
      const k = monthKeyOf(c.created_at);
      const i = k ? idxOf.get(k) : undefined;
      if (i !== undefined) out[i] += 1;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, idxOf]);

  // ---- Headline totals ----
  const finalizedInvoices = Object.values(invoices).filter((i) => i.status === 'FINALIZED');
  const totalSales = finalizedInvoices.reduce((s, i) => roundCurrency(s + i.grand_total), 0);
  const activePayments = Object.values(invoicePayments).filter((p) => p.status === 'ACTIVE');
  const totalCollections = activePayments.reduce((s, p) => roundCurrency(s + p.amount), 0);
  const totalOutstanding = Math.max(0, roundCurrency(totalSales - totalCollections));

  const cur = MONTHS - 1;
  const prev = MONTHS - 2;

  // ---- The ONE table: invoices created but payment not received ----
  const paidByInvoice = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of activePayments) m.set(p.invoice_id, roundCurrency((m.get(p.invoice_id) ?? 0) + p.amount));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoicePayments]);

  const dueRows = useMemo(
    () =>
      finalizedInvoices
        .map((inv) => {
          const paid = paidByInvoice.get(inv.id) ?? 0;
          return { inv, paid, due: roundCurrency(inv.grand_total - paid) };
        })
        .filter((r) => r.due > 0.005)
        .sort((a, b) => b.due - a.due)
        .slice(0, 10),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices, invoicePayments]
  );
  const totalDue = dueRows.reduce((s, r) => roundCurrency(s + r.due), 0);

  const daysSince = (iso: string) => {
    const ms = Date.now() - new Date(iso).getTime();
    return Math.max(0, Math.floor(ms / 86400000));
  };

  const legend = (cls: string, label: string) => (
    <span className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
      <span className={`w-2.5 h-2.5 rounded-sm ${cls}`} />
      {label}
    </span>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        actions={
          <>
            <Button variant="primary" size="sm" onClick={() => onNavigate('billing')}>
              <FileCheck className="w-3.5 h-3.5" />
              <span>{t('dashboard.billInventory')}</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onNavigate('customer-inventory')}>
              <Truck className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{t('dashboard.dispatchStock')}</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onNavigate('company-inventory')}>
              <PackagePlus className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{t('dashboard.receiveStock')}</span>
            </Button>
          </>
        }
      />

      {/* KPI cards with this-month vs last-month deltas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={t('dashboard.kpiSales')}
          value={formatINR(totalSales)}
          sub={
            <span className="flex items-center gap-1.5">
              <DeltaBadge current={salesByMonth[cur]} previous={salesByMonth[prev]} />
              <span>{t('dashboard.momVsPrev')}</span>
            </span>
          }
          icon={<TrendingUp className="w-4 h-4" />}
          tone="default"
        />
        <KpiCard
          label={t('dashboard.kpiCollections')}
          value={formatINR(totalCollections)}
          sub={
            <span className="flex items-center gap-1.5">
              <DeltaBadge current={collByMonth[cur]} previous={collByMonth[prev]} />
              <span>{t('dashboard.momVsPrev')}</span>
            </span>
          }
          icon={<CreditCard className="w-4 h-4" />}
          tone="success"
          valueClassName="text-emerald-800 dark:text-emerald-300"
          subClassName="text-emerald-700 dark:text-emerald-300"
        />
        <KpiCard
          label={t('dashboard.kpiOutstanding')}
          value={formatINR(totalOutstanding)}
          sub={t('dashboard.kpiOutstandingSub')}
          icon={<AlertCircle className="w-4 h-4" />}
          tone="warning"
          valueClassName="text-amber-900 dark:text-amber-200"
          subClassName="text-amber-700 dark:text-amber-300"
        />
        <KpiCard
          label={t('dashboard.kpiField')}
          value={t('dashboard.kpiInvoicesValue', { count: finalizedInvoices.length })}
          sub={
            <span className="flex items-center gap-1.5">
              <DeltaBadge current={invCountByMonth[cur]} previous={invCountByMonth[prev]} />
              <span>{t('dashboard.momVsPrev')}</span>
            </span>
          }
          icon={<Users className="w-4 h-4" />}
          tone="info"
        />
      </div>

      {/* Graphical month-over-month comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="overflow-hidden shadow-2xs">
          <CardHeader>
            <div>
              <CardTitle>{t('dashboard.chartFinance')}</CardTitle>
              <div className="text-[11px] font-mono text-muted-foreground mt-0.5">{t('dashboard.monthsNote')}</div>
            </div>
            <div className="flex items-center gap-3">
              {legend('bg-primary', t('dashboard.chartFinanceSales'))}
              {legend('bg-emerald-500', t('dashboard.chartFinanceColl'))}
            </div>
          </CardHeader>
          <div className="p-4">
            <GroupedBars
              title={t('dashboard.chartFinance')}
              buckets={buckets}
              a={salesByMonth}
              b={collByMonth}
              formatTick={compactINR}
            />
          </div>
        </Card>

        <Card className="overflow-hidden shadow-2xs">
          <CardHeader>
            <div>
              <CardTitle>{t('dashboard.chartInvoices')}</CardTitle>
              <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                {t('dashboard.thisMonth', { count: invCountByMonth[cur] })} •{' '}
                {t('dashboard.lastMonth', { count: invCountByMonth[prev] })}
              </div>
            </div>
            <DeltaBadge current={invCountByMonth[cur]} previous={invCountByMonth[prev]} />
          </CardHeader>
          <div className="p-4">
            <SingleBars
              title={t('dashboard.chartInvoices')}
              buckets={buckets}
              values={invCountByMonth}
              formatTick={compactNum}
            />
          </div>
        </Card>

        <Card className="overflow-hidden shadow-2xs">
          <CardHeader>
            <div>
              <CardTitle>{t('dashboard.chartChallans')}</CardTitle>
              <div className="text-[11px] font-mono text-muted-foreground mt-0.5">{t('dashboard.monthsNote')}</div>
            </div>
            <div className="flex items-center gap-3">
              {legend('bg-sky-500', t('dashboard.seriesDispatched'))}
              {legend('bg-destructive', t('dashboard.seriesReturned'))}
            </div>
          </CardHeader>
          <div className="p-4">
            <GroupedBars
              title={t('dashboard.chartChallans')}
              buckets={buckets}
              a={dispatchByMonth}
              b={returnByMonth}
              formatTick={compactNum}
              classA="fill-sky-500"
              classB="fill-destructive"
            />
          </div>
        </Card>

        <Card className="overflow-hidden shadow-2xs">
          <CardHeader>
            <div>
              <CardTitle>{t('dashboard.chartCustomers')}</CardTitle>
              <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                {t('dashboard.thisMonth', { count: newCustByMonth[cur] })} •{' '}
                {t('dashboard.lastMonth', { count: newCustByMonth[prev] })}
              </div>
            </div>
            <DeltaBadge current={newCustByMonth[cur]} previous={newCustByMonth[prev]} />
          </CardHeader>
          <div className="p-4">
            <SingleBars
              title={t('dashboard.chartCustomers')}
              buckets={buckets}
              values={newCustByMonth}
              formatTick={compactNum}
              barClass="fill-muted-foreground/40"
              lastClass="fill-chart-2"
            />
          </div>
        </Card>
      </div>

      {/* The single table: payment-due alert for the admin */}
      <Card className="overflow-hidden shadow-2xs">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-destructive" />
            <div>
              <CardTitle>{t('dashboard.dueTitle')}</CardTitle>
              <div className="text-[11px] font-mono text-muted-foreground mt-0.5 font-normal normal-case tracking-normal">
                {dueRows.length === 0
                  ? t('dashboard.allClear')
                  : t('dashboard.dueSub', { count: dueRows.length, amount: formatINR(totalDue) })}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onNavigate('invoices')} className="font-mono">
            {t('common.viewAll')}
          </Button>
        </CardHeader>
        {dueRows.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">{t('dashboard.allClear')}</div>
        ) : (
          <TableShell>
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH className="text-left">{t('dashboard.thInvoice')}</TH>
                  <TH className="text-left">{t('dashboard.thCustomer')}</TH>
                  <TH className="text-left">{t('dashboard.thDate')}</TH>
                  <TH className="text-right">{t('dashboard.thTotal')}</TH>
                  <TH className="text-right">{t('dashboard.thReceived')}</TH>
                  <TH className="text-right">{t('dashboard.thDue')}</TH>
                  <TH className="text-right">{t('dashboard.thAction')}</TH>
                </TR>
              </THead>
              <TBody>
                {dueRows.map(({ inv, paid, due }) => (
                  <TR key={inv.id} className="border-t border-border hover:bg-muted/50">
                    <TD className="font-mono font-semibold">{inv.invoice_number}</TD>
                    <TD>{inv.customer_snapshot.customer_name}</TD>
                    <TD className="font-mono text-muted-foreground text-[11px]">
                      {new Date(inv.invoice_date).toLocaleDateString()}
                      <span className="block text-[10px]">{t('dashboard.daysPending', { count: daysSince(inv.invoice_date) })}</span>
                    </TD>
                    <TD className="font-mono text-right">{formatINR(inv.grand_total)}</TD>
                    <TD className="font-mono text-right text-emerald-800 dark:text-emerald-300">{formatINR(paid)}</TD>
                    <TD className="font-mono text-right font-bold text-destructive">{formatINR(due)}</TD>
                    <TD className="text-right">
                      <Button variant="secondary" size="sm" onClick={() => onOpenInvoice(inv.id)}>
                        {t('dashboard.collect')}
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableShell>
        )}
      </Card>
    </div>
  );
};
