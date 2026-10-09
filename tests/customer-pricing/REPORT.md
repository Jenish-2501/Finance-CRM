# Customer Pricing — Report

Date: 2026-10-09. Status: GREEN (12/12: 10 resolution + 2 challan display).
Owner answers applied: immediate effect (no dating), challan shows agreed price + qty,
history in separate table, customer-first route + per-customer history button.

## Delivered
- DB: `customer_product_prices` (UNIQUE customer×product×unit) + append-only
  `customer_price_history`, migration v6, repositories, validation keys (max 17).
- Store: `setCustomerPrice` (validates active customer/product, finite ≥0, same-price no-op),
  `clearCustomerPrice` (removal logged with `new_price null`), `resolvePriceForCustomer`
  (override → base), `getCustomerPriceHistory` (newest-first). Billing (`applicablePrice`,
  +`basePrice`/`isCustomPrice`) and challan (agreed rate, rounded line totals) consume the
  single selector. Invoices unchanged — snapshots already store the charged `unit_price`.
- Route: Sales & Billing → Customer Pricing (per product-unit rows, base vs agreed, margin ₹/%
  incl. below-base warning, CUSTOM/BASE badges, per-customer History modal).
- Challan screen + PDF relabeled Indicative → Agreed (same `itemRows` shape, PDF follows).

## Counts
- `resolution.test.ts`: 10 passed (order, isolation, history newest-first, no-op, clear/removal,
  validation incl. inactive, paise rounding, billing carry-through, snapshot independence).
- `challanPrice.test.tsx`: 2 passed (agreed display proven against base-only code by temporary
  revert: 1 failed pre-fix as required; fallback BASE proven).
- Regressions: `tsc` (+unused), all vitest files, `test:db`, `test:m1`, `test:m2` green.

## Open concerns (for owner review)
- Overrides are per billing unit (exact match); other units fall back to base with no conversion.
- First-ever price logs `old_price null`; removals log `new_price null`.
- Below-base agreed prices allowed (margin shown red) — no minimum-margin enforcement.
- Challan `lineTotal`/`totalIndicativeVal` now rounded via roundCurrency (display-hardening inside
  this change, not a separately proven bug).

## Commands
- `npx vitest run tests/customer-pricing`
