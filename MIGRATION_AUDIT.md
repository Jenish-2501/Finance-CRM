# React → Electron Migration Audit

## 1. Executive Summary
The application is a standard React Single Page Application (SPA) currently running entirely in the browser. It heavily relies on client-side state management (`zustand`) with persistent storage (`localStorage`) to simulate a backend and database. This means the app acts as a local-first application right now. The migration to Electron is highly feasible and in many ways natural, but requires moving the data persistence layer out of the browser's `localStorage` into a robust local database (like SQLite) accessed via the Electron Main Process.

## 2. Current Application Architecture
*   **Browser UI:** React (v19)
*   **State Management:** Zustand (v5) with `persist` middleware.
*   **Persistence:** Browser `localStorage` (via Zustand).
*   **API / Services:** No external API or backend. All logic and "database" operations are handled client-side using Zustand stores.
*   **Backend:** None.
*   **Database:** Simulated using `localStorage` and seed data in `src/data/seedData.ts`.

Conceptual Structure:
Browser UI
↓
React
↓
State Management (Zustand)
↓
localStorage

## 3. Technology Stack
### Frontend
*   **React version:** 19.0.1
*   **TypeScript version:** 7.0.2
*   **UI framework:** React DOM
*   **CSS framework:** Tailwind CSS (v4)
*   **Component libraries:** None major (custom components).
*   **State management:** Zustand (v5)
*   **Routing:** Custom state-based routing in `App.tsx` (no `react-router`).
*   **Forms & Validation:** Custom implementations.
*   **Icons:** `lucide-react`
*   **Animation:** `motion` (framer-motion)

### Build System
*   **Bundler:** Vite (v8)
*   **Plugins:** `@vitejs/plugin-react`, `@tailwindcss/vite`
*   **Development command:** `npm run dev`
*   **Production build command:** `npm run build`

### Backend Communication
*   None. The app is entirely self-contained.

## 4. Repository Structure
```
.
├── .env.example
├── bun.lock
├── index.html
├── package.json
├── src/
│   ├── App.tsx          # Main routing & layout
│   ├── components/      # Reusable UI components
│   ├── data/            # Seed data (seedData.ts)
│   ├── index.css        # Tailwind entry
│   ├── main.tsx         # React entry & Error Boundary
│   ├── services/        # Service logic
│   ├── store/           # Zustand stores (accountingStore.ts)
│   ├── tests/           # Test suite
│   ├── types/           # TypeScript definitions (database.ts)
│   ├── utils/           # Helper functions
│   └── views/           # Page components
├── tsconfig.json
└── vite.config.ts
```

## 5. Browser API Audit

| API | Location | Electron Compatibility | Action |
| :--- | :--- | :--- | :--- |
| `localStorage` | `src/main.tsx` (clear), `src/store/accountingStore.ts` (Zustand persist) | Supported | **Modify:** Move critical data persistence to Main Process (SQLite) for reliability and capacity. |
| `window.print()` | `src/components/challan/DeliveryChallanPrintView.tsx`, `src/components/invoice/InvoicePrintView.tsx`, `src/views/CustomerLedgerView.tsx` | Supported (calls `webContents.print()`) | **Keep/Modify:** Can remain, but better handled via Main Process for silent printing or specific printer selection if required. |
| `window.location.reload()` | `src/main.tsx` (Error Boundary) | Supported | **Keep** |
| `window.addEventListener('keydown')` | `src/components/common/Modal.tsx` | Supported | **Keep** |
| `document.createElement('a')` | `src/views/ReportsView.tsx`, `src/views/CustomerLedgerView.tsx` (CSV download) | Supported | **Modify:** Replace with Electron `dialog.showSaveDialog` and Main Process file writing for better UX and reliability. |
| `document.getElementById('root')` | `src/main.tsx` | Supported | **Keep** |

## 6. Node/Electron Requirement Audit

*   **Local Database:** The application needs a real database to replace `localStorage`. `sqlite3` or `better-sqlite3` should be used in the Main Process.
*   **File System Access:** Exporting CSV reports currently uses the browser's download mechanism. In Electron, this should use `fs` module in the Main Process and native save dialogs.
*   **Printing:** The current `window.print()` can be enhanced using Electron's native printing capabilities for better control.

