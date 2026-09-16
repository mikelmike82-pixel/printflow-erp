# Axe Printing Solutions — ERP (Phase 1 — Demo)

A walk-up print-shop counter system, not a general manufacturing ERP: a
customer brings (or asks for) a design, it's printed on the spot, billed,
and the paper/board/stickers/ink it took come out of stock automatically.
Everything in this app exists in service of that one workflow:

- **Print Counter** — the core screen. Customer → printer → what they're
  buying (billed) → material used (deducted from stock, not billed) →
  payment → bill, all in one guided step. Wired to the Print Bridge
  (`windows-print-bridge/`) so printing from CorelDRAW/Word/etc. on a
  connected computer opens this screen automatically with the job already
  identified, and confirming here actually releases the real print.
- **Vendors → Purchase Orders → GRN** — the only path stock comes in on. A
  PO credits the vendor's account immediately; receiving it (GRN) is what
  actually adds the stock.
- **Bills, Customers, Vendors** — every bill prints itself the moment a job
  is confirmed (and can be reprinted any time from the Bills page); each
  customer/vendor page shows a running account statement and balance, with
  a "Record Payment" action.
- **Reports** — sales by customer, sales by printer, GST/Sales Tax
  breakdown, and customer/vendor balances.

**This is a Phase 1 demo.** There is no backend yet — all data is realistic
mock data held in memory (`js/data/mock-data.js`), so the UI/UX can be
reviewed and approved before any real Firebase project, quota, or credentials
are involved. Refreshing the page resets any changes made during the demo.

## Running it locally

No build step, no dependencies to install — just Python (already on the
machine if the Print Bridge is installed). From this folder:

```bash
python3 serve.py
# then open http://localhost:8000
```

On Windows, double-clicking `Start-ERP.bat` does the same thing and opens
the browser for you. Either way, **use `serve.py`, not the plain
`python -m http.server`** — it's the same server with one addition
(`Cache-Control: no-cache` on every response) so that when this app gets
updated, the next normal reload always picks up the change instead of the
browser silently reusing an old cached copy of a JS file.

Opening `index.html` directly via `file://` will **not** work — browsers
block ES module imports from the filesystem, so it must be served over
http(s).

## Demo accounts

All Phase 1 accounts use the mock password `demo123`.

| Role                  | Email                      |
|------------------------|-----------------------------|
| Super Admin            | ahmed@axeprinting.demo      |
| Sales                  | sara@axeprinting.demo       |
| Production / Printing  | bilal@axeprinting.demo      |
| Accounts               | nida@axeprinting.demo       |

Each role sees a different set of modules in the sidebar — see
`js/core/rbac.js` for the full permission matrix.

## Project structure

```
index.html              Single entry point / app shell markup
serve.py                 Local dev server (Cache-Control: no-cache — see "Running it locally")
Start-ERP.bat            Windows double-click launcher for serve.py
css/
  tokens.css             Design tokens — colors, spacing, type (the ONE accent color lives here)
  base.css                Reset + base element styles
  layout.css               App shell: login screen, sidebar, topbar, content area
  components.css            Reusable UI: buttons, cards, tables, badges, modals, forms, stepper
manifest.json            Minimal web app manifest (icons added once the real logo is in)
js/
  main.js                  Boot: login flow, sidebar rendering, router wiring
  core/
    auth.js                 Mock authentication (Phase 2: swapped for Firebase Auth)
    rbac.js                  Role → module permission matrix + nav structure
    router.js                 Minimal hash router
    store.js                   All data access — the seam that becomes Firestore in Phase 2
    format.js                   Currency/date formatting, local-date helpers (PKT-safe)
    ui.js                        Toasts, modals, confirm dialogs (with password re-entry)
    printBill.js                 Printable bill/receipt — opens its own window and calls print()
  data/
    mock-data.js               Seed data for the Phase 1 demo
  modules/
    dashboard.js, printCounter.js, printers.js, customers.js, vendors.js,
    inventory.js, purchaseOrders.js, grn.js, invoicing.js, reports.js,
    users.js, auditTrail.js, settings.js
windows-print-bridge/    Windows-side helper — see its own README.md
```

### GST / Sales Tax classification

- **Customers** carry a `gstStatus` (`Registered` / `Unregistered`) and, when
  registered, a `gstNumber` — set from the New/Edit Customer form. This
  drives the tax breakdown shown on their invoices.
- **Vendors** carry the equivalent `salesTaxStatus` / `salesTaxNumber` pair,
  driving the tax breakdown shown on purchase orders/bills.
- **Company Details** (Settings, Super Admin only) is the single source of
  truth for the company's own registration status and `defaultTaxRate` — tax
  logic (`computeInvoiceTax` / `computePurchaseOrderTax` in
  `js/core/store.js`) always reads from this record rather than a hardcoded
  rate. Reports includes a GST/Sales Tax breakdown by registration status.
- All values shipped in this demo (rates, NTN, registration numbers) are
  **reasonable placeholder assumptions** — update them once the business
  owner provides the real figures.

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

## Offline Support

Phase 1 does **not** cache the app shell for offline use — this app runs
on one shop-counter machine against its own `localhost` server, so there's
always a connection between the browser and the page it's loading, and an
earlier attempt at an offline-capable service worker turned out to cost
more than it was worth: a stale copy left over from before an update could
keep serving old JS against the current login flow, which looked exactly
like a broken login ("sign in, and it just shows the login screen again")
until the tab was hard-refreshed. `serve.py`'s `Cache-Control: no-cache`
(see "Running it locally" above) solves the same underlying problem — a
normal reload always gets the current files — without a service worker's
failure mode.

**Coming in Phase 2 (needs the real Firebase SDK, not applicable to the
Phase 1 mock):**

- **Firestore offline persistence** — enabling Firestore's local persistent
  cache (`persistentLocalCache` in the modular SDK) so that once a user has
  loaded their data at least once, they can keep viewing it — and, depending
  on what we decide per screen, queue changes — without a connection,
  syncing automatically once they're back online.
- **Firebase Auth persisted sessions** (`setPersistence` with
  `browserLocalPersistence`) so an already-logged-in user isn't logged out
  just because they went offline or closed and reopened the app.
- One thing worth deciding deliberately once we're there: with 3–5 staff
  potentially editing the same record while offline at different times, we
  should pick, per data type, whether "last write wins" on reconnect is
  fine (most operational data) or whether a handful of sensitive records
  (financial entries especially) need an explicit conflict warning instead
  of a silent overwrite.

## Phase 2 (not started yet)

Once this demo is approved, Phase 2 replaces the mock layer with real
Firebase: Authentication, Firestore, Storage, Hosting, and security rules
that require authentication. The module code in `js/modules/` is written
against `js/core/store.js` and `js/core/auth.js` specifically so that swap
happens in those two files (plus real security rules) without rewriting
every screen.
