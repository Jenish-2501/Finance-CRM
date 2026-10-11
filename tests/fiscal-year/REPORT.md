# Fiscal-year numbering — Report

Date: 2026-10-09. Status: GREEN (20/20). Owner answers applied: plain numbers from 1
(no prefix/padding), invoices carry `fy`, backdated billing real, header shows live FY.

## Delivered
- Engine: `getFyForDate()` (IST-midnight boundary) + migration v7 (`invoice_start_number`,
  `invoices.fy` backfilled from stored dates, `invoice_series` with UNIQUE fy) + repositories,
  validation keys (max 18), businessService start-number validation.
- Store: `ensureSeries` (idempotent auto-rollover), `startNewFySeries`, `setSeriesNextNumber`
  (never rewinds into issued numbers); `createInvoice` takes `invoiceDate` (past only), files the
  invoice in its own date's FY, consumes the next free plain number with collision skip, persists
  the bumped series (legacy `invoice_next_number` counter retired from the write path).
- UI: Billing invoice-date picker (max today, FY preview badge) + double-submit guard; Settings
  FY section (start number, current counter, rollover button, locked history); Header shows live FY.
- Backdating (per owner confirmation): a 31-Mar bill draws FY 2025-26 numbers; 1-Apr draws
  2026-27 — proven by boundary tests. Invoice date still defaults to today.

## Counts
- `fyBoundaries`: 10 passed (IST edges, leap day, label rule incl. 1999-00).
- `series`: 9 passed (start-at-1, monotonic, auto-rollover, future/invalid rejected with no
  burn, 50 rapid unique+gapless, advance/reject rules, Mar/Apr series separation, idempotent
  rollover, snapshots immune). New-number assertions discriminate old (prefix) behavior.
- `upgrade`: legacy v6 → only v7 applies; fy backfilled; start defaults 1; legacy number
  byte-identical; no series fabricated.
- Regressions: `tsc` (+unused), all vitest files, `test:db`, `test:m1`, `test:m2`,
  `test:restore` green (version asserts bumped to v7).

## Open concerns (for owner review)
- Duplicate display numbers across FYs (e.g. `5` in both years) — FY column disambiguates;
  number search UIs may want an FY filter later.
- Premigration `invoice_next_number`/`invoice_prefix` columns retained but no longer drive
  invoices (prefix input removed from Settings; backend validation kept).
- UTC-backfilled `fy` for pre-v7 rows assumes non-boundary timestamps (all shipped rows qualify).

## Commands
- `npx vitest run tests/fiscal-year`
