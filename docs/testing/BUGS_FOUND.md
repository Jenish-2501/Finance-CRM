# Bugs Found (all fixed in source; fixing test is green)

## BUG-005 — Modal steals focus from inputs on every keystroke (UX-critical, all modules)
- Symptom: clicking/typing in any modal text field moves focus outside the field (to the ✕ close
  button / background) — every modal in every module (customer create/edit, dispatch, return, stock
  receipt, payments, invoice preview…).
- Root cause: `src/components/common/Modal.tsx` focus effect had deps `[isOpen, onClose]`. Every call
  site passes an inline `onClose` closure (new identity per render), so the effect teardown (which
  restores background focus) + setup (which focuses `[data-autofocus]`, the ✕ button) re-ran on EVERY
  parent render — i.e. on every keystroke in a controlled input.
- Fix: effect deps narrowed to `[isOpen]` with open-transition guard (`wasOpenRef`); `onClose` consumed
  via `onCloseRef` so Escape always calls the latest closure; focus setup + scroll lock run only when the
  dialog opens, teardown (listener removal, scroll + focus restore) only on close/unmount. No visual or
  behavioral change otherwise (initial-focus-✕, focus-return, Escape verified by tests).
- Cover: `tests/modal-focus/modalFocus.test.tsx` (jsdom) — failed pre-fix with activeElement = ✕ button
  after one keystroke; 3/3 green post-fix.

## BUG-001 — roundCurrency EPSILON nudge rounds sub-tie floats UP (CRITICAL, M01)
- Symptom: `roundCurrency(2.675)===2.68`, `(1.005)===1.01`, `(1.015)===1.02`, `(0.975)===0.98`,
  `(0.015)===0.02`; oracle (decimal.js on exact binary value): 2.67/1.00/1.01/0.97/0.01.
- Root cause: `Math.round((amount + Number.EPSILON) * 100) / 100` pushes values sitting just below a
  half-cent tie over it. Proved by 10 failing witness tests (oracle asserted first, app diverged).
- Fix: removed the nudge; exact integer rounding (see BUG-003).
- Cover: `tests/money-utils/roundCurrency.test.ts` tie-witness block.

## BUG-002 — roundCurrency negative asymmetry (CRITICAL, M01)
- Symptom: `roundCurrency(-0.025)===-0.02`, `(-0.005)===0` (i.e. -0.00); oracle: -0.03/-0.01.
- Root cause: `Math.round` rounds half toward +∞, so negatives round toward zero while positives round away.
- Fix: symmetric sign-magnitude rounding in the same rewrite.
- Cover: same witness block (`-0.025`, `-0.005`).

## BUG-003 — float multiply makes Math.round(x*100) unfixable at ties (CRITICAL, M01)
- Symptom: after removing EPSILON, 6 witnesses still failed (2.675, 0.975, 0.985, 2.655, 2.695, 0.015).
- Root cause: `fl(2.675*100)` is exactly `267.5` in float64, so any `Math.round(x*100)` formulation rounds up
  although the received value is below the tie. No scaling formulation can be correctly rounded.
- Fix: `roundCurrency` now does exact BigInt half-up arithmetic on the `toPrecision(17)` round-trip expansion
  (`src/utils/calculations.ts`). Behavior: symmetric half-up, NaN/±Infinity pass through, -0 normalized.
- Cover: witness block + 5000-case seeded property test vs oracle.

## BUG-004 — expansion parser dropped integer digits ≥ 10, returning inputs unrounded (CRITICAL, M01)
- Symptom: property test counterexample `[10.000000000000002]` (shrunk, seed 20261009): actual
  `10.000000000000002`, expected `10`. Regex `^(\d)` captured only the first integer digit; the optional
  groups then failed to match, and the fail-open fallback returned the input untouched. Values 10–99.99…,
  100+, and all large amounts were NEVER rounded (123.456 passed only by luck of returning input).
- Root cause: my own fix's parser, author error — caught by the fast-check property before merge.
- Fix: `^(\d+)` full integer part; verified by the same property (5000 runs green) plus boundary vectors.
- Cover: property test `roundCurrency(x) === oracleRound2(x)`.
