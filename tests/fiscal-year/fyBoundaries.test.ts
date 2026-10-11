import { describe, it, expect } from 'vitest';
import { getFyForDate } from '../../src/utils/calculations';

// Independently known calendar facts (UTC instant → IST wall time → FY).
// The critical property: the IST midnight boundary, never the UTC date.
describe('getFyForDate — IST-aware April–March boundaries', () => {
  const cases: Array<[string, string]> = [
    ['2026-03-31T18:29:59Z', '2025-26'], // 23:59:59 IST, still March
    ['2026-03-31T18:30:00Z', '2026-27'], // 00:00:00 IST, April has begun
    ['2026-04-01T00:00:00Z', '2026-27'], // 05:30 IST Apr 1
    ['2026-01-15T10:00:00Z', '2025-26'],
    ['2025-12-31T23:59:59Z', '2025-26'], // 05:29 IST Jan 1
    ['2024-02-29T12:00:00Z', '2023-24'], // leap day
    ['2025-04-01T00:00:00Z', '2025-26'],
    ['2024-03-31T18:30:00Z', '2024-25'],
    ['2030-06-15T00:00:00Z', '2030-31'],
    ['1999-05-01T00:00:00Z', '1999-00'], // label rule pins last two digits
  ];
  for (const [input, expected] of cases) {
    it(`${input} → FY ${expected}`, () => {
      expect(getFyForDate(input)).toBe(expected);
    });
  }
});
