import React, { useEffect, useMemo, useState } from 'react';
import { Database, RefreshCw, HardDrive, ShieldCheck, Table2 } from 'lucide-react';
import { useAccountingStore } from '../store/accountingStore';

interface LiveColumn { name: string; type: string; notNull: boolean; primaryKey: boolean; defaultValue: string | null }
interface LiveTable { name: string; rowCount: number; columns: LiveColumn[] }
interface LiveSchema { dbFile: string | null; sqliteVersion: string; tables: LiveTable[] }

// Static contract mirrors electron/database/schema/*.ts — used as fallback in
// browser preview (no Electron shell) and as column documentation.
const STATIC_COLUMNS: Record<string, Array<{ name: string; type: string; pk?: boolean }>> = {
  business_settings: [
    { name: 'id', type: 'TEXT', pk: true }, { name: 'business_name', type: 'TEXT' },
    { name: 'legal_name', type: 'TEXT' }, { name: 'gst_number', type: 'TEXT' },
    { name: 'pan', type: 'TEXT' }, { name: 'state_code', type: 'TEXT' },
    { name: 'bank_name / bank_account_number / ifsc / branch', type: 'TEXT' },
    { name: 'invoice_prefix', type: 'TEXT' }, { name: 'invoice_next_number', type: 'INTEGER' },
    { name: 'default_gst_rate', type: 'REAL' },
  ],
  uoms: [
    { name: 'id', type: 'TEXT', pk: true }, { name: 'code', type: 'TEXT' },
    { name: 'name', type: 'TEXT' }, { name: 'description', type: 'TEXT' },
    { name: 'is_active', type: 'INTEGER 0/1' },
  ],
  customers: [
    { name: 'id', type: 'TEXT', pk: true }, { name: 'customer_name', type: 'TEXT' },
    { name: 'customer_number', type: 'TEXT UNIQUE (searchable code)' },
    { name: 'gst_number', type: 'TEXT' }, { name: 'state_code', type: 'TEXT' },
    { name: 'bank_details', type: 'TEXT JSON|null' }, { name: 'credit_limit', type: 'REAL|null' },
    { name: 'is_active', type: 'INTEGER 0/1' },
  ],
  products: [
    { name: 'id', type: 'TEXT', pk: true }, { name: 'product_name', type: 'TEXT' },
    { name: 'sku', type: 'TEXT' }, { name: 'primary_unit_id', type: 'TEXT → uoms.id' },
    { name: 'hsn_code', type: 'TEXT|null' }, { name: 'is_active', type: 'INTEGER 0/1' },
  ],
  product_units: [
    { name: 'id', type: 'TEXT', pk: true }, { name: 'product_id', type: 'TEXT → products.id' },
    { name: 'unit_id', type: 'TEXT → uoms.id' }, { name: 'conversion_to_primary', type: 'REAL' },
    { name: 'is_stock_unit / is_billing_unit', type: 'INTEGER 0/1' },
  ],
  product_prices: [
    { name: 'id', type: 'TEXT', pk: true }, { name: 'product_id', type: 'TEXT → products.id' },
    { name: 'unit_id', type: 'TEXT → uoms.id' }, { name: 'price', type: 'REAL' },
    { name: 'effective_from / effective_to', type: 'TEXT (null = active)' },
  ],
  customer_product_prices: [
    { name: 'id', type: 'TEXT', pk: true }, { name: 'customer_id', type: 'TEXT → customers.id' },
    { name: 'product_id', type: 'TEXT → products.id' }, { name: 'unit_id', type: 'TEXT → uoms.id' },
    { name: 'price', type: 'REAL (agreed, applies immediately)' },
  ],
  customer_price_history: [
    { name: 'id', type: 'TEXT', pk: true }, { name: 'customer_id / product_id / unit_id', type: 'TEXT' },
    { name: 'old_price', type: 'REAL|null (null = first set)' }, { name: 'new_price', type: 'REAL|null (null = removed)' },
    { name: 'changed_at / changed_by', type: 'TEXT' },
  ],
  stock_receipts: [
    { name: 'id', type: 'TEXT', pk: true }, { name: 'receipt_number', type: 'TEXT' },
    { name: 'receipt_date', type: 'TEXT' }, { name: 'supplier_name', type: 'TEXT' },
    { name: 'status', type: 'TEXT RECEIVED|CANCELLED' },
  ],
  stock_receipt_items: [
    { name: 'id', type: 'TEXT', pk: true }, { name: 'stock_receipt_id', type: 'TEXT → stock_receipts.id' },
    { name: 'product_id / unit_id', type: 'TEXT' }, { name: 'quantity / unit_cost / total_cost', type: 'REAL' },
  ],
  inventory_movements: [
    { name: 'id', type: 'TEXT', pk: true }, { name: 'product_id / unit_id', type: 'TEXT' },
    { name: 'quantity', type: 'REAL (+ve magnitude)' }, { name: 'movement_type', type: 'TEXT STOCK_IN|CUSTOMER_DISPATCH|…' },
    { name: 'reference_type / reference_id', type: 'TEXT' }, { name: 'created_by', type: "TEXT (always 'owner')" },
  ],
  customer_inventory_movements: [
    { name: 'id', type: 'TEXT', pk: true }, { name: 'customer_id', type: 'TEXT → customers.id' },
    { name: 'product_id / unit_id', type: 'TEXT' }, { name: 'movement_type', type: 'TEXT DISPATCH|RETURN|…' },
    { name: 'vehicle_number / transporter_name / eway_bill_number', type: 'TEXT|null (Rule 55)' },
  ],
  invoices: [
    { name: 'id', type: 'TEXT', pk: true }, { name: 'invoice_number', type: 'TEXT' },
    { name: 'customer_id', type: 'TEXT → customers.id' }, { name: 'status', type: 'TEXT DRAFT|FINALIZED|CANCELLED' },
    { name: 'subtotal / discount / taxable_amount', type: 'REAL' }, { name: 'cgst / sgst / igst', type: 'REAL' },
    { name: 'grand_total', type: 'REAL' }, { name: 'customer_snapshot / business_snapshot / bank_snapshot', type: 'TEXT JSON (immutable)' },
  ],
  invoice_items: [
    { name: 'id', type: 'TEXT', pk: true }, { name: 'invoice_id', type: 'TEXT → invoices.id' },
    { name: 'product_id / unit_id', type: 'TEXT' }, { name: 'quantity / unit_price / gst_rate', type: 'REAL' },
    { name: 'cgst / sgst / igst / line_total', type: 'REAL' },
  ],
  invoice_allocations: [
    { name: 'id', type: 'TEXT', pk: true }, { name: 'invoice_id', type: 'TEXT → invoices.id' },
    { name: 'customer_inventory_movement_id', type: 'TEXT → customer_inventory_movements.id' },
    { name: 'allocated_quantity', type: 'REAL' },
  ],
  invoice_payments: [
    { name: 'id', type: 'TEXT', pk: true }, { name: 'invoice_id', type: 'TEXT → invoices.id' },
    { name: 'amount', type: 'REAL' }, { name: 'payment_method', type: 'TEXT CASH|UPI|BANK_TRANSFER|…' },
    { name: 'status', type: 'TEXT ACTIVE|CANCELLED' },
  ],
  audit_logs: [
    { name: 'id', type: 'TEXT', pk: true }, { name: 'user_id / user_name', type: 'TEXT' },
    { name: 'action / entity_type / entity_id', type: 'TEXT' },
    { name: 'old_data / new_data / metadata', type: 'TEXT JSON|null' },
  ],
  auth_settings: [
    { name: 'id', type: 'TEXT', pk: true }, { name: 'password_hash', type: 'TEXT (scrypt, never plain)' },
    { name: 'updated_at', type: 'TEXT ISO-8601' },
  ],
};

