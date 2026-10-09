# Modal focus regression — Report

Date: 2026-10-09. Status: GREEN (3/3). Harness: jsdom + @testing-library/react (dev-only).

## Counts
- Typing keeps focus across 5 re-renders — failed pre-fix (activeElement became the ✕ button), passes now.
- Initial focus on open + focus-return/Escape on close — passed pre- and post-fix (behavior preserved).
- Regressions: `tsc` (incl. unused checks), all vitest files (50/50), `test:db`, `test:m1`, `test:m2` green.

## Fix
`src/components/common/Modal.tsx` only: effect deps `[isOpen, onClose]` → `[isOpen]` + open-transition
guard; `onClose` via ref. See BUG-005 in `docs/testing/BUGS_FOUND.md`.

## Commands
- `npx vitest run tests/modal-focus` or `npm run test:ui`
