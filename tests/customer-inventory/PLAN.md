# Customer inventory billing states — Test Plan

Pure helpers in `src/utils/calculations.ts` driving consignment quick actions
(Customer Inventory & Consignments screen). Expectations are independently fixed
literals (boundary logic), not app output.

## Scenarios
| # | Input | Expected |
|---|-------|----------|
| 1 | `isHoldingsRowFullyBilled(100, 0)` | `true` (billed, nothing left → Billed badge, no Return) |
| 2 | `isHoldingsRowFullyBilled(100, 50)` | `false` (partial → Return + Bill stay) |
| 3 | `isHoldingsRowFullyBilled(0, 0)` | `false` (nothing ever billed → NOT billed; old actions unchanged) |
| 4 | `isHoldingsRowFullyBilled(0, 200)` | `false` (fully unbilled) |
| 5 | `getMovementBillingStatus(300, 300)` | `BILLED` |
| 6 | `getMovementBillingStatus(300, 350)` | `BILLED` (over-allocation quirk still counts as billed) |
| 7 | `getMovementBillingStatus(300, 100)` | `PARTIAL` |
| 8 | `getMovementBillingStatus(300, 0)` | `UNBILLED` |
| 9 | `getMovementBillingStatus(0, 0)` | `UNBILLED` (degenerate, never BILLED) |
