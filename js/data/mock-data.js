// Seed data — this is a real deployment's starting point, not a demo
// dataset, so almost everything below starts empty. The one exception is
// a single default warehouse: there's no "add a warehouse" screen in this
// app (a small printing press operates from one location), so at least
// one has to exist for stock, GRN and Print Counter to have somewhere to
// put material. Company Details keeps its real values (set in Settings)
// rather than being wiped along with the rest.
import { todayLocalISO, parseLocalDate, localDateToISO } from "../core/format.js";

// Relative-date helper — kept for any future seed data that should always
// look "current" relative to today rather than drifting into the past.
function offsetDate(days) {
  const d = parseLocalDate(todayLocalISO());
  d.setDate(d.getDate() + days);
  return localDateToISO(d);
}

export const WAREHOUSES = [
  { id: "WH1", name: "Main Warehouse", location: "" },
];

// Raw materials (paper, ink, stickers, and everything else this shop
// consumes) — add these from the Stock section once the app is live.
export const PRODUCTS = [];

// GST status on customers drives whether Sales Tax applies to their
// invoices (see js/core/store.js computeTax helpers). "Registered"
// customers must carry a registration number; "Unregistered" ones don't.
export const CUSTOMERS = [];

// Sales-Tax status on vendors drives whether Sales Tax shows on their
// purchase bills (mirrors the customer-side GST flag above).
export const VENDORS = [];

// Printers / plotters — first-class entities for the Print Counter
// workflow. Different printer types support different materials —
// supportedCategories cross-references PRODUCTS' category field so the
// counter workflow can filter the material picker to what a given
// printer can actually run. windowsPrinterName links an ERP printer
// record to the real printer as Windows itself names it, so the Print
// Bridge agent can match an incoming real print job back to this record
// — filled in from the Printers screen with the exact name from Windows'
// own Printers & Scanners list.
export const PRINTERS = [];

// Company Details — the source of truth for invoice/letterhead branding
// and tax logic. This is the shop's real information, not demo data, so
// it isn't cleared — edit it directly from Settings if anything here
// needs to change.
export const COMPANY_DETAILS = {
  legalName: "Axe Printing Solutions (Private) Limited",
  tradingName: "Axe Printing Solutions",
  address: "Plot 12, Sector 7-C, SITE Industrial Area, Karachi, Sindh, Pakistan",
  phone: "021-32345678",
  email: "info@axeprinting.demo",
  website: "www.axeprinting.demo",
  ntn: "1234567-8",
  isGstRegistered: true,
  gstNumber: "12-34-5678-901-00",
  defaultTaxRate: 18, // Standard Pakistan Sales Tax rate — confirm with FBR registration once available
  currency: "PKR",
  logo: "assets/logo-full.png",
};

// Legacy sales-order / offset-press production pipeline — superseded by
// the Print Counter workflow, kept only as empty exports so nothing that
// still imports these shapes (none of the active modules do) breaks.
export const SALES_ORDERS = [];
export const PRINT_JOBS = [];
export const PRINT_JOB_STAGES = ["Design", "Proofing", "Plate Setup", "Printing", "Finishing", "Completed"];

// --- Print Counter (walk-up / operator-triggered printing + billing) ---
export const COUNTER_JOB_STATUSES = ["Pending", "Sent to Printer", "Printing", "Completed", "Failed", "Cancelled"];
export const PAYMENT_METHODS = ["Cash", "Bank Transfer", "Card", "Online", "Other"];
export const COUNTER_JOBS = [];

export const PURCHASE_ORDERS = [];
export const GRNS = [];
export const DISPATCHES = [];
export const INVOICES = [];

// Party ledgers — simplified running account per customer/vendor (the
// kind of ledger a small print shop actually keeps day to day), not a
// full double-entry general ledger. Balances are computed in store.js,
// never floored to zero — an overpayment must show as a credit, not "0".
export const LEDGER_ENTRIES = [];

export const PDCS = [];

// Audit log is intentionally NOT live — loaded on demand by the Audit
// Trail module, and would be paginated + auto-expired (e.g. 12 months)
// once this runs on real Firestore, to avoid paying for reads/storage on
// a collection almost nobody opens day to day.
export const AUDIT_LOG = [];
