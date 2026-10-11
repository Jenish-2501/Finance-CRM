# Customer auto-numbers — Test Plan

Plain global sequence (1, 2, 3…), no prefix, no FY link. Counter floor in
`business_settings.customer_next_number`; live scan keeps it honest; skip-taken
loop + DB UNIQUE backstop. Gaps are never backfilled (deleted numbers stay dead —
audit/history may reference them).

## Scenarios (pure helper)
| # | existing, floor | Expected |
|---|-----------------|----------|
| 1 | [], 1 | '1' |
| 2 | ['1','2'], 1 | '3' |
| 3 | ['1','2','4'], 1 | '5' (gap 3 NOT reused) |
| 4 | ['C-1001','C-1005'], 1 | '1' (legacy codes ignored by scan, stay valid) |
| 5 | ['1'], 10 | '10' (floor respected) |
| 6 | ['1'..'10'], 5 | '11' (skips taken) |
| 7 | ['1'], 0 / -3 / NaN | '1' (bad floor → 1) |
| 8 | ['1'], 1, maxAttempts 0 | '' (exhausted) |

## Scenarios (store, seed DB: C-1001…C-1005, no plain numbers)
| # | Action | Expected |
|---|--------|----------|
| 9 | suggest | '1' |
| 10 | create (empty number) | gets '1'; counter → 2 |
| 11 | create (empty) again | gets '2' |
| 12 | create custom '10' | ok; counter fast-forwards to 11 |
| 13 | create custom '10' again | rejected as taken |
| 14 | create custom 'VIP' | ok (override allowed); counter stays 11; next auto → '11' |
| 15 | failed validation (no name? name required? — store createCustomer has no name check; use taken-number failure) | counter unchanged (nothing burned) |
