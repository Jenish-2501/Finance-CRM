---
name: AccuLedger
description: Offline-first GST billing, stock, and receivables ledger for a single Indian business.
colors:
  ink: "#171717"
  ink-deep: "#0a0a0a"
  paper: "#ffffff"
  ledger-wash: "#f5f5f5"
  ledger-mist: "#fafafa"
  ledger-line: "#e5e5e5"
  muted-ink: "#737373"
  signal-emerald: "#047857"
  signal-emerald-deep: "#065f46"
  signal-emerald-wash: "#ecfdf5"
  warn-amber-deep: "#78350f"
  warn-amber-wash: "#fffbeb"
  danger-rose: "#e11d48"
  danger-rose-wash: "#fff1f2"
  info-sky-deep: "#075985"
  info-sky-wash: "#f0f9ff"
typography:
  display:
    fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.33
    letterSpacing: "0.05em"
  body:
    fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "8px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-primary-hover:
    backgroundColor: "{colors.ink-deep}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-success:
    backgroundColor: "{colors.signal-emerald}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  input-default:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  card-default:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px 20px"
---

# Design System: AccuLedger

## Overview

**Creative North Star: "The Ledger Counter"**

AccuLedger looks the way a well-kept billing counter feels: monochrome, dense, and exact. The interface is a restrained ledger — black ink on paper whites, tabular numerals everywhere, and color reserved strictly for money-state (collected, outstanding, failed). Nothing decorates; everything reconciles.

The voice is owner-readable clarity. A Surat shop owner doing their own GST billing sees plain section titles ("Billing Wizard", "Available Unbilled Dispatch Movements"), visible grand totals with a double-rule emphasis, and mono GSTIN/state-code context wherever tax math depends on it. Paper-trail parity is visual: anything recorded on screen is laid out to survive printing unchanged.

**Key Characteristics:**
- Achromatic core (neutral-900 ink on white/wash) with semantic-only color.
- Tabular mono numerals for every amount, date, GSTIN, and reference ID.
- Flat cards with tonal headers; depth only for overlays and print sheets.
- Dense operational tables with uppercase mono section labels.

## Colors

One ink, paper grays, and status-only signals. There is no brand hue; rarity of color is the signal.

