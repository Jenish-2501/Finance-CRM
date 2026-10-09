# Modal focus regression — Test Plan

Bug report: clicking/typing in any modal input moves focus outside the text field, in every module.
Suspect: `src/components/common/Modal.tsx` focus effect deps `[isOpen, onClose]` — every call site
passes an inline `onClose` closure, so the effect (focus ✕ button + cleanup restoring background focus)
re-runs on EVERY parent render, i.e. on every keystroke.

## Scenarios
| # | Action | Expected |
|---|--------|----------|
| 1 | Open modal, focus text input, change its value (parent re-renders with new onClose identity) | `document.activeElement` stays the input |
| 2 | Type 5 chars sequentially (5 re-renders) | focus stays the input after each |
| 3 | Open modal | initial focus lands inside dialog (✕ button, `data-autofocus`) — existing behavior kept |
| 4 | Close modal | focus returns to the opener button — existing behavior kept |
| 5 | Press Escape | `onClose` called — existing behavior kept |