## 7. Authentication Audit
*   Authentication is currently simulated client-side (`currentUser` in Zustand store).
*   **Electron Implication:** This is safe in a local desktop app context, but true authentication (if a remote backend is added later) would require standard token management (secure storage like `keytar` or encrypted file).

## 8. Storage Audit
*   **Mechanism:** `localStorage` via Zustand `persist` middleware.
*   **Data stored:** Entire application state (users, settings, inventory, invoices, etc.).
*   **Migration Requirement:** High. `localStorage` has strict size limits (~5MB) and is not reliable for long-term critical business data. Must migrate to a robust local database (SQLite) in the Main Process.

## 9. Routing Audit
*   **Mechanism:** Custom state-based routing (`currentTab` in `App.tsx`).
*   **Electron Implication:** Perfectly compatible. Since there are no actual URLs or browser history manipulation, it avoids typical Electron routing issues with `file://` protocol.

## 10. Environment Variable Audit

| Variable | Purpose | Current Location | Sensitive? | Electron Strategy |
| :--- | :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | GenAI API | `.env.example` | Yes | Store in secure storage or prompt user. Main Process only. |
| `APP_URL` | URL ref | `.env.example` | No | Likely unused in desktop app. |

## 11. Dependency Compatibility Audit
*   **React, React DOM, Zustand, TailwindCSS, Vite, Motion, Lucide:** Electron-safe (A)
*   **@google/genai:** Node-compatible (C). Can be moved to Main Process if implemented.

## 12. Native Module Audit
*   Currently: None.
*   Future: Will likely need `better-sqlite3` which is a native module and requires Electron rebuilding (`electron-rebuild`).

## 13. Networking Audit
*   Currently: None. (No `fetch` or `axios` found for internal logic).
*   There's an unused `@google/genai` dependency, which might use networking if implemented.

## 14. File System Audit
*   **Current:** CSV exports use `document.createElement('a')` with a Blob URL.
*   **Potential Electron:**
    React → Preload API (`window.api.saveCSV`) → Electron Main Process → `dialog.showSaveDialog` → `fs.writeFileSync`.

## 15. UI/UX Compatibility Audit
*   The UI is entirely compatible. It's a responsive dashboard layout.
*   Print views (`DeliveryChallanPrintView.tsx`, `InvoicePrintView.tsx`) might need CSS adjustments (`@media print`) to work flawlessly with Electron's print-to-PDF or native printing.

## 16. Electron Architecture Proposal
```
electron/
├── main/
│   ├── main.ts              # App lifecycle, window creation
│   ├── database.ts          # SQLite connection and queries
│   └── ipcHandlers.ts       # Listeners for IPC calls
├── preload/
│   └── preload.ts           # Exposes safe APIs (db queries, file saving) to window.api
└── renderer/
    └── (existing src/ code)
```

## 17. IPC Requirements

| Feature | Renderer Need | Main Process Responsibility | IPC Required |
| :--- | :--- | :--- | :--- |
| **Database Read** | Fetch data on load/action | Execute SELECT query | `api.db.query(...)` |
| **Database Write** | Save new data | Execute INSERT/UPDATE | `api.db.execute(...)` |
| **Export Report** | Save CSV file | Open save dialog, write file | `api.fs.saveReport(data)` |
| **Print Invoice** | Print specific content | Handle silent printing/PDF | `api.print.invoice(html)` |

## 18. Offline/Desktop Capability Analysis
*   The application is inherently offline and local.
*   Desktop features like system tray or auto-start are optional but not currently required for parity.

## 19. Build & Packaging Analysis
*   Recommended: **Electron Forge** with Vite integration. It's the modern standard and works well with existing Vite projects.
*   Will need configurations for Windows (Squirrel/NSIS), macOS (dmg), and Linux (deb/AppImage).

## 20. Deployment & Update Strategy
*   **Model B:** Desktop application contains local backend (SQLite).
*   Updates should be handled via Electron's built-in `autoUpdater` pointing to a release server (e.g., GitHub Releases).

