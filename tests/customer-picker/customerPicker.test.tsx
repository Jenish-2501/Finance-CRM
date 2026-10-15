// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { useState, act } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  CustomerPicker,
  customerMatchesQuery,
} from '../../src/components/common/CustomerPicker';
import type { Customer } from '../../src/types/database';

afterEach(() => cleanup());

const base: Customer = {
  id: 'x',
  customer_number: 'C-1',
  customer_name: 'X',
  pan: '',
  gst_number: '',
  mobile: '',
  address: '',
  city: '',
  state: '',
  country: '',
  postal_code: '',
  is_active: true,
  created_at: '',
  updated_at: '',
};

const customers: Customer[] = [
  { ...base, id: 'c1', customer_number: 'C-1001', customer_name: 'ABC Corporate Tower Ltd', city: 'Surat' },
  { ...base, id: 'c2', customer_number: 'C-1002', customer_name: 'Apex Manufacturing Infra', city: 'Mumbai' },
  { ...base, id: 'c3', customer_number: 'C-1003', customer_name: 'Shree Traders', city: 'Surat' },
];

function Harness({ onPick, debounceMs = 0 }: { onPick?: (id: string) => void; debounceMs?: number }) {
  const [v, setV] = useState('c1');
  return (
    <CustomerPicker
      value={v}
      onChange={(id) => {
        setV(id);
        onPick?.(id);
      }}
      customers={customers}
      debounceMs={debounceMs}
    />
  );
}

function focusedInput() {
  const input = screen.getByRole('combobox') as HTMLInputElement;
  fireEvent.focus(input);
  return input;
}

describe('customerMatchesQuery', () => {
  it('matches customer number', () => {
    expect(customerMatchesQuery(customers[1], 'C-1002')).toBe(true);
    expect(customerMatchesQuery(customers[1], 'c-1002')).toBe(true);
    expect(customerMatchesQuery(customers[1], '1002')).toBe(true);
  });
  it('matches customer name', () => {
    expect(customerMatchesQuery(customers[1], 'apex')).toBe(true);
    expect(customerMatchesQuery(customers[2], 'APEX')).toBe(false);
  });
  it('narrows on multi-token name + number queries', () => {
    expect(customerMatchesQuery(customers[0], 'C-1001 abc')).toBe(true);
    expect(customerMatchesQuery(customers[1], 'apex C-1002')).toBe(true);
    expect(customerMatchesQuery(customers[1], 'apex C-1003')).toBe(false);
    expect(customerMatchesQuery(customers[2], 'shree traders')).toBe(true);
  });
  it('ignores GSTIN, city and mobile — name and number only', () => {
    const gstCustomer: Customer = {
      ...customers[1],
      gst_number: '24AACCA2345D1Z6',
      mobile: '+91 98980 00000',
    };
    expect(customerMatchesQuery(gstCustomer, 'mumbai')).toBe(false);
    expect(customerMatchesQuery(gstCustomer, '24AACCA2345D1Z6')).toBe(false);
    expect(customerMatchesQuery(gstCustomer, '98980')).toBe(false);
    expect(customerMatchesQuery(gstCustomer, 'apex')).toBe(true);
  });
});

describe('CustomerPicker search', () => {
  it('filters by name and by number as the user types', () => {
    render(<Harness />);
    const input = focusedInput();
    fireEvent.change(input, { target: { value: 'apex' } });
    expect(screen.queryByText('ABC Corporate Tower Ltd')).toBeNull();
    screen.getByText('Apex Manufacturing Infra');
    fireEvent.change(input, { target: { value: 'C-1003' } });
    expect(screen.queryByText('Apex Manufacturing Infra')).toBeNull();
    screen.getByText('Shree Traders');
  });

  it('keeps the typed query across blur and refocus', () => {
    render(<Harness />);
    const input = focusedInput();
    fireEvent.change(input, { target: { value: 'apex' } });
    fireEvent.blur(input);
    // list closed but query preserved: refocus resumes the filtered search
    expect(screen.queryByText('Apex Manufacturing Infra')).toBeNull();
    fireEvent.focus(input);
    expect(input.value).toBe('apex');
    screen.getByText('Apex Manufacturing Infra');
    expect(screen.queryByText('Shree Traders')).toBeNull();
  });

  it('ArrowDown + Enter picks the highlighted option, not just the first', () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    const input = focusedInput();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    // sorted by number: C-1001 (0), C-1002 (1) — one ArrowDown highlights C-1002
    expect(onPick).toHaveBeenCalledWith('c2');
  });

  it('clicking an option picks it and shows its number + name', () => {
    render(<Harness />);
    const input = focusedInput();
    fireEvent.change(input, { target: { value: 'shree' } });
    fireEvent.mouseDown(screen.getByText('Shree Traders'));
    expect(input.value).toContain('C-1003');
    expect(input.value).toContain('Shree Traders');
  });

  it('debounces the list filter while typing a customer number', () => {
    vi.useFakeTimers();
    try {
      render(<Harness debounceMs={200} />);
      const input = focusedInput();
      // all three visible before typing
      screen.getByText('ABC Corporate Tower Ltd');
      screen.getByText('Shree Traders');
      fireEvent.change(input, { target: { value: 'C-1002' } });
      // debounce pending: list shows filtering state, old rows untouched
      screen.getByText('Filtering…');
      expect(screen.queryByText('Apex Manufacturing Infra')).toBeNull();
      // timer fires -> list narrows to the typed customer number
      act(() => {
        vi.advanceTimersByTime(200);
      });
      screen.getByText('Apex Manufacturing Infra');
      expect(screen.queryByText('Shree Traders')).toBeNull();
      expect(screen.queryByText('ABC Corporate Tower Ltd')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('restarts the debounce on every keystroke', () => {
    vi.useFakeTimers();
    try {
      render(<Harness debounceMs={200} />);
      const input = focusedInput();
      fireEvent.change(input, { target: { value: 'C-1' } });
      act(() => {
        vi.advanceTimersByTime(150);
      });
      fireEvent.change(input, { target: { value: 'C-1002' } });
      act(() => {
        vi.advanceTimersByTime(150);
      });
      // first timer cancelled by the second keystroke: still filtering
      screen.getByText('Filtering…');
      act(() => {
        vi.advanceTimersByTime(100);
      });
      screen.getByText('Apex Manufacturing Infra');
    } finally {
      vi.useRealTimers();
    }
  });
});
