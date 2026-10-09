# Customer Pricing — Test Plan

Scope: per-customer agreed prices (base `product_prices` untouched; override wins; separate
append-only history; Customer Pricing route; challan agreed rate; billing CUSTOM/BASE).
Owner decisions applied: no effective dating (immediate), challan shows agreed price + qty,
history in separate table, customer-first route + per-customer history button.

Seed facts used (inputs, not outputs): active base prod-1/uom-pcs = 120 (`pp-1-active`);
`cim-1` = cust-1/prod-1/uom-pcs DISPATCH 300 with 200 still billable (per testSuite test-4).

## Scenarios
| # | Action | Expected |
|---|--------|----------|
| 1 | `resolvePriceForCustomer(prod-1, uom-pcs, cust-1)` with no override | `{price:120, basePrice:120, isCustom:false}` (base=seed 120) |
| 2 | `setCustomerPrice(cust-1, prod-1, uom-pcs, 150)` → resolve cust-1 / cust-2 | cust-1 `{150,120,true}`; cust-2 `{120,120,false}` (isolation) |
| 3 | set 150 → set 165 | resolve 165; history `[165←150, 150←null]` newest-first |
| 4 | set 165 again (no change) | success, history length unchanged (no spam) |
| 5 | `clearCustomerPrice` → resolve | back to base; history appends `165→removed` |
| 6 | set negative / NaN / unknown customer / inactive customer | `{success:false}` + error; state unchanged |
| 7 | override 140 → `getBillableMovementsForCustomer(cust-1)` cim-1 row | `applicablePrice 140, basePrice 120, isCustomPrice true` (billing sells agreed) |
| 8 | invoice built from billable rows → change override → old invoice item | snapshot keeps agreed-at-billing price (independence) |
| 9 | `getCustomerPriceHistory` for untouched customer | `[]` |
| 10 | `setCustomerPrice` rounds fractional paise via roundCurrency (e.g. 99.999→100) | stored 100 (oracle-consistent) |

Cleanup: every override created is cleared at test end (isolated worker per file, but tidy anyway).
