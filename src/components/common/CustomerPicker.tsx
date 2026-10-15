import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Customer } from '../../types/database';

// Shared matcher: customer number and customer name ONLY. Every
// whitespace-separated token must appear in one of those two fields.
// ("apex", "C-1002", "C-1001 abc"). GSTIN / city / mobile / Gujarati
// nickname are deliberately excluded so number+name searches stay precise.
// Reused by the master directory search so every surface searches the same way.
export function customerMatchesQuery(c: Customer, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = [c.customer_number || '', c.customer_name || ''].join(' ').toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}

export function formatCustomerLabel(c: Customer): string {
  const name = c.gujarati_name?.trim() ? `${c.customer_name} (${c.gujarati_name.trim()})` : c.customer_name;
  return c.customer_number ? `${c.customer_number} — ${name}` : name;
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
  /** Debounce for applying the typed query to the list filter (ms). */
  debounceMs?: number;
}

// Searchable customer combobox. Click (or Tab) in, type a customer number
// and/or name to filter; ArrowUp/ArrowDown moves the highlight, Enter picks
// it, Escape only dismisses the list. The typed query survives blur/refocus
// so a stray click never wipes what you typed. Filtering is debounced so
// fast typing (e.g. a full customer number) settles before the list
// re-renders; Enter always matches against the latest keystroke.
export const CustomerPicker: React.FC<CustomerPickerProps> = ({
  value,
  onChange,
  customers,
  placeholder = 'Type number or name to search…',
  disabled = false,
  debounceMs = 200
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced filter: every keystroke restarts the timer; the list only
  // re-filters once typing pauses. `<= 0` disables debouncing (synchronous).
  useEffect(() => {
    if (debounceMs <= 0) {
      setFilterQuery(query);
      return;
    }
    const t = setTimeout(() => setFilterQuery(query), debounceMs);
    return () => clearTimeout(t);
  }, [query, debounceMs]);

  const list = useMemo(() => (Array.isArray(customers) ? customers : Object.values(customers)), [customers]);
  const selected = useMemo(() => list.find((c) => c.id === value) || null, [list, value]);
  const filtered = useMemo(() => {
    const matches = list.filter((c) => customerMatchesQuery(c, filterQuery));
    return matches.sort((a, b) =>
      (a.customer_number || '').localeCompare(b.customer_number || '', undefined, { numeric: true })
    );
  }, [list, filterQuery]);

  // Keep the highlight on a visible row whenever the applied filter changes.
  useEffect(() => {
    setActive(0);
  }, [filterQuery]);

  const pick = (id: string) => {
    onChange(id);
    setQuery('');
    setFilterQuery('');
    setActive(0);
    setOpen(false);
    inputRef.current?.blur();
  };

  const setQueryAndReset = (q: string) => {
    setQuery(q);
    setOpen(true);
  };

  /** Fresh (non-debounced) matches for the latest keystroke — used by Enter. */
  const freshMatches = () => {
    const matches = list.filter((c) => customerMatchesQuery(c, query));
    return matches.sort((a, b) =>
      (a.customer_number || '').localeCompare(b.customer_number || '', undefined, { numeric: true })
    );
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="customer-picker-listbox"
          aria-autocomplete="list"
          disabled={disabled}
          value={open ? query : selected ? formatCustomerLabel(selected) : ''}
          placeholder={placeholder}
          onFocus={() => {
            // Never wipe the query here: reopening must preserve what the
            // user already typed (e.g. after scrolling the list).
            setOpen(true);
          }}
          onChange={(e) => setQueryAndReset(e.target.value)}
          onBlur={() => {
            // List interactions (options, scrollbar, header) preventDefault
            // their mousedown so this only fires for genuine focus loss.
            // The query is kept, so refocusing resumes where you left off.
            setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              // Dismiss the list only — stopPropagation keeps a parent
              // Modal (window keydown closer) from closing underneath us.
              e.stopPropagation();
              setOpen(false);
              return;
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setOpen(true);
              setActive((prev) => {
                if (filtered.length === 0) return 0;
                const delta = e.key === 'ArrowDown' ? 1 : -1;
                return (prev + delta + filtered.length) % filtered.length;
              });
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              if (!open) return;
              // Match against the latest keystroke, not the debounced
              // filter, so Enter never acts on a stale list mid-debounce.
              const matches = freshMatches();
              const target = matches[Math.min(active, Math.max(0, matches.length - 1))];
              if (target) pick(target.id);
            }
          }}
          className="w-full pl-8 pr-3 py-2 text-xs border border-input rounded bg-card text-foreground font-medium focus:ring-1 focus:ring-ring focus:outline-none disabled:opacity-50"
        />
      </div>
      {open && !disabled && (
        <div
          id="customer-picker-listbox"
          role="listbox"
          // Prevent focus theft: clicks/scrollbar drags inside the list must
          // not blur the input (blur would slam the list shut mid-search).
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-20 mt-1 w-full bg-card border border-input rounded shadow-lg max-h-56 overflow-y-auto text-xs"
        >
          {query !== filterQuery ? (
            <div className="px-3 py-3 text-muted-foreground font-mono">Filtering…</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-3 text-muted-foreground">No customers match “{query}”.</div>
          ) : (
            <>
              <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground border-b border-border">
                {filtered.length} match{filtered.length === 1 ? '' : 'es'}
              </div>
              {filtered.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(c.id);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`w-full text-left px-3 py-2 hover:bg-muted flex items-center justify-between gap-2 border-b border-border last:border-0 ${
                    i === active ? 'bg-muted' : ''
                  }${c.id === value ? ' font-semibold' : ''}`}
                >
                  <span>
                    <span className="font-mono font-bold text-foreground">{c.customer_number || '—'}</span>
                    <span className="text-muted-foreground font-mono"> • </span>
                    <span className="font-medium text-foreground">{c.customer_name}</span>
                    {c.gujarati_name?.trim() ? (
                      <span className="font-medium text-foreground"> ({c.gujarati_name.trim()})</span>
                    ) : null}
                    <span className="block text-[11px] text-muted-foreground font-mono">
                      {c.city}{c.gst_number ? ` • ${c.gst_number}` : ''}
                    </span>
                  </span>
                  {c.id === value && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 bg-primary text-primary-foreground rounded shrink-0">
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
