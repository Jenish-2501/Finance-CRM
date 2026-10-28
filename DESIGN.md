---
name: AccuLedger
description: Offline-first GST billing, stock, and receivables ledger for a single Indian business.
colors:
  primary: "oklch(0.4865 0.2423 291.8661)"
  primary-foreground: "oklch(0.9838 0.0035 247.8583)"
  background: "oklch(0.9838 0.0035 247.8583)"
  foreground: "oklch(0.1284 0.0267 261.5937)"
  card: "oklch(1.0000 0 0)"
  muted: "oklch(0.9679 0.0027 264.5424)"
  muted-foreground: "oklch(0.5503 0.0235 264.3620)"
  border: "oklch(0.9278 0.0058 264.5314)"
  ring: "oklch(0.4865 0.2423 291.8661)"
  destructive: "oklch(0.6356 0.2082 25.3782)"
  sidebar: "oklch(1.0000 0 0)"
  sidebar-accent: "oklch(0.9486 0.0085 303.5068)"
  dark-background: "oklch(0.1091 0.0091 301.6956)"
  dark-foreground: "oklch(0.9838 0.0035 247.8583)"
  dark-card: "oklch(0.1376 0.0118 301.0607)"
  dark-primary: "oklch(0.6083 0.2172 297.1153)"
  dark-sidebar: "oklch(0.1249 0.0104 301.6956)"
  signal-emerald: "#047857"
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
    letterSpacing: "-0.02em"
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
    letterSpacing: "-0.02em"
  label:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "normal"
rounded:
  sm: "12px"
  md: "14px"
  lg: "16px"
  xl: "20px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "6px 14px"
  button-primary-hover:
    backgroundColor: "{colors.primary} / 90%"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "6px 14px"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-success:
    backgroundColor: "{colors.signal-emerald}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  input-default:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  card-default:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "16px 20px"
theme:
  source: "src/index.css (@import tailwindcss + @theme inline)"
  modes: ["light", "dark (.dark class via ThemeProvider, persisted to localStorage)"]
  primitives: "src/components/ui (Button, Card, PageHeader, KpiCard, Input, Table, Badge, Alert, Tabs, Toolbar, AppShell, ThemeToggle)"
  print-frozen: "CustomerLedgerView .print-container + utils/pdfDocuments.ts stay black-on-white; InvoicePrintView / DeliveryChallanPrintView preview the jsPDF document itself via common/PdfPreview (iframe), so the PDF is the single source of truth"
---

# Design System: AccuLedger

## Overview

**Creative North Star: "The Violet Ledger"**

AccuLedger keeps the discipline of a well-kept billing counter — dense, exact, tabular — but now speaks in violet. The interface is a light lavender-gray canvas (`background`) with white/violet-tinted cards, violet primary actions, and a full dark mode for late-night reconciliation. Color still reports ledger state (collected, outstanding, void, informational) and nothing else; violet never replaces a money-state color.

The voice is owner-readable clarity. A Surat shop owner doing their own GST billing sees plain section titles ("Billing Wizard", "Available Unbilled Dispatch Movements"), visible grand totals, and mono GSTIN/state-code context wherever tax math depends on it. Paper-trail parity is visual: invoices, challans, and ledgers render black-on-white and survive printing unchanged in both themes.

**Key Characteristics:**
- Violet primary (`oklch(0.4865 0.2423 291.8661)`) for actions, active nav, and brand marks.
- Light + dark themes from a single token file (`src/index.css`); components consume tokens only.
- Tabular mono numerals for every amount, date, GSTIN, and reference ID.
- Soft geometry (`--radius: 1rem` scale) with violet-glow shadows; depth grows with layering.
- Dense operational tables with uppercase mono section labels.
- Centralized primitives in `src/components/ui` — views never hardcode theme colors.

## Colors

Violet brand + neutral surfaces + status-only signals.

### Primary
- **Violet** (`--primary` / `bg-primary`): Primary buttons ("Bill Customer Inventory", "Generate & Save Invoice"), active sidebar items, brand marks, focus rings (`--ring`). Hover dims to `bg-primary/90`.
- **Primary Foreground** (`--primary-foreground` / `text-primary-foreground`): Text on violet. Near-white in light, near-black in dark.

### Neutral (theme-aware)
- **Background** (`--background` / `bg-background`): App canvas. Light lavender-gray; deep violet-black in dark.
- **Card** (`--card` / `bg-card`): Cards, modals, inputs, table shells. White in light; raised violet-gray in dark.
- **Muted** (`--muted` / `bg-muted`): Card section headers, wells, hover fills, bill-to snapshot panel.
- **Muted Foreground** (`--muted-foreground` / `text-muted-foreground`): Secondary labels, helper copy, table metadata.
- **Border / Input** (`--border` / `--input` / `border-border`): Every card border, table divider, input edge.
- **Sidebar** (`--sidebar`, `--sidebar-accent`, `--sidebar-border`): Light shell in light mode, dark shell in dark mode. Active nav is `bg-sidebar-accent text-sidebar-accent-foreground` with a 2px `border-sidebar-primary` left-bar.

