// Customer Credit: per-customer view of the return-credit ledger (v20).
// Credit is EARNED by RETURN movements (rate × quantity) and CONSUMED
// manually from the Invoices view (Apply Credit → credit_applied_amount),
// so this read-only view re-aggregates customerInventoryMovements — the
// same view-side aggregation pattern the Ledger and Holdings views use.
// Slip grouping mirrors the holdings list: v9+ document headers first,
// legacy rows (document_id null) grouped by return reference.

import React, { useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { formatINR, roundCurrency } from '../utils/calculations';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Card,
  CardHeader,
  PageHeader,
  TableShell,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD
} from '../components/ui';
import { useT } from '../i18n';
import type { CustomerInventoryMovement } from '../types/database';

interface CreditLine {
  key: string;
  date: string;
  ref: string;
  product: string;
  qty: number;
  unitCode: string;
  rate: number | null;
  earned: number | null; // rate × qty; null for rate-less (legacy seed) rows
  applied: number;
}

interface CreditRow {
  customerId: string;
  name: string;
  number: string;
  slips: number;
  earned: number;
  applied: number;
  available: number;
  lines: CreditLine[];
}

export const CustomerCreditView: React.FC = () => {
  const { t } = useT();
  const {
    customers,
    products,
    uoms,
    customerInventoryMovements,
    dispatchDocuments,
    getCustomerReturnCredit
  } = useAccountingStore();

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows: CreditRow[] = (() => {
    // Slip = one return document (or one legacy reference): movements grouped,
    // each movement becomes one detail line.
    const movementsByCustomer: Record<string, CustomerInventoryMovement[]> = {};
    for (const m of Object.values(customerInventoryMovements)) {
      if (m.movement_type !== 'RETURN') continue;
      (movementsByCustomer[m.customer_id] ??= []).push(m);
    }

    const out: CreditRow[] = [];
    for (const [customerId, movs] of Object.entries(movementsByCustomer)) {
      const customer = customers[customerId];
      if (!customer) continue; // movement rows always point at live customers

      const slips = new Map<string, { number: string; date: string; movs: CustomerInventoryMovement[] }>();
      for (const m of movs) {
        const header = m.document_id ? dispatchDocuments[m.document_id] : undefined;
        const key = header ? `doc-${header.id}` : `legacy-${m.reference_id}`;
        const slip = slips.get(key) ?? {
          number: header ? header.document_number : m.reference_id,
          date: header ? header.document_date : m.movement_date,
          movs: []
        };
        slip.movs.push(m);
        slips.set(key, slip);
      }

      const lines: CreditLine[] = [];
      for (const slip of slips.values()) {
        const ordered = [...slip.movs].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        for (const m of ordered) {
          const rate = m.rate ?? null;
          lines.push({
            key: m.id,
            date: m.movement_date,
            ref: slip.number,
            product: products[m.product_id]?.product_name || t('dashboard.itemFallback'),
            qty: m.quantity,
            unitCode: uoms[m.unit_id]?.code || 'PCS',
            rate,
            earned: rate === null ? null : roundCurrency(rate * m.quantity),
            applied: roundCurrency(m.credit_applied_amount ?? 0)
          });
        }
      }
      if (lines.length === 0) continue;

      const earned = roundCurrency(
        lines.reduce((sum, l) => sum + (l.earned ?? 0), 0)
      );
      const applied = roundCurrency(lines.reduce((sum, l) => sum + l.applied, 0));
      out.push({
        customerId,
        name: customer.customer_name,
        number: customer.customer_number,
        slips: slips.size,
        earned,
        applied,
        available: getCustomerReturnCredit(customerId),
        lines
      });
    }

    out.sort(
      (a, b) =>
        b.available - a.available ||
        b.earned - a.earned ||
        a.name.localeCompare(b.name)
    );
    return out;
  })();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('customerCredit.title')}
        subtitle={t('customerCredit.subtitle')}
      />

      <TableShell>
        <CardHeader>
          <div className="font-semibold text-foreground text-xs flex items-center gap-2">
            {t('customerCredit.caption')}
            <span className="text-[10px] font-normal text-muted-foreground">
              {t('customerCredit.expandedHint')}
            </span>
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          <Table className="text-left border-collapse">
            <caption className="sr-only">{t('customerCredit.caption')}</caption>
            <THead>
              <TR className="hover:bg-transparent">
                <TH scope="col">{t('customerCredit.thCustomer')}</TH>
                <TH scope="col" className="text-right">{t('customerCredit.thReturns')}</TH>
                <TH scope="col" className="text-right">{t('customerCredit.thEarned')}</TH>
                <TH scope="col" className="text-right">{t('customerCredit.thApplied')}</TH>
                <TH scope="col" className="text-right px-4">{t('customerCredit.thAvailable')}</TH>
              </TR>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <tr>
                  <TD colSpan={5} className="py-8 text-center text-muted-foreground">
                    {t('customerCredit.empty')}
                  </TD>
                </tr>
              ) : (
                rows.map((row) => {
                  const isExpanded = expandedId === row.customerId;
                  const Chevron = isExpanded ? ChevronDown : ChevronRight;
                  return (
                    <React.Fragment key={row.customerId}>
                      <TR
                        onClick={() => setExpandedId(isExpanded ? null : row.customerId)}
                        className="cursor-pointer"
                      >
                        <TD>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              aria-expanded={isExpanded}
                              aria-label={row.name}
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedId(isExpanded ? null : row.customerId);
                              }}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Chevron className="w-3.5 h-3.5" />
                            </button>
                            <div>
                              <div className="font-semibold text-foreground">{row.name}</div>
                              <div className="text-[11px] font-mono text-muted-foreground">
                                {row.number}
                              </div>
                            </div>
                          </div>
                        </TD>
                        <TD className="text-right font-mono">{row.slips}</TD>
                        <TD className="text-right font-mono">{formatINR(row.earned)}</TD>
                        <TD className="text-right font-mono">{formatINR(row.applied)}</TD>
                        <TD className="text-right px-4">
                          <span className="font-mono font-bold text-foreground">
                            {formatINR(row.available)}
                          </span>
                        </TD>
                      </TR>
                      {isExpanded && (
                        <tr>
                          <TD colSpan={5} className="bg-muted/30 p-0">
                            <div className="overflow-x-auto p-2">
                              <Table className="text-left border-collapse">
                                <THead>
                                  <TR className="hover:bg-transparent">
                                    <TH scope="col">{t('customerCredit.thDate')}</TH>
                                    <TH scope="col">{t('customerCredit.thReturnRef')}</TH>
                                    <TH scope="col">{t('customerCredit.thProduct')}</TH>
                                    <TH scope="col" className="text-right">{t('customerCredit.thQty')}</TH>
                                    <TH scope="col" className="text-right">{t('customerCredit.thRate')}</TH>
                                    <TH scope="col" className="text-right">{t('customerCredit.thLineEarned')}</TH>
                                    <TH scope="col" className="text-right">{t('customerCredit.thAppliedCol')}</TH>
                                    <TH scope="col" className="text-right">{t('customerCredit.thRemaining')}</TH>
                                  </TR>
                                </THead>
                                <TBody>
                                  {row.lines.map((l) => (
                                    <TR key={l.key}>
                                      <TD className="font-mono text-[11px]">
                                        {new Date(l.date).toLocaleDateString()}
                                      </TD>
                                      <TD className="font-mono text-[11px]">{l.ref}</TD>
                                      <TD>{l.product}</TD>
                                      <TD className="text-right font-mono">
                                        {l.qty} {l.unitCode}
                                      </TD>
                                      <TD className="text-right font-mono">
                                        {l.rate === null ? (
                                          <span className="text-muted-foreground">
                                            {t('customerCredit.noRates')}
                                          </span>
                                        ) : (
                                          formatINR(l.rate)
                                        )}
                                      </TD>
                                      <TD className="text-right font-mono">
                                        {l.earned === null ? (
                                          <span className="text-muted-foreground">
                                            {t('customerCredit.noRates')}
                                          </span>
                                        ) : (
                                          formatINR(l.earned)
                                        )}
                                      </TD>
                                      <TD className="text-right font-mono">{formatINR(l.applied)}</TD>
                                      <TD className="text-right font-mono">
                                        {l.earned === null ? (
                                          <span className="text-muted-foreground">
                                            {t('customerCredit.noRates')}
                                          </span>
                                        ) : (
                                          formatINR(roundCurrency(l.earned - l.applied))
                                        )}
                                      </TD>
                                    </TR>
                                  ))}
                                </TBody>
                              </Table>
                            </div>
                          </TD>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TBody>
          </Table>
        </div>
      </TableShell>

      <Card className="p-4 shadow-2xs">
        <div className="text-[11px] text-muted-foreground">
          {t('customerCredit.formula')}
        </div>
      </Card>
    </div>
  );
};
