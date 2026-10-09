# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Owner-operator of a single small Indian trading business (Gujarat-based; INR, GST). The owner does billing, stock, payments, and GST reporting themselves on one desktop machine. Single-user app: no logins, no roles, no staff accounts — the app opens directly for the owner.

## Product Purpose

GST-compliant billing, inventory, and receivables management for a small Indian business. It exists so the owner can raise correct GST invoices, track company and consignment stock, reconcile payments, and produce GSTR-1-ready summaries without depending on the internet, a subscription, or an accountant for daily work. Success means every sale is invoiced with correct tax math, every stock movement is traceable, and tax time is an export, not a reconstruction.

## Positioning

Offline-first desktop billing: all data lives in an on-machine SQLite database, the app works fully offline, and there is no subscription. The meaningfully different mechanism is the combination of billing, consignment stock transfer with Rule 55 delivery challans, and immutable invoice snapshots in one local tool.

## Operating Context

Shop back-office / billing-counter desktop. Core workflows: maintain customers (with GSTIN and state code) and products; raise GST invoices with automatic intra-state CGST+SGST vs inter-state IGST splitting; record CASH / UPI / bank / cheque payments against invoices; transfer stock from company godown to customer sites with Rule 55 CGST delivery challans; print invoices, challans, and ledgers; export CSV reports. Every invoice is an immutable snapshot; every data change lands in an audit log.

## Capabilities and Constraints

Confirmed capabilities: dashboard, billing, invoices (immutable snapshots), payments and allocations, customers, products with units and price tiers, company inventory, customer (consignment) inventory, delivery challans, GST/tax and receivables reports with CSV export, business settings (GSTIN, state code, invoice numbering, tax defaults), audit log, localStorage-to-SQLite migration.

Constraints: single-machine desktop (Electron + better-sqlite3), fully offline, single business, INR currency, Indian GST rules (CGST/SGST/IGST, GSTR-1). Brand: the incumbent code already names the product "AccuLedger" (Sidebar branding, invoice/challan print footers); the "React Example App" build identity in package.json is a placeholder and must not be treated as the brand. Open decision: user confirmation that AccuLedger is the real product name.

## Evidence on Hand

Seed data for a Surat/Gujarat business (state code 24) in `src/data/seedData.ts`; printable invoice, challan, and ledger views in `src/components/`; GST math tests in `src/tests/testSuite.ts`. Absent and must not be fabricated: brand assets, real business identity, testimonials, pricing, benchmarks.

## Product Principles

1. Correct tax math over speed — a wrong GST split is worse than a slow screen.
2. Paper-trail parity — anything the app records must be printable and auditable.
3. Offline always — no workflow may assume connectivity.
4. Owner-readable, not accountant-only — plain language and visible totals over jargon.