### Status (never violet; dark-safe pairs)
- **Success Emerald** (`bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/25`): Money-in states — collections KPI, FINALIZED badges, "Finalize Invoice".
- **Warning Amber** (`bg-amber-500/10 text-amber-800 dark:text-amber-300`): DRAFT badges, outstanding-receivables KPI, remaining-balance hints.
- **Destructive** (`--destructive` / `bg-destructive/10 text-destructive border-destructive/25`): CANCELLED badges, errors, "Cancel Invoice" / "Confirm Reset". Replaces the old rose-600 buttons 1:1.
- **Info Sky / Chart-2** (`bg-chart-2/10 text-sky-800 dark:text-sky-300`): Informational holdings ("Inventory in Field" KPI) and neutral method badges.

### Named Rules
**The One Violet Rule.** Violet is the only action color on any screen. Emerald, amber, destructive, and sky never act as brand — they report ledger state (collected, pending, void, informational) and nothing else.
**The Print Freeze Rule.** `.print-container` interiors and `utils/pdfDocuments.ts` stay black-on-white in both themes. Never apply `bg-primary` inside a legal document.

## Typography

**Display Font:** Plus Jakarta Sans (self-hosted `400–700`, offline-first, set on `body`)
**Body Font:** Plus Jakarta Sans
**Label/Mono Font:** JetBrains Mono (self-hosted `400–600`)

**Character:** Businesslike and tabular. Jakarta carries headings and UI at `-0.02em` tracking; JetBrains Mono carries every figure that must align — amounts, GSTINs, invoice numbers, dates, badge states.

### Hierarchy
- **Display** (bold 700, 20px / `text-xl`, 1.25, tracking-tight): Page titles only ("Billing Wizard", company legal name on print). Uppercase only on the printed company name.
- **Title** (bold 700, 12px / `text-xs`, 1.33, +0.05em tracking, uppercase): Card section heads ("RECENT INVOICES", "BANK REMITTANCE DETAILS"). Always with a neutral icon at 16px.
- **Body** (regular 400, 12–14px / `text-xs`–`text-sm`, 1.5): Table cells, form labels (semibold 600 for the label itself), helper copy at 11px muted.
- **Label** (mono medium 500, 11px, 1.45, uppercase for section eyebrows at 10px): Invoice numbers, amounts in tables, GST/state codes, badges, timestamps. Amounts step up to 20–24px bold mono (`text-2xl`) on KPI cards only.

### Named Rules
**The Tabular Figures Rule.** Any number the owner reconciles — totals, quantities, GSTINs, dates, references — is JetBrains Mono. Jakarta never renders a Grand Total.

## Layout

Sidebar-anchored back-office grid (`src/components/ui/AppShell.tsx`). A themed sidebar (256px / `w-64`) holds six grouped nav sections (CORE, SALES & BILLING, MASTER DATA, INVENTORY LEDGER, ANALYTICS & COMPLIANCE, ADMINISTRATION); a card-surface header (64px / `h-16`) holds business identity left and theme toggle, verify/reset/user actions right; the work area is a centered `max-w-7xl` column with 24px (`p-6`) padding on the background canvas, scrolling vertically.

Density is high but grouped: a `PageHeader` banner card (title + mono subtitle + actions) opens each view, `KpiCard`s run 1-up → 2-up (`sm`) → 4-up (`lg`) with 16px gaps, and operational tables split 1-up → 2-up (`lg`) with 24px gaps. Billing uses a 12-column split (7/5 on `md`) for notes-vs-totals. Spacing rhythm is Tailwind 8/16/24 (gap-2/4/6, p-4/5/6). Tables are full-bleed inside `TableShell` with 12–16px cell padding, mono uppercase `THead` rows, and `divide-border` hairlines.

## Elevation & Depth

Soft violet glow in light, deep neutral shadow in dark. Depth grows with layering: card → print sheet → modal.

### Shadow Vocabulary
- **Resting card** (`shadow-xs`): KPI cards, banner cards, tables. Violet glow at 4–8% opacity.
- **Print sheet** (`shadow-sm`): The printable invoice container — the one surface allowed to feel like paper above the UI.
- **Overlay** (`shadow-2xl` + `bg-black/60 backdrop-blur-xs`): `Modal` shell only. Nothing else casts this deep.

### Named Rules
**The Flat-By-Default Rule.** Surfaces stay near-flat at rest. Hover never adds shadow; it shifts background (`hover:bg-muted`).

## Shapes

Softly rounded operational corners from the `--radius: 1rem` scale (`rounded-md` 14px buttons/inputs, `rounded-lg` 16px cards/modals). Radius decision (Oct 2026): the theme's `1rem` was kept verbatim — density is preserved via unchanged cell padding and gaps, not via smaller corners. Borders do the form work: 1px `border-border` on every card, input, and table; a 2px `border-foreground` rule reserved for the totals emphasis and print header. Sidebar active nav adds a 2px `border-sidebar-primary` left-bar. No clipping, no decorative geometry.

