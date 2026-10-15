# Dispatch documents — Report

Date: 2026-10-09. Status: GREEN (8/8). One shared plain sequence for challans +
returns (no prefix, no FY link); the number lives once per document header.
- Store: `suggestNextDocumentNumber`, header-atomic dispatch/return creation (counter
  advances, duplicates rejected per customer+type, failures burn nothing).
- UI: dispatch/return reference inputs auto-fill (editable), Settings counter row, challan
  print groups by document with legacy fallback.
- Why a header table (researched): row-level UNIQUE cannot work — multi-row challans
  legitimately share numbers and legacy mess is indistinguishable from true duplicates.
  Grouping key == unique key makes the migration inherently safe (collapse, never fail).

## Counts
- `docs.test.ts`: 6 passed (suggest-1, header linkage, global sharing dispatch→customer→return,
  multi-item single header, custom/duplicate scoping, no burn on failure).
- `upgrade.test.ts`: 2 passed (v8→v15: 3 headers incl. collapsed multi-row, ids backfilled,
  counter default, index live; v15 drops 5 logistics columns with quantities/refs/row count
  intact; UNIQUE rejects true dups, allows other customer/type).
- Regressions: `tsc` (+unused), all vitest files, `test:db`, `test:m1`, `test:m2`,
  `test:restore` green (version asserts bumped to v15).

## Commands
- `npx vitest run tests/dispatch-documents`
