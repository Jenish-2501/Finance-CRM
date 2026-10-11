# Dispatch documents — Test Plan

One shared plain sequence for challans + returns (no prefix, no FY link). The number lives
ONCE per document in `dispatch_documents` (UNIQUE per customer + type); movements carry
`document_id`. Legacy multi-row challans collapse into one header by construction, so the
migration cannot fail on messy history. Returns draw from the same counter (no prefixes left
to distinguish families — the shared counter keeps every number unambiguous).

Seed facts used: cim-1 = cust-1/prod-1/pcs DISPATCH CH-501; cust-1 holds 250 pcs prod-1;
company prod-1 stock ≈ 1050; no plain document numbers in seeds.

## Scenarios (store)
| # | Action | Expected |
|---|--------|----------|
| 1 | suggest DISPATCH cust-1 | '1' (legacy CH- refs ignored by scan) |
| 2 | dispatch cust-1 (1 item, no ref) | ref '1'; header DISPATCH exists; movement.document_id set; counter → 2 |
| 3 | dispatch cust-2 (1 item, no ref) | ref '2' — counter is global across customers |
| 4 | return cust-1 5pcs (no ref) | ref '3' — dispatch+return share one sequence |
| 5 | dispatch 2 items, no ref | ONE header; both movements same document_id |
| 6 | custom ref '10' | ok; counter → 11 |
| 7 | same ref '10', same customer+type | rejected |
| 8 | ref '10', other customer, DISPATCH | ok (granularity is per customer+type) |
| 9 | zero-qty dispatch | rejected; counter unchanged (nothing burned) |

## Scenarios (upgrade v8 → v9, temp DBs)
| # | Fixture | Expected |
|---|---------|----------|
| 10 | cust-A: 2×DISPATCH 'CH-900' (2 products) + 1×RETURN 'RET-900'; cust-B: 1×DISPATCH 'CH-900' | only v9 applies; exactly 3 headers (multi-row collapsed); all movements backfilled; counter default 1; UNIQUE index exists |
| 11 | insert dup header (A,DISPATCH,'CH-900') | throws UNIQUE |
| 12 | insert (B,RETURN,'CH-900') and (A,RETURN,'CH-900') | both succeed (different customer / different type) |
