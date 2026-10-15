# Challan PDF layout — Report

Date: 2026-10-09. Status: GREEN (7/7). Compact A6 grid redesign of `buildChallanPdf`
only; invoice PDF and all callers untouched (input shape identical).

## Delivered
- Ruled grids throughout: header block + double rule, full-width consignee box
  (consignor already in the header — no duplicate party column), items grid with dark
  header and dedicated Weight column (`-` for rows without weight), bold totals,
  ruled signature boxes.
- Per owner review: back to A6 page size; GSTIN/PAN removed from the header (tax-invoice
  data, not challan data); consignor column removed with consignee at full width;
  tabular grid kept; DELIVERY CHALLAN badge text vertically centered in its pill.
- Fixed: footer was `7 | Page 1 of 1` (bare ref) → challan number on the left,
  only `Page X of Y` on the right; customer `Contact: -` omitted when no mobile;
  `Ring Road surat Surat` city duplication removed via address formatter.
- Business address + contact moved from the header to the footer (both PDF and screen
  view share the formatter, keeping print parity).
- `stampFooter` now omits the dangling separator when no right text is given (shared
  helper; invoice call sites pass non-empty text, unaffected).

## Counts
- `challan.test.ts`: 7 passed (content anchors, footer format incl. bare-ref absence,
  contact omission, city dedupe, weight consistency, 30-row pagination markers,
  empty-items build). Expectations encode the redesign and fail against the old
  layout (verified by reading the replaced code paths).

## Commands
- `npx vitest run tests/challan-pdf`