const RELATIONS = [
  'products.primary_unit_id → uoms.id',
  'product_units.product_id → products.id · product_units.unit_id → uoms.id',
  'product_prices.product_id → products.id',
  'customer_product_prices.(customer_id, product_id) → customers.id, products.id (agreed price wins)',
  'stock_receipt_items.stock_receipt_id → stock_receipts.id',
  'inventory_movements.product_id → products.id (reference_id → stock_receipts / challan)',
  'customer_inventory_movements.customer_id → customers.id · product_id → products.id',
  'invoices.customer_id → customers.id',
  'invoice_items.invoice_id → invoices.id',
  'invoice_allocations.invoice_id → invoices.id · movement_id → customer_inventory_movements.id',
  'invoice_payments.invoice_id → invoices.id',
  'audit_logs: single-owner trail (user_id always owner)',
];

const DYNAMIC_MATRIX: Array<{ area: string; channel: string; status: string }> = [
  { area: 'All 16 store entities — load', channel: 'store:loadAll → Repositories.findAll', status: 'DYNAMIC' },
  { area: 'All creates / updates', channel: 'store:persistChanges (atomic diff transaction)', status: 'DYNAMIC' },
  { area: 'Business settings (validated)', channel: 'business-settings:get / update', status: 'DYNAMIC' },
  { area: 'UOM list / create / activate', channel: 'uoms:list · create · set-active', status: 'DYNAMIC' },
  { area: 'App-lock passcode', channel: 'passcode:verify / change (auth_settings, scrypt)', status: 'DYNAMIC' },
  { area: 'Customer delete (guarded)', channel: 'customers:delete + store:delete', status: 'DYNAMIC' },
  { area: 'Invoice write (multi-table)', channel: 'invoices:transaction', status: 'DYNAMIC' },
  { area: 'Health / integrity / backup', channel: 'database:health · maintenance:integrity · backup', status: 'DYNAMIC' },
  { area: 'This schema explorer', channel: 'database:schema (new)', status: 'DYNAMIC' },
  { area: 'CSV / PDF export', channel: 'files:saveCSV · savePDFBytes', status: 'DYNAMIC' },
  { area: 'Reports / Dashboard / Ledger', channel: 'derived in-memory from live store (no extra IPC)', status: 'LIVE-DERIVED' },
];

