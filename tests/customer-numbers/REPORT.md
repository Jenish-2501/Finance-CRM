# Customer auto-numbers — Report

Date: 2026-10-09. Status: GREEN (15/15). Plain global sequence (1, 2, 3…), no prefix,
no FY link; manual override stays allowed and validated.

## Delivered
- Pure `suggestCustomerNumber()` (plain-integers-only scan, floor, skip-taken loop, cap).
- `business_settings.customer_next_number` floor (migration v8, seed default 1, backend
  validation, Settings editor, migrate/onRehydrate defaults).
- `createCustomer`: empty number auto-assigns; counter advances past every issued number
  (custom overrides fast-forward it); failures burn nothing.
- Create form auto-fills the suggestion (editable); edit form unchanged (still requires a number).

## Counts
- `auto.test.ts`: 11 pure vectors (gaps never backfilled, legacy codes ignored, bad floors,
  exhaustion) + 4 store integration (1→2, fast-forward, duplicate/override rules, no burn).
- Regressions: `tsc` (+unused), all vitest files, `test:db`, `test:m1`, `test:m2`,
  `test:restore` green.

## Commands
- `npx vitest run tests/customer-numbers`
