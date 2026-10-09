import { describe, it, expect } from 'vitest';
import { formatINR, numberToWordsINR } from '../../src/utils/calculations';

describe('formatINR — Indian grouping', () => {
  const cases: Array<[number, string]> = [
    [0, '₹0.00'],
    [1, '₹1.00'],
    [999.99, '₹999.99'],
    [999.999, '₹1,000.00'],
    [1000, '₹1,000.00'],
    [100000, '₹1,00,000.00'],
    [12345678.9, '₹1,23,45,678.90'],
    [123456789, '₹12,34,56,789.00'],
    [-2500.5, '-₹2,500.50'],
    [-100000, '-₹1,00,000.00'],
  ];
  for (const [input, expected] of cases) {
    it(`formatINR(${input}) === ${expected}`, () => {
      expect(formatINR(input)).toBe(expected);
    });
  }
  it('NaN renders as zero (documented guard)', () => {
    expect(formatINR(NaN)).toBe('₹0.00');
  });
  it('showSymbol=false omits the rupee sign', () => {
    expect(formatINR(100000, false)).toBe('1,00,000.00');
    expect(formatINR(-2500.5, false)).toBe('-2,500.50');
  });
});

describe('numberToWordsINR — Indian words', () => {
  const cases: Array<[number, string]> = [
    [0, 'Rupees Zero Only'],
    [7, 'Rupees Seven Only'],
    [19, 'Rupees Nineteen Only'],
    [20, 'Rupees Twenty Only'],
    [100, 'Rupees One Hundred Only'],
    [105, 'Rupees One Hundred Five Only'],
    [1000, 'Rupees One Thousand Only'],
    [100000, 'Rupees One Lakh Only'],
    [2500000, 'Rupees Twenty Five Lakh Only'],
    [10000000, 'Rupees One Crore Only'],
    [12345678, 'Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only'],
  ];
  for (const [input, expected] of cases) {
    it(`numberToWordsINR(${input}) === "${expected}"`, () => {
      expect(numberToWordsINR(input)).toBe(expected);
    });
  }
  it('paise are floored on print (R5 — flagged for owner review, behavior locked, not changed)', () => {
    expect(numberToWordsINR(100.5)).toBe('Rupees One Hundred Only');
  });
  it('negative amounts drop the sign (flagged for owner review, behavior locked, not changed)', () => {
    expect(numberToWordsINR(-250)).toBe('Rupees Two Hundred Fifty Only');
  });
});
