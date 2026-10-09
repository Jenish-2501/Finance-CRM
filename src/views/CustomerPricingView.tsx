import React, { useMemo, useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { CustomerPicker, firstCustomerId, formatCustomerLabel } from '../components/common/CustomerPicker';
import { formatINR, roundCurrency } from '../utils/calculations';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { Tag, History, Save, CheckCircle2, AlertTriangle } from 'lucide-react';

export const CustomerPricingView: React.FC = () => {
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
        setRowMsg((prev) => ({ ...prev, [row.key]: { kind: 'error', text: 'Enter a valid amount.' } }));
        return;
      }
      result = setCustomerPrice({ customerId: effectiveCustomerId, productId: row.productId, unitId: row.unitId, price });
    }
    if (!result.success) {
      setRowMsg((prev) => ({ ...prev, [row.key]: { kind: 'error', text: result.error || 'Could not save.' } }));
      return;
    }
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[row.key];
      return next;
    });
    setRowMsg((prev) => ({ ...prev, [row.key]: { kind: 'success', text: raw === '' ? 'Base price applies.' : 'Agreed price saved.' } }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white border border-neutral-200 rounded-lg shadow-2xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-950 flex items-center gap-2">
            <Tag className="w-5 h-5" /> Customer Pricing
          </h1>
          <p className="text-xs text-neutral-500 font-mono mt-0.5">
            Agreed selling price per customer • base price applies when empty • applies immediately to billing &amp; challans
          </p>
        </div>
        <button
          onClick={() => setHistoryOpen(true)}
          disabled={!customer}
          className="px-3.5 py-1.5 text-xs font-semibold bg-white border border-neutral-300 rounded hover:bg-neutral-50 flex items-center gap-1.5 disabled:opacity-40"
        >
          <History className="w-3.5 h-3.5" />
          <span>Price History{customer ? ` — ${customer.customer_number}` : ''}</span>
        </button>
      </div>

      <div className="p-4 bg-white border border-neutral-200 rounded-lg shadow-2xs text-xs">
        <label className="block font-semibold text-neutral-700 mb-1">Select Customer</label>
        <div className="max-w-md">
          <CustomerPicker
            value={effectiveCustomerId}
            onChange={(id) => setSelectedCustomerId(id)}
            customers={customers}
          />
        </div>
        {customer && (
          <div className="text-[11px] font-mono text-neutral-500 mt-1">
            {formatCustomerLabel(customer)} • {customer.city} • GSTIN: {customer.gst_number || 'N/A'}
          </div>
        )}
      </div>

      <div className="bg-white border border-neutral-200 rounded-lg shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-neutral-200 bg-neutral-50/70 text-xs font-bold uppercase tracking-wider text-neutral-800">
          Agreed Prices ({rows.length} product-units)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <caption className="sr-only">Agreed customer prices by product</caption>
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/80 font-mono text-neutral-600 text-[11px]">
                <th scope="col" className="py-3 px-4">Product</th>
                <th scope="col" className="py-3 px-3">Unit</th>
                <th scope="col" className="py-3 px-3 text-right">Base Price</th>
                <th scope="col" className="py-3 px-3 text-right">Agreed Price (₹)</th>
                <th scope="col" className="py-3 px-3 text-right">Margin</th>
                <th scope="col" className="py-3 px-3 text-center">Applies</th>
                <th scope="col" className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 font-sans">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-neutral-400">
                    No active products with billing units.
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
                    <tr key={row.key} className="hover:bg-neutral-50/70">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-neutral-900">{row.productName}</div>
                        <div className="text-[11px] font-mono text-neutral-400">{row.sku}</div>
                      </td>
                      <td className="py-3 px-3 font-mono">{row.unitCode}</td>
                      <td className="py-3 px-3 text-right font-mono">{formatINR(row.basePrice)}</td>
                      <td className="py-3 px-3">
                        <input
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
                          placeholder={row.basePrice ? String(row.basePrice) : 'Base'}
                          className="w-28 p-1.5 border border-neutral-300 rounded font-mono text-right ml-auto block"
                        />
                        {msg && (
                          <div className={`text-[10px] mt-1 text-right flex items-center justify-end gap-1 ${msg.kind === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {msg.kind === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                            <span>{msg.text}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[11px]">
                        {margin === null ? (
                          <span className="text-neutral-400">—</span>
                        ) : (
                          <span className={margin < 0 ? 'text-rose-700 font-bold' : 'text-emerald-800'}>
                            {margin >= 0 ? '+' : ''}{formatINR(margin, false)}
                            {marginPct !== null ? ` (${marginPct >= 0 ? '+' : ''}${marginPct}%)` : ''}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Badge variant={row.agreedPrice !== null ? 'info' : 'neutral'}>
                          {row.agreedPrice !== null ? 'CUSTOM' : 'BASE'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleSave(row)}
                          className="px-2.5 py-1 text-[11px] font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 inline-flex items-center gap-1"
                        >
                          <Save className="w-3 h-3" />
                          <span>Save</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-neutral-200 bg-neutral-50/60 text-[11px] text-neutral-500">
          Empty agreed price = base price applies. Clearing a saved price removes the override (logged in history).
        </div>
      </div>

      <Modal
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={`Price History — ${customer ? formatCustomerLabel(customer) : ''}`}
        subtitle="Every agreed-price change for this customer, newest first. History is append-only."
        maxWidth="2xl"
      >
        {history.length === 0 ? (
          <p className="text-xs text-neutral-500">No price changes recorded for this customer yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 font-mono text-neutral-600 text-[11px]">
                  <th className="py-2 px-3">Changed At</th>
                  <th className="py-2 px-3">Product</th>
                  <th className="py-2 px-3">Unit</th>
                  <th className="py-2 px-3 text-right">Old Price</th>
                  <th className="py-2 px-3 text-right">New Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {history.map((h) => {
                  const prod = products[h.product_id];
                  return (
                    <tr key={h.id}>
                      <td className="py-2 px-3 font-mono text-[11px]">{new Date(h.changed_at).toLocaleString()}</td>
                      <td className="py-2 px-3">{prod?.product_name || h.product_id}</td>
                      <td className="py-2 px-3 font-mono">{uoms[h.unit_id]?.code || h.unit_id}</td>
                      <td className="py-2 px-3 text-right font-mono">{h.old_price === null ? <span className="text-neutral-400">— first —</span> : formatINR(h.old_price)}</td>
                      <td className="py-2 px-3 text-right font-mono">{h.new_price === null ? <span className="text-neutral-400">— removed —</span> : formatINR(h.new_price)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
};
