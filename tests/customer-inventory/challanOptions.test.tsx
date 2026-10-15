// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { groupDispatchChallans } from '../../src/views/CustomerInventoryView';
import type { CustomerInventoryMovement } from '../../src/types/database';

function mov(partial: Partial<CustomerInventoryMovement> & { id: string }): CustomerInventoryMovement {
  return {
    customer_id: 'cust-1',
    product_id: 'prod-1',
    unit_id: 'uom-pcs',
    quantity: 10,
    movement_type: 'DISPATCH',
    movement_date: '2026-01-15T10:00:00Z',
    reference_type: 'DISPATCH',
    reference_id: 'CH-1',
    document_id: null,
    created_at: '2026-01-15T10:00:00Z',
    created_by: 'owner',
    ...partial,
  } as CustomerInventoryMovement;
}

describe('groupDispatchChallans — holdings print picker options', () => {
  it('groups one customer+product dispatches by reference, newest first', () => {
    const options = groupDispatchChallans(
      [
        mov({ id: 'a', reference_id: 'CH-1', movement_date: '2026-01-15T10:00:00Z', quantity: 10 }),
        mov({ id: 'b', reference_id: 'CH-2', movement_date: '2026-01-20T10:00:00Z', quantity: 5 }),
      ],
      'cust-1',
      'prod-1'
    );
    expect(options.map((o) => o.referenceId)).toEqual(['CH-2', 'CH-1']);
    expect(options[0]).toMatchObject({ totalQuantity: 5, unitId: 'uom-pcs' });
  });

  it('merges multi-row challans into one option with summed quantity', () => {
    const options = groupDispatchChallans(
      [
        mov({ id: 'a', reference_id: 'CH-1', quantity: 10 }),
        mov({ id: 'b', reference_id: 'CH-1', quantity: 20 }),
      ],
      'cust-1',
      'prod-1'
    );
    expect(options).toHaveLength(1);
    expect(options[0].totalQuantity).toBe(30);
  });

  it('scopes to the customer and product, skipping returns and other rows', () => {
    const options = groupDispatchChallans(
      [
        mov({ id: 'a', reference_id: 'CH-1' }),
        mov({ id: 'b', reference_id: 'CH-1', customer_id: 'cust-2' }),
        mov({ id: 'c', reference_id: 'CH-1', product_id: 'prod-2' }),
        mov({ id: 'd', reference_id: 'RET-1', movement_type: 'RETURN', reference_type: 'RETURN' }),
      ],
      'cust-1',
      'prod-1'
    );
    expect(options.map((o) => o.referenceId)).toEqual(['CH-1']);
  });

  it('returns empty when nothing dispatchable exists', () => {
    expect(groupDispatchChallans([], 'cust-1', 'prod-1')).toEqual([]);
    expect(
      groupDispatchChallans(
        [mov({ id: 'd', reference_id: 'RET-1', movement_type: 'RETURN', reference_type: 'RETURN' })],
        'cust-1',
        'prod-1'
      )
    ).toEqual([]);
  });
});
