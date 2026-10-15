// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CustomersView } from '../../src/views/CustomersView';
import { LanguageProvider } from '../../src/i18n';

import type { useAccountingStore as useAccountingStoreType } from '../../src/store/accountingStore';

(globalThis as unknown as { window: unknown }).window ??= {};

let api: typeof useAccountingStoreType | undefined;
async function loadStore() {
  if (!api) api = (await import('../../src/store/accountingStore')).useAccountingStore;
  return api;
}

afterEach(() => cleanup());

// Regression: clicking a row's pencil opens the edit modal WITHOUT selecting
// the row — saving must still update that customer (previously it silently
// did nothing because the save depended on the row-selection state).
describe('customer edit from table pencil', () => {
  it('updates the city when Update is clicked without opening the row first', async () => {
    const store = (await loadStore()).getState();
    const before = Object.values(store.customers)[0];
    expect(before).toBeDefined();

    render(
      <LanguageProvider>
        <CustomersView />
      </LanguageProvider>
    );

    // Open edit straight from the table pencil (row never selected).
    const editButtons = screen.getAllByTitle('Edit details');
    expect(editButtons.length).toBeGreaterThan(0);
    fireEvent.click(editButtons[0]);

    // The modal shows the customer's current city — change it.
    const cityInput = screen.getAllByDisplayValue(before.city)[0] as HTMLInputElement;
    fireEvent.change(cityInput, { target: { value: 'Ahmedabad' } });

    fireEvent.click(screen.getByText('Update Customer'));

    const after = (await loadStore()).getState().customers[before.id];
    expect(after.city).toBe('Ahmedabad');
  });
});
