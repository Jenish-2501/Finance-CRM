import React, { useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Customer } from '../../types/database';

// Shared matcher: customer number first, then name / city / GSTIN / mobile.
// Reused by the master directory search so every surface searches the same way.
export function customerMatchesQuery(c: Customer, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    (c.customer_number || '').toLowerCase().includes(q) ||
    c.customer_name.toLowerCase().includes(q) ||
    (c.city || '').toLowerCase().includes(q) ||
    (c.gst_number || '').toLowerCase().includes(q) ||
    (c.mobile || '').toLowerCase().includes(q)
  );
}

export function formatCustomerLabel(c: Customer): string {
  return c.customer_number ? `${c.customer_number} — ${c.customer_name}` : c.customer_name;
}

// First selectable customer id, sorted by customer number. Used as the fallback
// when a stored/default id no longer exists — e.g. seed-only 'cust-1' in a real
// database — so pickers never render empty by default.
// NOTE: if Vite HMR ever reports this export missing, the dev server is serving
// a stale cached transform of this file — restart `npm run dev`.
export function firstCustomerId(
  customers: Record<string, Customer> | Customer[],
  preferredId?: string
): string {
  const all = Array.isArray(customers) ? customers : Object.values(customers);
  const pool = all.some((c) => c.is_active) ? all.filter((c) => c.is_active) : all;
  if (preferredId && pool.some((c) => c.id === preferredId)) return preferredId;
  const sorted = [...pool].sort(
    (a, b) =>
      (a.customer_number || '').localeCompare(b.customer_number || '', undefined, { numeric: true }) ||
      a.customer_name.localeCompare(b.customer_name)
  );
  return sorted[0]?.id || '';
}

interface CustomerPickerProps {
  value: string;
  onChange: (customerId: string) => void;
  customers: Record<string, Customer> | Customer[];
  placeholder?: string;
  disabled?: boolean;
}

// Searchable customer combobox. Type a customer number (or name / GSTIN /
// mobile) to filter; Enter picks the top match, Escape closes.
export const CustomerPicker: React.FC<CustomerPickerProps> = ({
  value,
  onChange,
  customers,
  placeholder = 'Type number or name to search…',
  disabled = false
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const list = useMemo(() => (Array.isArray(customers) ? customers : Object.values(customers)), [customers]);
  const selected = useMemo(() => list.find((c) => c.id === value) || null, [list, value]);
  const filtered = useMemo(() => {
    const matches = list.filter((c) => customerMatchesQuery(c, query));
    return matches.sort((a, b) =>
      (a.customer_number || '').localeCompare(b.customer_number || '', undefined, { numeric: true })
    );
  }, [list, query]);

  const pick = (id: string) => {
    onChange(id);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={open ? query : selected ? formatCustomerLabel(selected) : ''}
          placeholder={placeholder}
          onFocus={() => {
            setQuery('');
            setOpen(true);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onBlur={() => {
            setOpen(false);
            setQuery('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setQuery('');
              setOpen(false);
              inputRef.current?.blur();
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (filtered.length > 0) pick(filtered[0].id);
            }
          }}
          className="w-full pl-8 pr-3 py-2 text-xs border border-neutral-300 rounded bg-white text-neutral-900 font-medium focus:ring-1 focus:ring-neutral-900 focus:outline-none disabled:opacity-50"
        />
      </div>
      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-neutral-300 rounded shadow-lg max-h-56 overflow-y-auto text-xs">
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-neutral-400">No customers match “{query}”.</div>
          ) : (
            <>
              <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-neutral-400 border-b border-neutral-100">
                {filtered.length} match{filtered.length === 1 ? '' : 'es'}
              </div>
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(c.id);
                  }}
                  className={`w-full text-left px-3 py-2 hover:bg-neutral-50 flex items-center justify-between gap-2 border-b border-neutral-100 last:border-0 ${
                    c.id === value ? 'bg-neutral-50' : ''
                  }`}
                >
                  <span>
                    <span className="font-mono font-bold text-neutral-900">{c.customer_number || '—'}</span>
                    <span className="text-neutral-400 font-mono"> • </span>
                    <span className="font-medium text-neutral-800">{c.customer_name}</span>
                    <span className="block text-[11px] text-neutral-500 font-mono">
                      {c.city}{c.gst_number ? ` • ${c.gst_number}` : ''}
                    </span>
                  </span>
                  {c.id === value && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 bg-neutral-900 text-white rounded shrink-0">
                      SELECTED
                    </span>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};