## 21. Testing Analysis
*   Existing tests in `src/tests/testSuite.ts` (appears to be a custom implementation).
*   Need new tests for IPC communication and Main Process database logic (using Jest/Vitest).

## 22. Performance Risks
*   Storing massive amounts of data in `localStorage` is a ticking time bomb.
*   Migrating to SQLite will significantly improve performance for large datasets.

## 23. Security Audit
*   **Informational:** Currently, data is unencrypted in `localStorage`.
*   Moving to Electron requires strictly enforcing `contextIsolation: true` and `nodeIntegration: false`. Database access must be strictly through Preload API.

## 24. Migration Complexity Matrix

| Module | Complexity | Reason | Migration Action |
| :--- | :--- | :--- | :--- |
| UI / Components | 🟢 LOW | Standard React | Keep |
| State Management | 🔴 HIGH | Relies on `localStorage` | Replace Zustand persist with async IPC calls to SQLite |
| Routing | 🟢 LOW | Custom state-based | Keep |
| File Export | 🟡 MEDIUM | Uses browser DOM APIs | Replace with Electron native save dialog |

## 25. Migration Blockers
*   **Data Persistence:** The current reliance on synchronous `localStorage` via Zustand `persist` is the biggest architectural blocker. A desktop app needs a real database. This requires rewriting the store logic to use asynchronous IPC calls.

## 26. Proof-of-Concept Requirements
1.  Electron + Vite build setup.
2.  IPC communication between React and Main Process.
3.  SQLite integration in Main Process and CRUD operations via Preload.
4.  Replacing a single Zustand slice to use the new SQLite backend.

## 27. Migration Invariants
*   The user interface and user flows must remain identical.
*   The custom routing mechanism (`currentTab` state) should not be changed.
*   The core business logic and calculations must be preserved.

## 28. Recommended Migration Workstreams
1.  **Electron Foundation:** Setup Electron Forge with Vite.
2.  **Database Architecture:** Implement SQLite in Main Process and Preload APIs.
3.  **State Migration:** Refactor Zustand store to use async IPC instead of `localStorage`.
4.  **Feature Migration:** Refactor CSV exports and printing to use Electron native APIs.
5.  **Packaging:** Configure packaging for target OS.

## 29. Dependency Graph
Vite -> React -> Zustand -> LocalStorage (Current)
Electron Main -> SQLite (Future)
Electron Preload -> IPC -> Zustand -> React (Future)

## 30. Recommended Migration Sequence
Same as Workstreams.

## 31. Open Questions
*   Does the client have existing data in their browser `localStorage` that needs to be migrated to the new SQLite database during the first launch?
*   Is the `@google/genai` package intended to be used, and if so, how should API keys be managed?

## 32. Final Migration Readiness Assessment

# Migration Readiness Summary

| Area | Status | Risk | Requires POC? |
| :--- | :--- | :--- | :--- |
| React Renderer | Ready | Low | No |
| Routing | Ready | Low | No |
| Authentication | Simulated | Low | No |
| API | N/A | Low | No |
| Storage | Needs Rewrite | High | Yes |
| Browser APIs | Needs Minor Fixes | Medium | No |
| File System | Needs Electron APIs | Medium | No |
| Native Dependencies | Needs SQLite | Medium | Yes |
| IPC | Needs Implementation | High | Yes |
| Security | Standard Electron | Medium | No |
| Packaging | Needs Implementation | Medium | No |
| Testing | Needs Update | Low | No |

## Top 10 Migration Risks
1.  Data loss or corruption during the transition from `localStorage` to SQLite.
2.  Performance bottlenecks if synchronous Zustand state is poorly adapted to asynchronous IPC calls.
3.  Native module compilation issues with `better-sqlite3` across different platforms.

## Top 10 Items to Validate Before Implementation
1.  Feasibility of replacing Zustand `persist` with a custom async SQLite-backed storage engine.
2.  Electron Forge integration with the existing Vite setup.

## Recommended Next Step
The next step should be to create a **detailed, sequential migration implementation plan based strictly on this audit**. This plan should focus heavily on the state management rewrite to support SQLite.