### Primary
- **Counter Ink** (#171717 / `bg-neutral-900`): The single primary action color. Primary buttons ("Bill Customer Inventory", "Generate & Save Invoice"), sidebar shell, and the TAX INVOICE masthead block.
- **Deep Ledger Black** (#0a0a0a / `text-neutral-950`): Display headings and grand-total numerals. Used for the page H1 ("Financial & Operations Overview") and KPI amounts.

### Neutral
- **Paper White** (#ffffff): Card, modal, input, and printable-invoice ground.
- **Ledger Wash** (#f5f5f5 / `bg-neutral-100`): App canvas behind cards. Never used for text.
- **Ledger Mist** (#fafafa / `bg-neutral-50`): Card section headers (`bg-neutral-50/60`), hover fills, and the bill-to snapshot panel.
- **Ledger Line** (#e5e5e5 / `border-neutral-200`): Every card border, table divider, and header rule. The print sheet uses a heavier 2px ink rule for the company header and grand total.
- **Muted Ink** (#737373 / `text-neutral-500`): Secondary labels, helper copy, and table metadata. Always paired with a darker value for the actual figure.
- **Signal Emerald Wash** (#ecfdf5) / **Signal Emerald** (#047857) / **Deep Collections Green** (#065f46): Money-in states — collections KPI, FINALIZED badges, "Verify Accounting Invariants" trigger, "Finalize Invoice" action, paid amounts.
- **Caution Amber Wash** (#fffbeb) / **Outstanding Amber** (#78350f): DRAFT badges, outstanding-receivables KPI, "remaining balance" hints.
- **Void Rose Wash** (#fff1f2) / **Void Rose** (#e11d48): CANCELLED badges, errors, destructive "Cancel Invoice" / "Confirm Reset" actions.
- **Field Sky Wash** (#f0f9ff) / **Field Blue** (#075985): Informational holdings ("Inventory in Field" KPI) and neutral method badges.

### Named Rules (optional, powerful)
**The One Ink Rule.** Black is the only action color on any screen. Emerald, amber, rose, and sky never act as brand — they report ledger state (collected, pending, void, informational) and nothing else.

## Typography

**Display Font:** Plus Jakarta Sans (with system-ui, -apple-system fallback)
**Body Font:** Plus Jakarta Sans (with system-ui, -apple-system fallback)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, monospace fallback)

**Character:** Businesslike and tabular. Jakarta carries headings and UI at tight tracking; JetBrains Mono carries every figure that must align — amounts, GSTINs, invoice numbers, dates, badge states.

### Hierarchy
- **Display** (bold 700, 20px / `text-xl`, 1.25, tracking-tight -0.025em): Page titles only ("Billing Wizard", company legal name on print). Uppercase only on the printed company name.
- **Title** (bold 700, 12px / `text-xs`, 1.33, +0.05em tracking, uppercase): Card section heads ("RECENT INVOICES", "BANK REMITTANCE DETAILS"). Always with a neutral icon at 16px.
- **Body** (regular 400, 12–14px / `text-xs`–`text-sm`, 1.5): Table cells, form labels (semibold 600 for the label itself), helper copy at 11px muted.
- **Label** (mono medium 500, 11px, 1.45, uppercase for section eyebrows at 10px): Invoice numbers, amounts in tables, GST/state codes, badges, timestamps. Amounts step up to 20–24px bold mono (`text-2xl`) on KPI cards only.

### Named Rules (optional)
**The Tabular Figures Rule.** Any number the owner reconciles — totals, quantities, GSTINs, dates, references — is JetBrains Mono. Jakarta never renders a Grand Total.

## Layout

Sidebar-anchored back-office grid. A fixed dark sidebar (256px / `w-64`) holds six grouped nav sections (CORE, SALES & BILLING, MASTER DATA, INVENTORY LEDGER, ANALYTICS & COMPLIANCE, ADMINISTRATION); a white header (64px / `h-16`) holds business identity left and verify/reset/user actions right; the work area is a centered `max-w-7xl` column with 24px (`p-6`) padding on a wash canvas, scrolling vertically.

Density is high but grouped: a banner card (title + mono subtitle + actions) opens each view, KPI cards run 1-up → 2-up (`sm`) → 4-up (`lg`) with 16px gaps, and operational tables split 1-up → 2-up (`lg`) with 24px gaps. Billing uses a 12-column split (7/5 on `md`) for notes-vs-totals. Spacing rhythm is Tailwind 8/16/24 (gap-2/4/6, p-4/5/6). Tables are full-bleed inside cards with 12–16px cell padding, mono uppercase thead rows, and `divide-neutral-200` hairlines.

## Elevation & Depth

Flat by default. Depth is conveyed by tonal layering (white cards on wash, mist headers, line borders), not shadows. Resting surfaces carry at most a hairline shadow (`shadow-2xs`).

### Shadow Vocabulary (if applicable)
- **Resting card** (`box-shadow: 0 1px 2px rgba(0,0,0,0.05)` / `shadow-2xs`): KPI cards, banner cards, tables. Barely-there edge definition.
- **Print sheet** (`box-shadow: 0 1px 3px rgba(0,0,0,0.1)` / `shadow-sm`): The printable invoice container — the one surface allowed to feel like paper above the UI.
- **Overlay** (`box-shadow: 0 25px 50px rgba(0,0,0,0.25)` / `shadow-2xl` + `bg-black/60 backdrop-blur-xs`): Modal shell only. Nothing else in the app casts this deep.

### Named Rules (optional)
**The Flat-By-Default Rule.** Surfaces stay flat at rest. Shadow deepens only as a response to layering: card (2xs) → print sheet (sm) → modal (2xl). Hover never adds shadow; it shifts background (`hover:bg-neutral-50`).

## Shapes

Quietly rectangular with gently rounded operational corners (4px buttons/inputs/badges, 8px cards/modals). Borders do the form work: 1px `ledger-line` on every card, input, and table; a 2px ink rule (`border-neutral-900`) reserved for the print header and the grand-total double-rule. Sidebar active nav adds a 2px white left-bar (`border-l-2`) instead of a pill. No clipping, no large radii, no decorative geometry — the rectangle is the brand.

## Components

Restrained and ledger-like: high-contrast ink actions, white bordered secondaries, mono bordered badges, flat white cards.

### Buttons
- **Shape:** Gently rounded (4px / `rounded`).
- **Primary:** Counter Ink background (`bg-neutral-900`), white 12px semibold text, 6–10px vertical padding (`px-3 py-1.5`), hairline shadow. Hover deepens to ink-deep (`hover:bg-neutral-800`).
- **Hover / Focus:** Background shift only; inputs add a 1px ink focus ring (`focus:ring-1 focus:ring-neutral-900`). No lift, no shadow change.
- **Secondary / Ghost / Tertiary (if applicable):** White ground, ink text, 1px line border (`border-neutral-300`), hover to wash (`hover:bg-neutral-50`). Success variant is emerald-600 solid (`Finalize Invoice`); danger-ghost is rose-50 wash with rose-700 text and rose-200 border (`Cancel Invoice`).

### Chips (if used)
- **Style:** Mono 12px text, 1px border, wash-tinted ground (`Badge`: neutral `bg-neutral-100/border-neutral-300`, success `bg-emerald-50/border-emerald-200`, warning amber, danger rose, info sky).
- **State:** Status-mapped, never decorative — FINALIZED=success, DRAFT=warning, CANCELLED=danger, payment method=neutral.

### Cards / Containers
- **Corner Style:** Gently rounded (8px / `rounded-lg`).
- **Background:** Paper white; section headers in mist (`bg-neutral-50/60` with bottom hairline).
- **Shadow Strategy:** Resting `shadow-2xs`; see Elevation & Depth.
- **Border:** 1px ledger-line (`border-neutral-200`) always.
- **Internal Padding:** Banner 20px (`p-5`), KPI 16px (`p-4`), modal body 20–24px (`px-6 py-5`).

### Inputs / Fields
- **Style:** White ground, 1px line border (`border-neutral-300`), 4px radius, 12px Jakarta text; numeric/mono fields right-aligned (`text-right font-mono`).
- **Focus:** 1px ink ring (`focus:ring-1 focus:ring-neutral-900 focus:outline-none`); no glow, no color shift.
- **Error / Disabled:** Error surfaces as a rose wash banner with icon (`bg-rose-50 border-rose-200`), not an input glow; disabled primary drops to 40% opacity (`disabled:opacity-40`).

### Navigation
- Dark shell (`bg-neutral-900 text-neutral-300`), 10px mono uppercase section eyebrows in muted gray, 12px medium items with 16px Lucide icons. Default is muted with wash hover (`hover:bg-neutral-800/60 hover:text-white`); active is white semibold on `bg-neutral-800` with a 2px white left-bar and 16px icon in white. Mobile has no separate treatment (desktop-only back office); tables scroll horizontally (`overflow-x-auto`).

### Tables (signature pattern)
- Mono 11px uppercase thead on mist (`bg-neutral-50/80 text-neutral-600`), hairline dividers, Jakarta 12px semibold row titles with mono metadata below, right-aligned mono numerals, row hover to mist (`hover:bg-neutral-50/70`). Print tables switch to a 2px ink header rule with mist ground.

### Modal
- Centered overlay (`fixed inset-0 bg-black/60 backdrop-blur-xs`), white shell at 8px radius with line border and `shadow-2xl`, mist header (`bg-neutral-50/70`) with 16px semibold title + 12px muted subtitle, scrollable body, mist footer with right-aligned actions. Dismiss via X or Esc.

## Do's and Don'ts

Concrete guardrails grounded in the shipped implementation.

### Do:
- **Do** keep the shell achromatic — dark sidebar, white header, wash canvas — and let status color speak only in badges, KPIs, and money figures.
- **Do** set every reconcilable figure in JetBrains Mono, right-aligned in tables and totals.
- **Do** preserve print parity — invoices, challans, and ledgers render black-on-white with real bank/GST snapshots and a signatory footer.
- **Do** use the double ink rule for the Grand Total (`border-t-2 border-b-2 border-neutral-900`) exactly as shipped.

### Don't:
- **Don't** introduce a brand hue, gradient, or decorative illustration — the One Ink Rule forbids it.
- **Don't** add shadows on hover or colored focus glows — focus is a 1px ink ring, nothing more.
- **Don't** replace mono references (invoice numbers, GSTINs, challan IDs) with proportional type or truncate the audit trail they provide.
