# AccuLedger — Module Map (Phase 1 Audit)

Date: 2026-10-09. No code changes in Phase 1 — this document is the audit output.
Stack: Electron 44 + React 19 + Vite 8 + Tailwind 4 + Zustand + better-sqlite3 + drizzle-orm.
Scope: `src/` (52 files) + `electron/` (46 files). Build artifacts (`dist/`, `dist-electron/`, `release/`)
and `node_modules/` excluded. App is single-owner (RBAC removed); all money is float64 `REAL`, rounded
to 2 decimals by one shared function. There is NO integer-minor-units representation anywhere.

Conventions below: **CRITICAL** = contains financial calculations (wrong number = critical bug).
Public functions list the testable surface (inputs → outputs).

---

## Modules (20)

### M01 money-utils — CRITICAL
Files: `src/utils/calculations.ts` (roundCurrency, formatINR, numberToWordsINR)
Public functions:
- `roundCurrency(amount: number) → number` — `Math.round((amount + EPSILON) * 100) / 100`
- `formatINR(amount, showSymbol?) → string` — Indian grouping (3-then-2), NaN guard
- `numberToWordsINR(amount) → string` — floors to integer, Crore/Lakh/Thousand
Dependencies: none (leaf). Depended on by: M02, M03, M04, M05, M06, M07, M08, M18.

### M02 tax-gst — CRITICAL
Files: `src/utils/calculations.ts` (calculateTax, TaxBreakdown), `electron/services/businessService.ts`
(GST_SLABS, settings/UOM validation), `src/views/SettingsView.tsx` (GST_SLABS duplicate + form validation)
Public functions:
- `calculateTax(taxable, rate, bizState, custState) → TaxBreakdown` — intra-state splits rate/2 into
  CGST+SGST (each half rounded separately), else full rate as IGST; rate≤0 or taxable≤0 → zero tax
- businessService: `getBusinessSettings / updateBusinessSettings / listUoms / createUom / setUomActive`
  (envelope `{ok, error}` results; GSTIN/PAN/state-code regexes, slab allow-list)
Inputs/outputs: (taxable ₹, slab %, 2-char state codes) → (cgst, sgst, igst, totalTax, isInterState).
Dependencies: M01. Depended on by: M03, M07, M11.

### M03 invoice-calc — CRITICAL
Files: `src/utils/calculations.ts` (calculateLineItemFinancials, calculateInvoiceTotals),
`src/store/accountingStore.ts` (createInvoice, finalizeInvoice, cancelInvoice),
`src/views/BillingView.tsx`, `src/views/InvoicesView.tsx`, `src/components/invoice/InvoicePrintView.tsx`
Public functions:
- `calculateLineItemFinancials(qty, price, discount, rate, extra, bizState, custState)` — per-line rounding
- `calculateInvoiceTotals(items, otherCharges?) → InvoiceTotals` — running-round accumulation
- store: create (snapshot customer/business/bank JSON + per-FY plain invoice_number + allocations),
  finalize DRAFT→FINALIZED, cancel (blocked if active payments exist)
Numbering (v7): `invoice_series` counters (UNIQUE fy), `invoices.fy` anchors every number, plain
sequences restart at `invoice_start_number` (default 1, no prefix/padding); `createInvoice` accepts
backdated `invoiceDate` (past only) and files by that date's FY with collision skip; Billing has a
date picker + double-submit guard; Header shows live FY. Identity backstop (v8, owner-approved
fail-fast): `UNIQUE(fy, invoice_number)` — same number across FYs legal, twice in one FY rejected
at SQLite. Tests in `tests/fiscal-year/`.
Dependencies: M01, M02, M09 (customer), M10 (product/price), M06 (allocations ↔ dispatch movements).
Depended on by: M04, M05, M07, M08.

### M04 ledger — CRITICAL
Files: `src/store/accountingStore.ts` (getCustomerLedger, getInvoiceOutstanding, getCustomerOutstanding),
`src/utils/calculations.ts` (calculateInvoiceOutstanding), `src/views/CustomerLedgerView.tsx`
Public functions:
- `calculateInvoiceOutstanding(grandTotal, status, payments)` — CANCELLED → 0/0; only ACTIVE payments count;
  outstanding clamped ≥ 0
