# M01 money-utils — Report

Date: 2026-10-09. Status: GREEN. Fast-check seed: 20261009 (override: `FC_SEED=<int>`).

## Counts
- `roundCurrency.test.ts`: 22 tests (4 classic + 12 tie witnesses + 4 edge + 2 property) — all pass.
- `format.test.ts`: 25 tests (12 formatINR + 13 numberToWordsINR) — all pass.
- Total: 47 passed, 0 failed. Regressions: `tsc`, `test:db`, `test:m1`, `test:m2` all still pass.
- Repeat run: identical green (deterministic seed; Phase 4 does the formal 3×).

## Bugs fixed (source, test-proven — see docs/testing/BUGS_FOUND.md BUG-001…004)
- BUG-001: EPSILON nudge rounded sub-tie floats up (2.675→2.68, 1.005→1.01 vs oracle 2.67/1.00).
- BUG-002: negative asymmetry (-0.025→-0.02 vs oracle -0.03).
- BUG-003: `Math.round(x*100)` unfixable class — float multiply lands sub-tie values exactly on the tie.
- BUG-004 (in my own fix, caught by the property test): expansion parser dropped integer digits ≥ 10,
  silently returning inputs ≥ 10 unrounded.
- Fix: exact integer (BigInt) half-up rounding on the round-trip decimal expansion; symmetric sign;
  explicit NaN/±Infinity passthrough; -0 normalized. No dependency changes, no API changes.

## Open concerns (for owner review)
- OC-1: oracle rounds the received binary value. A user typing "2.675" means decimal 2.675 (→2.68)
  but the float received is 2.6749999999999998 (→2.67). True decimal-intent rounding needs Decimal/integer
  paise end-to-end (architecture decision, NOT imposed here).
- OC-2: `numberToWordsINR` floors paise and drops negatives' sign — behavior locked by tests, flagged R5.
- OC-3: `formatINR` NaN→₹0.00 guard kept as specified behavior.
- OC-4: property domain ±1e12 finite doubles; values ≥1e16 rely on integer passthrough (covered by unit vectors).

## Commands
- `npx vitest run tests/money-utils` or `npm run test:module -- tests/money-utils`
