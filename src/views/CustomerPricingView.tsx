import React, { useMemo, useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { CustomerPicker, firstCustomerId, formatCustomerLabel } from '../components/common/CustomerPicker';
import { formatINR, roundCurrency } from '../utils/calculations';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { Button, Card, CardFooter, Input, Label, PageHeader, TableShell, Table, THead, TBody, TR, TH, TD } from '../components/ui';
import { useT } from '../i18n';
import { History, Save, CheckCircle2, AlertTriangle } from 'lucide-react';

export const CustomerPricingView: React.FC = () => {
  const { t } = useT();
  const {
    customers,
    products,
    uoms,
    productUnits,
    customerPrices,
    getProductEffectivePrice,
    getCustomerPriceHistory,
    setCustomerPrice,
    clearCustomerPrice
  } = useAccountingStore();

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('cust-1');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [rowMsg, setRowMsg] = useState<Record<string, { kind: 'success' | 'error'; text: string }>>({});
  const [historyOpen, setHistoryOpen] = useState(false);

  // Default to the first real customer when the stored id is gone
  // (e.g. seed-only 'cust-1' in a live database) so the page never opens empty.
  const effectiveCustomerId = firstCustomerId(customers, selectedCustomerId);
  const customer = customers[effectiveCustomerId] || null;

  // One row per product × billing unit (usually one row per product).
  const rows = useMemo(() => {
    const list: Array<{
      key: string;
      productId: string;
      productName: string;
      sku: string;
      unitId: string;
      unitCode: string;
      basePrice: number;
      agreedPrice: number | null;
    }> = [];
    for (const prod of Object.values(products).filter((p) => p.is_active)) {
      const billingUnits = Object.values(productUnits).filter(
        (pu) => pu.product_id === prod.id && pu.is_billing_unit
      );
      for (const pu of billingUnits) {
        const agreed = Object.values(customerPrices).find(
          (cp) =>
            cp.customer_id === effectiveCustomerId &&
            cp.product_id === prod.id &&
            cp.unit_id === pu.unit_id
        );
        list.push({
          key: `${prod.id}__${pu.unit_id}`,
          productId: prod.id,
          productName: prod.product_name,
          sku: prod.sku,
          unitId: pu.unit_id,
          unitCode: uoms[pu.unit_id]?.code || 'PCS',
          basePrice: getProductEffectivePrice(prod.id, pu.unit_id),
          agreedPrice: agreed ? agreed.price : null
        });
      }
    }
    return list.sort((a, b) => a.productName.localeCompare(b.productName));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, productUnits, uoms, customerPrices, effectiveCustomerId]);

  const history = useMemo(
    () => (effectiveCustomerId ? getCustomerPriceHistory(effectiveCustomerId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effectiveCustomerId, customerPrices]
  );

  const handleSave = (row: (typeof rows)[0]) => {
    const raw = (drafts[row.key] ?? '').trim();
    setRowMsg((prev) => {
      const next = { ...prev };
      delete next[row.key];
      return next;
    });
    let result: { success: boolean; error?: string };
    if (raw === '') {
      result = clearCustomerPrice(effectiveCustomerId, row.productId, row.unitId);
    } else {
      const price = Number(raw);
      if (!Number.isFinite(price)) {
        setRowMsg((prev) => ({ ...prev, [row.key]: { kind: 'error', text: t('pricing.errAmount') } }));
        return;
      }
      result = setCustomerPrice({ customerId: effectiveCustomerId, productId: row.productId, unitId: row.unitId, price });
    }
    if (!result.success) {
      setRowMsg((prev) => ({ ...prev, [row.key]: { kind: 'error', text: result.error || t('pricing.errSave') } }));
      return;
    }
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[row.key];
      return next;
    });
    setRowMsg((prev) => ({ ...prev, [row.key]: { kind: 'success', text: raw === '' ? t('pricing.baseApplies') : t('pricing.agreedSaved') } }));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pricing.title')}
        subtitle={t('pricing.subtitle')}
        actions={
          <Button variant="secondary" size="sm" onClick={() => setHistoryOpen(true)} disabled={!customer}>
            <History className="w-3.5 h-3.5" />
            <span>{t('pricing.history')}{customer ? ` — ${customer.customer_number}` : ''}</span>
          </Button>
        }
      />

      <Card className="p-4 text-xs shadow-2xs">
        <Label className="mb-1">{t('pricing.selectCustomer')}</Label>
        <div className="max-w-md">
          <CustomerPicker
            value={effectiveCustomerId}
            onChange={(id) => setSelectedCustomerId(id)}
            customers={customers}
          />
        </div>
        {customer && (
          <div className="text-[11px] font-mono text-muted-foreground mt-1">
            {formatCustomerLabel(customer)} • {customer.city} • GSTIN: {customer.gst_number || 'N/A'}
          </div>
        )}
      </Card>

      <TableShell>
        <div className="p-4 border-b border-border bg-muted/70 text-xs font-bold uppercase tracking-wider text-foreground">
          {t('pricing.agreedTitle', { count: rows.length })}
        </div>
        <div className="overflow-x-auto">
          <Table className="text-left border-collapse">
            <caption className="sr-only">{t('pricing.caption')}</caption>
            <THead>
              <TR className="hover:bg-transparent">
                <TH scope="col">{t('pricing.thProduct')}</TH>
                <TH scope="col">{t('pricing.thUnit')}</TH>
                <TH scope="col" className="text-right">{t('pricing.thBase')}</TH>
                <TH scope="col" className="text-right">{t('pricing.thAgreed')}</TH>
                <TH scope="col" className="text-right">{t('pricing.thMargin')}</TH>
                <TH scope="col" className="text-center">{t('pricing.thApplies')}</TH>
                <TH scope="col" className="text-right px-4">{t('pricing.thAction')}</TH>
              </TR>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    {t('pricing.empty')}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const draft = drafts[row.key] ?? (row.agreedPrice !== null ? String(row.agreedPrice) : '');
                  const effective = draft.trim() === '' ? null : Number(draft);
                  const margin = effective !== null && Number.isFinite(effective) ? roundCurrency(effective - row.basePrice) : null;
                  const marginPct = margin !== null && row.basePrice > 0 ? roundCurrency((margin / row.basePrice) * 100) : null;
                  const msg = rowMsg[row.key];
                  return (
                    <TR key={row.key}>
                      <TD>
                        <div className="font-semibold">{row.productName}</div>
                        <div className="text-[11px] font-mono text-muted-foreground">{row.sku}</div>
                      </TD>
                      <TD className="font-mono">{row.unitCode}</TD>
                      <TD className="text-right font-mono">{formatINR(row.basePrice)}</TD>
                      <TD>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [row.key]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSave(row);
                            }
                          }}
                          placeholder={row.basePrice ? String(row.basePrice) : t('pricing.basePh')}
                          className="w-28 font-mono text-right ml-auto block"
                        />
                        {msg && (
                          <div className={`text-[10px] mt-1 text-right flex items-center justify-end gap-1 ${msg.kind === 'success' ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive'}`}>
                            {msg.kind === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                            <span>{msg.text}</span>
                          </div>
                        )}
                      </TD>
                      <TD className="text-right font-mono text-[11px]">
                        {margin === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={margin < 0 ? 'text-destructive font-bold' : 'text-emerald-800 dark:text-emerald-300'}>
                            {margin >= 0 ? '+' : ''}{formatINR(margin, false)}
                            {marginPct !== null ? ` (${marginPct >= 0 ? '+' : ''}${marginPct}%)` : ''}
                          </span>
                        )}
                      </TD>
                      <TD className="text-center">
                        <Badge variant={row.agreedPrice !== null ? 'info' : 'neutral'}>
                          {row.agreedPrice !== null ? t('pricing.custom') : t('pricing.base')}
                        </Badge>
                      </TD>
                      <TD className="text-right">
                        <Button variant="primary" size="sm" onClick={() => handleSave(row)} className="text-[11px] px-2.5 py-1">
                          <Save className="w-3 h-3" />
                          <span>{t('pricing.save')}</span>
                        </Button>
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
        </div>
        <CardFooter className="text-[11px] text-muted-foreground">
          {t('pricing.footer')}
        </CardFooter>
      </TableShell>

      <Modal
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={t('pricing.historyTitle', { customer: customer ? formatCustomerLabel(customer) : '' })}
        subtitle={t('pricing.historySubtitle')}
        maxWidth="2xl"
      >
        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('pricing.historyEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-left border-collapse">
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>{t('pricing.hChanged')}</TH>
                  <TH>{t('pricing.hProduct')}</TH>
                  <TH>{t('pricing.hUnit')}</TH>
                  <TH className="text-right">{t('pricing.hOld')}</TH>
                  <TH className="text-right">{t('pricing.hNew')}</TH>
                </TR>
              </THead>
              <TBody>
                {history.map((h) => {
                  const prod = products[h.product_id];
                  return (
                    <TR key={h.id}>
                      <TD className="font-mono text-[11px]">{new Date(h.changed_at).toLocaleString()}</TD>
                      <TD>{prod?.product_name || h.product_id}</TD>
                      <TD className="font-mono">{uoms[h.unit_id]?.code || h.unit_id}</TD>
                      <TD className="text-right font-mono">{h.old_price === null ? <span className="text-muted-foreground">{t('pricing.firstPrice')}</span> : formatINR(h.old_price)}</TD>
                      <TD className="text-right font-mono">{h.new_price === null ? <span className="text-muted-foreground">{t('pricing.removedPrice')}</span> : formatINR(h.new_price)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        )}
      </Modal>
    </div>
  );
};