export const DatabaseStructureView: React.FC = () => {
  const store = useAccountingStore();
  const [live, setLive] = useState<LiveSchema | null>(null);
  const [health, setHealth] = useState<{ connected: boolean; sqliteVersion: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [isElectron, setIsElectron] = useState(false);

  const storeCounts = useMemo(() => {
    const s = store as unknown as Record<string, unknown>;
    const countOf = (key: string): number => {
      const v = s[key];
      if (Array.isArray(v)) return v.length;
      if (v && typeof v === 'object') return Object.keys(v as object).length;
      return 0;
    };
    return {
      business_settings: 1, uoms: countOf('uoms'),
      customers: countOf('customers'), products: countOf('products'),
      product_units: countOf('productUnits'), product_prices: countOf('productPrices'),
      customer_product_prices: countOf('customerPrices'), customer_price_history: countOf('customerPriceHistory'),
      stock_receipts: countOf('stockReceipts'), stock_receipt_items: countOf('stockReceiptItems'),
      inventory_movements: countOf('inventoryMovements'),
      customer_inventory_movements: countOf('customerInventoryMovements'),
      invoices: countOf('invoices'), invoice_items: countOf('invoiceItems'),
      invoice_allocations: countOf('invoiceAllocations'), invoice_payments: countOf('invoicePayments'),
      audit_logs: countOf('auditLogs'),
    } as Record<string, number>;
  }, [store]);

  const refresh = async () => {
    setLoading(true);
    try {
      const bridge = (window as unknown as { electronAPI?: { database?: { schema?: () => Promise<LiveSchema>; health?: () => Promise<{ connected: boolean; sqliteVersion: string }> } } }).electronAPI?.database;
      if (bridge?.schema) {
        setIsElectron(true);
        const [schema, h] = await Promise.all([
          bridge.schema(),
          bridge.health ? bridge.health() : Promise.resolve(null),
        ]);
        setLive(schema);
        if (h) setHealth(h);
      } else {
        setIsElectron(false);
      }
    } catch {
      setIsElectron(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tables = useMemo(() => {
    if (live && live.tables.length > 0) return live.tables;
    return Object.entries(STATIC_COLUMNS).map(([name, cols]) => ({
      name,
      rowCount: storeCounts[name] ?? 0,
      columns: cols.map((c) => ({ name: c.name, type: c.type, notNull: false, primaryKey: Boolean(c.pk), defaultValue: null as string | null })),
    }));
  }, [live, storeCounts]);

  const totalRows = tables.reduce((sum, t) => sum + t.rowCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white border border-neutral-200 rounded-lg shadow-2xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-950 flex items-center gap-2">
            <Database className="w-5 h-5" /> Database Structure — SQLite live
          </h1>
          <p className="text-xs text-neutral-500 font-mono mt-0.5">
            {isElectron ? `FILE: ${live?.dbFile ?? '—'} • SQLite ${live?.sqliteVersion ?? health?.sqliteVersion ?? '—'}` : 'BROWSER PREVIEW — static contract + live store counts (open in Electron for on-disk introspection)'}
          </p>
        </div>
        <button onClick={() => void refresh()} disabled={loading}
          className="px-3.5 py-1.5 text-xs font-medium bg-neutral-900 text-white rounded hover:bg-neutral-800 flex items-center gap-1.5 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Reading…' : 'Refresh schema'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'TABLES', value: String(tables.length) },
          { label: 'TOTAL ROWS', value: String(totalRows) },
          { label: 'MODE', value: isElectron ? 'ELECTRON SQLITE' : 'PREVIEW' },
          { label: 'SOURCE', value: live && live.tables.length > 0 ? 'PRAGMA LIVE' : 'STATIC CONTRACT' },
        ].map((k) => (
          <div key={k.label} className="bg-white border border-neutral-200 rounded-lg p-4 shadow-2xs">
            <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">{k.label}</div>
            <div className="text-xl font-bold font-mono text-neutral-950 mt-1 break-all">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-neutral-200 rounded-lg shadow-2xs overflow-hidden">
        <div className="px-5 py-3 bg-neutral-50/60 border-b border-neutral-200 flex items-center gap-2">
          <Table2 className="w-4 h-4 text-neutral-600" />
          <h2 className="text-xs font-bold uppercase tracking-wider">Tables, columns & row counts</h2>
        </div>
        <div className="divide-y divide-neutral-200">
          {tables.map((t) => (
            <div key={t.name} className="p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="font-mono font-bold text-sm text-neutral-950">{t.name}</span>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded border bg-neutral-100 border-neutral-300">
                  {t.rowCount} row{t.rowCount === 1 ? '' : 's'}
                </span>
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-neutral-500 font-mono">
                      <th className="py-1 pr-4 font-semibold">Column</th>
                      <th className="py-1 pr-4 font-semibold">Type</th>
                      <th className="py-1 font-semibold">Key</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.columns.map((c) => (
                      <tr key={c.name} className="border-t border-neutral-100">
                        <td className="py-1 pr-4 font-mono">{c.name}{c.primaryKey ? ' 🔑' : ''}</td>
                        <td className="py-1 pr-4 font-mono text-neutral-600">{c.type}{c.notNull ? ' NOT NULL' : ''}</td>
                        <td className="py-1 font-mono text-[11px]">{c.primaryKey ? 'PK' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-neutral-200 rounded-lg p-5 shadow-2xs">
          <h2 className="text-xs font-bold uppercase tracking-wider mb-3">Relationships (foreign-key logic)</h2>
          <ul className="space-y-1.5 text-xs font-mono text-neutral-700">
            {RELATIONS.map((r) => (<li key={r} className="bg-neutral-50 border border-neutral-200 rounded px-2.5 py-1.5">{r}</li>))}
          </ul>
        </div>
        <div className="bg-white border border-neutral-200 rounded-lg p-5 shadow-2xs">
          <h2 className="text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-700" /> What is dynamic till now?
          </h2>
          <p className="text-[11px] text-neutral-500 mb-3 flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5" /> 10/11 areas hit real SQLite in Electron; 1 is live-derived. Nothing is seed-only anymore.
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-neutral-500 font-mono">
                <th className="py-1 pr-3">Area</th><th className="py-1 pr-3">Channel</th><th className="py-1 text-right">State</th>
              </tr>
            </thead>
            <tbody>
              {DYNAMIC_MATRIX.map((d) => (
                <tr key={d.channel} className="border-t border-neutral-100">
                  <td className="py-1.5 pr-3">{d.area}</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px] text-neutral-600">{d.channel}</td>
                  <td className="py-1.5 text-right">
                    <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${d.status === 'DYNAMIC' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-sky-50 text-sky-800 border-sky-200'}`}>{d.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
