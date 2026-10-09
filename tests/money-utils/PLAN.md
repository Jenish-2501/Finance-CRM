# M01 money-utils — Test Plan

Scope: `roundCurrency`, `formatINR`, `numberToWordsINR` (`src/utils/calculations.ts`).
Oracle: `tests/helpers/oracle.ts` (decimal.js on the exact binary value via `toPrecision(17)`,
half-up, 40-digit precision). No app output was copied into expectations: named literals below are
textbook cases; tie-case literals (2.675→2.67 etc.) are the ORACLE's answers, verified by running
decimal.js independently before the tests were written.

Inferred rounding rule (from code, for owner review): 2dp, half away from zero (symmetric), applied
at every intermediate step (per-line AND running accumulation — see M03 for the interaction).
`Number.EPSILON` nudge and `Math.round` +∞ bias in the pre-fix implementation violate this rule —
proven by R1 witnesses below, fixed in M01 (see BUGS_FOUND.md BUG-001, BUG-002).

## Scenarios

| # | Input | Expected | Basis |
|---|-------|----------|-------|
| 1.1 | `0.1 + 0.2` (=0.30000000000000004) | `0.3` | classic float drift |
| 1.2 | `1.005 * 100` (=100.49999999999999) | `100.5` | classic (binary value just below tie → see note N1) |
| 1.3 | `19.99 * 3` (=59.96999999999999) | `59.97` | classic |
| 1.4 | `0.01` summed 100× with running rounding | `1` | long sums of small amounts |
| 1.5 | `2.675` | `2.67` | R1 witness: binary value 2.6749999999999998 (oracle) |
| 1.6 | `1.005` | `1.0` | R1 witness: binary value 1.0049999999999999 (oracle) |
| 1.7 | `1.015`, `1.025`, `1.035`, `0.975`, `0.985`, `2.655`, `2.695` | `1.01`,`1.02`,`1.02`,`0.97`,`0.98`,`2.65`,`2.69` | R1 witnesses (oracle answers) |
| 1.8 | `-0.025`, `-0.005` | `-0.03`, `-0.01` | R1 witnesses: negative symmetry (oracle) |
| 1.9 | `0`, `-0.0014`, `123.456`, `-123.456` | `0`, `0`, `123.46`, `-123.46` | zero / sign |
| 1.10 | `Number.MAX_SAFE_INTEGER` | itself (integer passthrough) | very large (runtime oracle assertion) |
| 1.11 | `1e-9`, `0.0049`, `-0.0049` | `0`, `0`, `0` | very small |
| 1.12 | `NaN` → NaN; `±Infinity` → passthrough | `Number.isNaN` / identity | non-finite documented behavior |
| 1.13 | `formatINR`: 0→`₹0.00`; 100000→`₹1,00,000.00`; 12345678.9→`₹1,23,45,678.90`; -2500.5→`-₹2,500.50`; 999.999→`₹1,000.00`; NaN→`₹0.00`; showSymbol=false | literals | Indian-grouping spec |
| 1.14 | `numberToWordsINR`: 0, 7, 19, 20, 100, 105, 1000, 100000 (Lakh), 10000000 (Crore), 12345678 | literals | Indian words spec |
| 1.15 | `numberToWordsINR(100.50)` floors paise; negative drops sign | current behavior asserted, flagged R5 | needs owner decision, not changed |
| P1 | property: ∀ finite double in ±1e12, `roundCurrency(x) === oracleRound2(x)` (fc, seed logged) | dynamic oracle | fast-check 5000 runs |
| P2 | property: running-round sum of k∈[1,50] paise-ish amounts is within 1 paisa × k of `oracleSum2` | bound | error-accumulation bound |

N1: 1.2's expectation (100.5) differs from 1.6's rule applied naively — 1.2's INPUT is the float
100.49999999999999 whose binary truth rounds to 100.5? No: 100.49999999999999 → 2dp → 100.5 only if the
third decimal ≥5… 100.49999… → 100.50. Yes 100.5. Consistent.
