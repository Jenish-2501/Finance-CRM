# Fiscal-year numbering — Test Plan

Scope: `getFyForDate` (IST-aware Apr–Mar), `invoice_series` counters, backdated billing,
Settings series controls. Locked decisions: plain numbers from 1, no prefix/padding on the
invoice, `invoices.fy` anchors every number, invoice date = chosen billing date (past only).

## Scenarios
FY boundaries (`fyBoundaries.test.ts`, pure — literals are independently known calendar facts):
| # | Input (UTC ISO) | IST meaning | Expected |
|---|-----------------|-------------|----------|
| 1 | 2026-03-31T18:29:59Z | 23:59:59 Mar 31 | 2025-26 |
| 2 | 2026-03-31T18:30:00Z | 00:00:00 Apr 1 | 2026-27 |
| 3 | 2026-04-01T00:00:00Z | 05:30 Apr 1 | 2026-27 |
| 4 | 2026-01-15T10:00:00Z | Jan | 2025-26 |
| 5 | 2025-12-31T23:59:59Z | 05:29 Jan 1 | 2025-26 |
| 6 | 2024-02-29T12:00:00Z | leap day | 2023-24 |
| 7 | 2025-04-01T00:00:00Z | 05:30 Apr 1 | 2025-26 |
| 8 | 2024-03-31T18:30:00Z | 00:00 Apr 1 | 2024-25 |
| 9 | 2030-06-15T00:00:00Z | Jun 2030 | 2030-31 |
| 10 | 1999-05-01T00:00:00Z | May 1999 | 1999-00 (label rule: last two digits) |

Series + backdating (`series.test.ts`, store with seed data, fixed past dates):
| # | Action | Expected |
|---|--------|----------|
| 11 | create @2026-01-15 | fy 2025-26, number '1' |
| 12 | create @2026-01-16 | same FY, number '2' (monotonic) |
| 13 | create @2026-05-10 | auto-rollover: fy 2026-27, number '1'; two series rows |
| 14 | future date / garbage date | rejected; invoice count unchanged (no number burned) |
| 15 | 50 rapid Jan creates | 50 unique, gapless 3..52 within FY |
| 16 | setSeriesNextNumber(fy,100) → create | gets '100' |
| 17 | set below max-used / 0 / 1.5 | rejected with floor error |
| 18 | backdate 2026-03-31 vs 2026-04-01 | fys 2025-26 / 2026-27 (Mar invoice never steals April's series) |
| 19 | startNewFySeries twice | one row per FY (idempotent) |
| 20 | change override after invoice | old invoice keeps billed number (snapshot independence) |

Upgrade (`upgrade.test.ts`, temp DBs): legacy v6 shape (no fy/start/series) → only v7 applies →
fy backfilled ('2025-26' for Jan row), start_number default 1, legacy number byte-identical,
series empty (created on first use, never fabricated).