- `getCustomerLedger(customerId) → LedgerEntry[]` — FINALIZED invoices = DEBIT, ACTIVE payments = CREDIT,
  date-sorted (INVOICE before PAYMENT on ties), running balance
- `getCustomerOutstanding` — sums FINALIZED invoice outstandings
Note: single-entry running-balance ledger (no double-entry chart of accounts; trial-balance/P&L/balance-sheet
do not exist — the task brief's double-entry scenarios are NOT APPLICABLE, flagged as gap G1).
Dependencies: M01, M03. Depended on by: M07.

### M05 payments — CRITICAL
Files: `src/store/accountingStore.ts` (createInvoicePayment, cancelInvoicePayment),
`src/views/PaymentsView.tsx`
Public functions:
- create: amount>0, invoice must be FINALIZED, amount ≤ outstanding (overpayment rejected), ACTIVE status
- cancel: ACTIVE→CANCELLED with reason appended to notes (no hard delete)
Methods: CASH/BANK_TRANSFER/UPI/CHEQUE/OTHER. No refunds/credit-notes/advance payments (gap G2).
Dependencies: M01, M03, M04. Depended on by: M07.

### M06 inventory — CRITICAL
Files: `src/utils/calculations.ts` (convertQuantity), `src/store/accountingStore.ts`
(createStockReceipt, dispatchBatchInventoryToCustomer, createCustomerReturn, createInventoryAdjustment,
getCurrentCompanyStock, getCustomerProductInventory, getCustomerInventorySummary,
getBillableMovementsForCustomer), `src/views/CompanyInventoryView.tsx`,
`src/views/CustomerInventoryView.tsx`, `src/components/challan/DeliveryChallanPrintView.tsx`
Public functions: dual-ledger stock (company `inventory_movements` + consignment
`customer_inventory_movements`, Rule 55 challan fields); dispatch validates company stock; return validates
customer holding; explicit `invoice_allocations` link movement↔invoice (no `is_billed` flags).
Dispatch documents (v9): one shared plain sequence for challans + returns — number lives ONCE in
`dispatch_documents` (UNIQUE per customer + type), movements carry `document_id`, creation is
header-atomic with counter advance and per-customer+type duplicate rejection; challan print groups
by document with legacy fallback. A row-level UNIQUE was proven unworkable (multi-row challans
legitimately share numbers); grouping key == unique key makes the backfill inherently safe.
Logistics capture removed (v14): vehicle/transporter/e-way/purpose/site-notes columns dropped
from movements (other tables' notes untouched); dispatch/return forms, challan screen + PDF show
place of supply only. Tests in `tests/dispatch-documents/`.
No FIFO/average valuation — quantities only, no cost tracking (gap G3).
Dependencies: M01, M09, M10. Depended on by: M03, M07.

### M07 reports — CRITICAL
Files: `src/views/ReportsView.tsx` (sales/receivables/payments/GST/inventory/consignments + CSV export),
`src/views/DashboardView.tsx` (KPI aggregation), `src/views/CustomerLedgerView.tsx` (print statement)
Behavior: re-aggregates from store in each view (third implementation of sales/outstanding sums alongside
store selectors and Dashboard — see risk R6). CSV via `files:saveCSV` in Electron, anchor-download in browser.
No P&L / balance-sheet / cash-flow / aging / trial-balance (gap G1).
Dependencies: M01–M06, M16 (file export). Depended on by: M08 (shared totals).

### M08 pdf-export — CRITICAL (numbers must match screen/DB exactly)
Files: `src/utils/pdfDocuments.ts` (buildInvoicePdf, buildChallanPdf, docToBase64, input interfaces),
print views (`InvoicePrintView`, `DeliveryChallanPrintView` — `window.print` parity)
Inputs: invoice+items+payments+allocations / challan movement → jsPDF document → base64 → `files:savePDFBytes`.
Dependencies: M03, M06, M07, M16.

### M09 customers
Files: `src/types/database.ts` (Customer), `electron/database/schema/customers.ts`,
`src/store/accountingStore.ts` (create/update/deleteCustomer, isCustomerNumberTaken),
`src/views/CustomersView.tsx`, `src/components/common/CustomerPicker.tsx` (customerMatchesQuery,
formatCustomerLabel)
Behavior: `customer_number` TEXT NOT NULL UNIQUE (v5 migration, backfilled `C-1001…`); store validates
required+unique (case-insensitive); delete is soft-disable when invoices/movements reference the customer.
Auto-numbering (v8): plain global sequence from 1, no prefix, no FY link — `suggestCustomerNumber()`
(plain-integers-only scan, floor, skip-taken) + `business_settings.customer_next_number` floor
(Settings-editable, backend-validated); create form auto-fills (editable override fast-forwards);
failures burn nothing. Tests in `tests/customer-numbers/`.
Dependencies: M13, M14 (persistence). Depended on by: M03, M04, M06.

### M10 products-uom
Files: `src/types/database.ts`, `electron/database/schema/products.ts`, store (create/updateProduct,
configureProductUnit, createProductPrice — closes prior active price), `src/views/ProductsView.tsx`,
businessService UOM guards (code format, uniqueness, cannot deactivate in-use UOM)
Dependencies: M01, M02 (slabs unaffected), M13, M14. Depended on by: M03, M06.

### M11 business-settings
Files: `electron/database/schema/business.ts`, `electron/services/businessService.ts`,
`electron/services/systemSeed.ts` (first-launch business+UOM seeding), `src/views/SettingsView.tsx`
Behavior: single `biz-1` row (GSTIN, state_code, invoice_prefix/next_number, default_gst_rate);
renderer+main both validate GSTIN/PAN/state-code/slabs; invoice numbering is renderer read-modify-write
(see risk R8). Depended on by: M02, M03.

### M12 auth-passcode
Files: `electron/services/authService.ts` (scrypt hash in `auth_settings`, throttle/lockout, 4–64 chars),
`electron/database/schema/auth.ts`, `src/views/LoginView.tsx`, `src/App.tsx` (sessionStorage gate),
`src/utils/shellEnv.ts` (hasDesktopBridge, isElectronShell)
Behavior: device lock, not accounts; canonical `passcode:*` + legacy `auth:*` channels.
Dependencies: M13, M14.

### M13 database-core — CRITICAL (money representation + atomicity live here)
Files: `electron/database/client.ts` (WAL, foreign_keys=ON, dev/prod file split, legacy adoption),
`electron/database/index.ts` (initDatabase, health, integrity_check), `electron/database/migrate.ts` +
`migrations/0001–0005`, `electron/database/schema/*`, `electron/services/transactionService.ts`
(saveDiffTransaction single-SQLite-transaction, loadFullState), `electron/services/systemSeed.ts`
Behavior: money as REAL float; repositories map snake_case↔camelCase + JSON snapshot columns.
Dependencies: none (leaf alongside M01). Depended on by: all persistence.

### M14 repositories-ipc
Files: `electron/database/repositories/*` (tableMap, toDrizzleRow/fromDrizzleRow, fetchAll/upsert/deleteRow),
`electron/ipc/handlers.ts` (36 channels: store lifecycle, domain upserts, invoices:transaction,
business-settings/uoms validated routes, maintenance, files), `electron/preload.ts` (typed bridge),
`electron/utils/validate.ts` (allow-listed entities, id shapes), `electron/utils/errors.ts` (AppDbError,
no SQL leaks), `src/main.tsx` (bridge typings)
Dependencies: M13. Depended on by: M09–M12, M15–M18.

### M15 migration-legacy
Files: `electron/services/migrationService.ts` (localStorage→SQLite one-shot + marker),
`electron/database/client.ts` (legacy application.db adoption), `electron/database/__tests__/m1.test.ts`
M1-6, `desktop.test.ts` D-5, `src/store/accountingStore.ts` (electronStorage, v3 strip of legacy user payload)
Dependencies: M13, M14.

### M16 backup-files
Files: `electron/services/backupService.ts` (VACUUM INTO + retention), `electron/utils/backupPaths.ts`
(nextBackupPath, pruneBackups, MAX_BACKUPS=7), `electron/services/schemaService.ts`
(getDatabaseStructure — PRAGMA introspection, no row data), files:saveCSV/savePDFBytes handlers,
`src/views/DatabaseStructureView.tsx`
Printing (added later, same module): `printers:list` (OS printer list via `getPrintersAsync`) +
`printing:printPage` (silent direct print with printer-name verification + copies 1–99, or OS dialog;
envelope results) in `electron/ipc/handlers.ts` + `preload.ts`; picker UI in
`DeliveryChallanPrintView` (printer dropdown, remembered choice, copies, direct/system paths).
Print output reuses the existing `@media print` CSS, so silent prints match the dialog path exactly.
Backup download UI + restore-with-override UI: App Settings tab (`src/views/AppSettingsView.tsx`,
tests in `tests/app-settings/`) driving `maintenance:exportBackup` — VACUUM snapshot + owner-chosen
save location for periodic full (data + structure) backups — and `maintenance:restoreBackup`
(`electron/services/backupService.ts` validate + checkpoint/close/replace/reopen with safety copy
and rollback; `electron/database/__tests__/restore.test.ts`, `npm run test:restore`).
Dependencies: M13, M14.

### M17 app-shell
Files: `electron/main.ts` (lifecycle, --smoke harness, --user-data-dir, dialog-gated errors),
`electron/utils/capabilities.ts`, `electron/utils/appPaths.ts`, `electron/utils/logger.ts`,
`src/utils/shellEnv.ts`, `src/components/layout/*` (Sidebar nav, Header)
Note: test isolation hook LANDED (owner-approved): `ACCULEDGER_TEST_USERDATA` in `electron/main.ts`
is honored only when `!app.isPackaged && isDev` (VITE_DEV_SERVER_URL present) and the value is absolute;
explicit `--user-data-dir` wins; packaged builds ignore the variable entirely. E2E launcher asserts the
active db file via the Database Structure view's dbFile label.
Dependencies: M12, M13, M14.

### M18 state-store
Files: `src/store/accountingStore.ts` (persist/electronStorage, v3 migrate, onRehydrate, resetToSeedData),
`src/data/seedData.ts`, `src/types/database.ts`
Behavior: memory-first, fire-and-forget `persistChanges`; seed reset deletes non-seed rows (audit append-only).
Dependencies: M01, M13, M14, M15.

### M19 ui-flows
Files: `src/App.tsx`, all 13 views, print views, `src/components/common/*`, `src/index.css`, `index.html`
Scope: navigation, modals, CustomerPicker keyboard/mouse flows, print parity, empty states.
Dependencies: M18 + everything above.

### M20 audit-trail
Files: `src/store/accountingStore.ts` (logAudit — fixed owner identity), `electron/database/schema/audit.ts`,
`src/views/AuditActivityView.tsx`
Behavior: append-only; resetToSeedData never deletes logs; renderer writes via `audit_logs:upsert`,
main writes via Repositories inside transactions.
Dependencies: M13, M14, M18.

Existing test inventory (reuse, do not duplicate): `src/tests/testSuite.ts` (12 store invariants, folded into
M03/M04/M05/M06/M20 calc coverage); `electron/database/__tests__/db.test.ts` (init/CRUD/constraints/tx/auth →
M12/M13); `m1.test.ts` (parity/coverage/IPC/auth-iso/seed/migration/backup/VACUUM → M13/M14/M15/M16, 8 blocks);
`m2.test.ts` (0003 dedupe, UOM seed, settings validation, UOM lifecycle, IPC parity → M10/M11); `desktop.test.ts`
D-1…D-6 (caps/shell/files/legacy/offline → M15/M17; D-6 needs `dist/`). package.json has only `test:db`;
m1/m2/desktop run via bare `tsx` (gap: no scripts — fixed in Phase 2).

---

## Dependency order for testing
M01 → M13 → M02 → M14 → M11 → M12 → M10 → M09 → M06 → M03 → M04 → M05 → M15 → M16 → M07 → M08 →
M18 → M20 → M17 → M19.
(Rationale: leaf money + DB first; tax before invoices; masters before movements before billing before
ledger/payments; files/backup before reports/PDF assertions; store/audit/shell/UI last. M17 before M19
because E2E needs the test-userData isolation from M17.)

## Risk list (suspicious code — each becomes a test target, not a fix, until a test proves a bug)
- R1 (CRITICAL): `roundCurrency` = Math.round half toward +∞ + EPSILON nudge — asymmetric for negatives;
  negatives occur (credit balances, adjustments). Needs boundary tests (x.xx5 ±) vs decimal.js oracle.
- R2 (CRITICAL): per-line vs total rounding inconsistency — `calculateInvoiceTotals` re-aggregates caller fields
  with running rounding, while `calculateLineItemFinancials` rounds per line; `rawLine - discount` fallback path
  skips per-line rounding. Sum-of-rounded vs rounded-sum can differ by paise across many lines.
- R3 (CRITICAL): intra-state halves rounded separately (CGST≠SGST edge at odd sub-paisa splits) and
  totalTax=cgst+sgst can differ 1 paisa from rounding the full rate once (e.g. 33.33 @ 5%).
- R4 (CRITICAL): money as REAL float end-to-end; `convertQuantity` rounds stock to 2dp (precision loss on
  unit conversions like BOX↔PCS fractions); save→reload→recalculate round-trip must be proven.
- R5: `numberToWordsINR` floors paise — printed words can disagree with printed figures (₹100.50 → "One Hundred").
- R6: same metric computed in 3 places (store selectors vs DashboardView vs ReportsView) — drift risk;
  cross-layer consistency tests required.
- R7: GST_SLABS duplicated in SettingsView + businessService (comment says "keep in sync" — no single source).
- R8: invoice numbering is renderer read-modify-write (`invoice_next_number` + persistDiff) — rapid double-create
  can duplicate numbers; no atomic increment/unique index on `invoice_number`.
- R9: `calculateInvoiceOutstanding` clamps to ≥0 — masks overpayment states if ever reachable.
- R10: `createInvoice` trusts caller `unitPrice` (no price-list enforcement) and `movementAllocations`
  (no over-allocation check beyond billable UI filtering) — server-side invariant gap.
- R11: `getCustomerLedger` tie-break (INVOICE before PAYMENT same-day) is a convention, needs a locked test.
- R12: test-6 comment says "18% GST" while app default is 5% — stale comment, expectation still valid (explicit
  fields) but shows drift between suite text and behavior.
- R13: `formatINR` NaN/null guard ordering; non-finite (Infinity) input untested → `toFixed` on Infinity throws
  RangeError in format path? (Verify: `Infinity.toFixed(2)` → "Infinity", no throw; but grouping code runs —
  needs a test, not a guess.)
- R14: quantity/cost `<input type=number>` strings flow into math unvalidated at store boundary (NaN/empty →
  NaN totals?). Store guards some (≤0) but not NaN; IPC validate.ts checks ids/shapes, not numeric ranges.
- R15: `deleteCustomer` hard-delete path leaves audit rows pointing at a vanished entity (dangling entity_id).
- R16: `baseRepository.ts` is a 2-line re-export shim — check nothing still imports it (else consolidate).
- R17: better-sqlite3 ABI split (Node tsx vs Electron) — no electron-rebuild config today; Phase 2 must resolve
  per test type or E2E-against-built-app becomes the only DB truth.
- R18: No scripts for m1/m2/desktop tests in package.json; desktop D-6 requires `dist/` build present.

## Gaps vs the brief (flagged for owner review, NOT assumed)
- G1: No double-entry/chart-of-accounts/trial-balance/P&L/balance-sheet/cash-flow/aging. Ledger is single-entry
  running-balance. Those brief scenarios cannot be tested — confirm out of scope.
- G2: No refunds, credit notes, advance/unallocated payments, multi-currency. Over-payment is rejected, not held.
- G3: No inventory cost valuation (FIFO/average); no stock value on any report.
- G4: No money-input parser (commas/symbols/locale strings) — inputs are `type=number`; untested strings reach
  math only via edge paths.
- G5: No import/restore feature (only CSV/PDF export + VACUUM backup). "Backup/restore" in brief = backup only.
