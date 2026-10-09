import Decimal from 'decimal.js';

// Independent oracle for all money tests. Uses decimal.js with high precision
// and NEVER imports app code, so expectations cannot leak the implementation.
//
// Oracle rule (M01): the app receives IEEE-754 binary floats. The oracle rounds the
// EXACT received value: `float.toPrecision(17)` is the shortest string that
// round-trips the binary value, so Decimal of that string is the binary truth
// (verified: Decimal(2.675) = 2.675 decimal-intent, but the float 2.675 IS
// 2.6749999999999998 — the oracle must use the latter).

Decimal.set({ precision: 40 });

export const HALF_UP = Decimal.ROUND_HALF_UP;

/** Correct 2dp half-up rounding of the exact binary value received. */
export function oracleRound2(x: number): number {
  if (!Number.isFinite(x)) return x;
  const r = new Decimal(x.toPrecision(17)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return r.isZero() ? 0 : r.toNumber();
}

/** Exact decimal sum of binary values, rounded once at the end. */
export function oracleSum2(values: number[]): number {
  let s = new Decimal(0);
  for (const v of values) s = s.plus(new Decimal(v.toPrecision(17)));
  const r = s.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return r.isZero() ? 0 : r.toNumber();
}

/** Money equality that treats -0 and +0 as equal (both are zero rupees). */
export function expectMoney(actual: number, expected: number): void {
  if (!(actual === expected)) {
    throw new Error(`money mismatch: actual=${actual} expected=${expected}`);
  }
}