## Components

All centralized in `src/components/ui` and re-exported from `src/components/ui/index.ts`. Views compose these; they never hardcode theme colors.

### Buttons (`Button`: primary | secondary | destructive | success | success-outline | destructive-outline | ghost | icon-ghost)
- **Shape:** `rounded-md`.
- **Primary:** `bg-primary text-primary-foreground`, semibold, `shadow-xs`. Hover `bg-primary/90`.
- **Hover / Focus:** Background shift only; focus is `focus-visible:outline-ring`. No lift, no shadow change.
- **Secondary:** `bg-card text-foreground border-border`, hover `bg-muted`. Success is emerald-600 solid (`Finalize Invoice`); destructive-outline is `bg-destructive/10 text-destructive border-destructive/25` (`Cancel Invoice`).

### Chips (`Badge`: neutral | success | warning | danger | info)
- **Style:** Mono 12px text, 1px border; neutral maps to `bg-secondary text-secondary-foreground`, others to dark-safe semantic tints.
- **State:** Status-mapped, never decorative — FINALIZED=success, DRAFT=warning, CANCELLED=danger, payment method=neutral.

### Cards / Containers (`Card`, `CardHeader`, `CardTitle`, `CardBody`, `CardFooter`, `PageHeader`, `KpiCard`, `Well`)
- **Corner Style:** `rounded-lg`.
- **Background:** `bg-card`; section headers `bg-muted/60` with bottom hairline.
- **Internal Padding:** Banner 20px (`p-5`), KPI 16px (`p-4`), modal body 20–24px (`px-6 py-5`).

### Inputs / Fields (`Input`, `Select`, `Textarea`, `Label`, `FieldError`, `SearchInput`)
- **Style:** `bg-card`, 1px `border-input`, `rounded-md`, 12px Jakarta text; numeric/mono fields right-aligned (`text-right font-mono`).
- **Focus:** `focus:ring-1 focus:ring-ring`; no glow, no color shift.
- **Error / Disabled:** Rose/destructive wash `Alert` banner with icon, not an input glow; disabled drops to 40% opacity.

### Navigation (`Sidebar`, `Header`, `Tabs`)
- Themed shell (`bg-sidebar text-sidebar-foreground`), 10px mono uppercase section eyebrows, 12px medium items with 16px Lucide icons. Active is semibold on `bg-sidebar-accent` with a 2px `border-sidebar-primary` left-bar. Underline `Tabs` primitive (with arrow-key nav) serves Company/Customer inventory, Reports, and the customer drawer. Tables scroll horizontally (`overflow-x-auto`).

### Tables (`TableShell`, `Table`, `THead`, `TR`, `TH`, `TD`, `EmptyState`)
- Mono 11px uppercase `THead` on `bg-muted/80`, hairline dividers, semibold row titles with mono metadata below, right-aligned mono numerals, row hover `bg-muted/50`. Print tables stay black-on-white with a 2px ink header rule.

### Modal + Toolbar + Alert
- `Modal`: centered overlay (`fixed inset-0 bg-black/60 backdrop-blur-xs`), `bg-popover` shell at `rounded-lg` with `shadow-2xl`, `bg-muted/70` header, scrollable body, `bg-muted` footer with right-aligned actions. Dismiss via X or Esc.
- `Toolbar`: `no-print` action bar for invoice/challan (`bg-muted border-input`).
- `Alert` (success | destructive | info | warning | neutral): banners for verify results, form errors, restore states.

## Dark Mode

Single class strategy: `ThemeProvider` toggles `.dark` on `documentElement` (persisted to `localStorage`, OS-preference default), Tailwind's `@custom-variant dark (&:is(.dark *))` flips every token. Toggle lives in `Header` and `AppSettingsView → Appearance`. Every semantic color carries its `dark:` pair (emerald-300, amber-300, sky-300); destructive is identical in both themes. `.print-container` is force-lit in dark via a `.dark .print-container` override so legal documents never go dark.

## Do's and Don'ts

### Do:
- **Do** compose `src/components/ui` primitives and theme tokens (`bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`) — never hardcode `neutral-*`/hex in views.
- **Do** keep the next theme upgrade to `src/index.css` only.
- **Do** set every reconcilable figure in JetBrains Mono, right-aligned in tables and totals.
- **Do** preserve print parity — invoices, challans, and ledgers render black-on-white with real bank/GST snapshots and a signatory footer, in both themes.
- **Do** keep money-state colors semantic and dark-safe; add the `dark:` pair whenever a new tint is introduced.

### Don't:
- **Don't** introduce a second brand hue, gradient, or decorative illustration — the One Violet Rule forbids it.
- **Don't** add shadows on hover or colored focus glows — focus is the `ring` token, nothing more.
- **Don't** put `bg-primary` (or any theme surface) inside `.print-container` or `pdfDocuments.ts`.
- **Don't** replace mono references (invoice numbers, GSTINs, challan IDs) with proportional type or truncate the audit trail they provide.
