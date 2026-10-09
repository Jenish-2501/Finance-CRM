import { describe, it, expect } from 'vitest';
import { isHoldingsRowFullyBilled, getMovementBillingStatus } from '../../src/utils/calculations';

describe('holdings-row billed state', () => {
  it('billed with nothing left → fully billed', () => {
    expect(isHoldingsRowFullyBilled(100, 0)).toBe(true);
  });
  it('partial billing → not fully billed', () => {
    expect(isHoldingsRowFullyBilled(100, 50)).toBe(false);
  });
  it('nothing ever billed → not billed (old actions unchanged)', () => {
    expect(isHoldingsRowFullyBilled(0, 0)).toBe(false);
    expect(isHoldingsRowFullyBilled(0, 200)).toBe(false);
  });
});

describe('per-movement billing status', () => {
  it('fully allocated → BILLED', () => {
    expect(getMovementBillingStatus(300, 300)).toBe('BILLED');
  });
  it('over-allocated quirk → BILLED', () => {
    expect(getMovementBillingStatus(300, 350)).toBe('BILLED');
  });
  it('some allocated → PARTIAL', () => {
    expect(getMovementBillingStatus(300, 100)).toBe('PARTIAL');
  });
  it('none allocated → UNBILLED', () => {
    expect(getMovementBillingStatus(300, 0)).toBe('UNBILLED');
  });
  it('degenerate zero movement → UNBILLED, never BILLED', () => {
    expect(getMovementBillingStatus(0, 0)).toBe('UNBILLED');
  });
});
