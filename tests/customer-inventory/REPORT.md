# Customer inventory billing states — Report

Date: 2026-10-09. Status: GREEN (8/8).

## Delivered (Customer Inventory & Consignments screen)
- Holdings Quick Actions: per-row **Dispatch button removed** (dispatching moves to the header
  **New Dispatch** button for the selected customer — capability preserved, table decluttered).
- Holdings: **Return hidden once a row is fully billed** (`billed > 0` and nothing billable left);
  a green **Billed** badge replaces the actions. Partially/unbilled rows keep Return + Bill exactly
  as before (minimal behavior change).
- Movements ledger: new per-challan **Billing Status** column — Billed (green, fully allocated),
  Partial (amber), Unbilled (neutral); non-dispatch rows show —. Status derives from non-cancelled
  `invoice_allocations` against the exact movement, same unit, no date hacks.
- Shared pure helpers (`isHoldingsRowFullyBilled`, `getMovementBillingStatus`) live in
  `src/utils/calculations.ts` so the rule is tested once and reused.

## Counts
- `status.test.ts`: 8 passed (row-state boundaries incl. never-billed ≠ billed; movement
  BILLED/PARTIAL/UNBILLED incl. over-allocation quirk and degenerate zero movement).
- Regressions: `tsc` (+unused), all vitest files, `test:db`, `test:m1`, `test:m2` green.

## Commands
- `npx vitest run tests/customer-inventory`
