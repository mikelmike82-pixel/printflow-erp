# PrintFlow ERP (Phase 1 — Demo)

A new ERP system combining standard business operations (customers, vendors,
inventory, sales, purchasing, invoicing, accounting, PDC tracking, reporting,
users/roles, audit trail, backup) with two purpose-built modules:

- **CRM** — leads, contact history, follow-up reminders, pipeline stages, and
  conversion into customers.
- **Printing (Production)** — print jobs tracked through Design → Proofing →
  Plate Setup → Printing → Finishing → Completed, linked to sales orders and
  raw material consumption. This is the production-tracking module for a
  printing business, the same role "production orders" played for box
  manufacturing in the reference ERP this project is modeled on.

**This is a Phase 1 demo.** There is no backend yet — all data is realistic
mock data held in memory (`js/data/mock-data.js`), so the UI/UX can be
reviewed and approved before any real Firebase project, quota, or credentials
are involved. Refreshing the page resets any changes made during the demo.

## Running it locally

No build step, no dependencies to install. Any static file server works,
for example:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly via `file://` will **not** work — browsers
block ES module imports from the filesystem, so it must be served over
http(s).

## Demo accounts

All Phase 1 accounts use the mock password `demo123`.

| Role                  | Email                      |
|------------------------|-----------------------------|
| Super Admin            | ahmed@printflow.demo        |
| Sales & CRM            | sara@printflow.demo         |
| Production / Printing  | bilal@printflow.demo        |
| Accounts               | nida@printflow.demo         |

Each role sees a different set of modules in the sidebar — see
`js/core/rbac.js` for the full permission matrix.

## Project structure

```
index.html              Single entry point / app shell markup
css/
  tokens.css             Design tokens — colors, spacing, type (the ONE accent color lives here)
  base.css                Reset + base element styles
  layout.css               App shell: login screen, sidebar, topbar, content area
  components.css            Reusable UI: buttons, cards, tables, badges, modals, forms, stepper
js/
  main.js                  Boot: login flow, sidebar rendering, router wiring
  core/
    auth.js                 Mock authentication (Phase 2: swapped for Firebase Auth)
    rbac.js                  Role → module permission matrix + nav structure
    router.js                 Minimal hash router
    store.js                   All data access — the seam that becomes Firestore in Phase 2
    format.js                   Currency/date formatting, local-date helpers (PKT-safe)
    ui.js                        Toasts, modals, confirm dialogs (with password re-entry)
  data/
    mock-data.js               Seed data for the Phase 1 demo
  modules/
    dashboard.js, crm.js, printing.js, customers.js, vendors.js,
    inventory.js, salesOrders.js, purchaseOrders.js, grn.js, dispatch.js,
    invoicing.js, ledger.js, pdc.js, reports.js, users.js, auditTrail.js,
    settings.js
```

Each file under `js/modules/` exports a `render(container, params)`
function that the router calls. There's no framework and no build step —
plain ES modules loaded natively by the browser — which keeps the codebase
easy to navigate without adding tooling this project doesn't need yet.

### Design decisions carried over from lessons learned

- Financial balances are **never floored at zero** (`Math.max(0, balance)`).
  A customer or vendor in credit shows a distinct "Credit" badge instead of
  a misleading `Rs 0`. See `getPartyBalance()` in `js/core/store.js`.
- The **Audit Trail is loaded on demand**, not live-listened — see
  `loadAuditLog()` in `store.js` and `js/modules/auditTrail.js`. This is the
  pattern that will carry over to Firestore in Phase 2 (no `onSnapshot` on a
  collection almost nobody opens).
- Dates are handled as **local calendar dates**, never parsed through UTC
  midnight — see `js/core/format.js`. This matters once real data crosses
  midnight in Pakistan Standard Time.
- Destructive/sensitive actions (deactivating a user, restoring a backup)
  go through `confirmAction({ requirePassword: true, ... })` in
  `js/core/ui.js`, which re-checks the current user's password before
  proceeding.
- One deliberate accent color, defined once in `css/tokens.css`. No
  per-module color assignment — status colors (`--success`, `--warning`,
  `--danger`) are reserved for actual semantic meaning.

## Phase 2 (not started yet)

Once this demo is approved, Phase 2 replaces the mock layer with real
Firebase: Authentication, Firestore, Storage, Hosting, and security rules
that require authentication. The module code in `js/modules/` is written
against `js/core/store.js` and `js/core/auth.js` specifically so that swap
happens in those two files (plus real security rules) without rewriting
every screen.
