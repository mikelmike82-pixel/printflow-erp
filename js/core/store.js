// Central in-memory data store for the Phase 1 demo.
//
// Every module reads/writes through here rather than importing
// js/data/mock-data.js directly. In Phase 2 the bodies of these
// functions get swapped for Firestore calls (onSnapshot for the handful
// of collections that genuinely need live updates, getDocs/getDoc for
// the rest) — the module code calling getCustomers(), addLead(), etc.
// should not need to change.
import * as seed from "../data/mock-data.js";
import { getCurrentUser } from "./auth.js";
import { todayLocalISO, daysBetween } from "./format.js";

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

// Persisted to this browser's localStorage so data survives a page reload
// AND a brand new tab — both of which used to start from a completely
// fresh, empty (or seed) copy every time, since `db` previously only ever
// lived in memory for the current page load. That was invisible while
// mock-data.js still had seed customers/printers/products to fall back
// on, but became a real, blocking bug the moment real data lives ONLY in
// whatever the admin has typed in: the Print Bridge agent opens the New
// Print Job screen in a NEW browser tab for every detected job, and a
// printer or material added in one tab was invisible in that new one,
// making "Add a printer/material first" fire even though one clearly
// existed. Loading from (and saving to) localStorage instead of always
// re-seeding fixes that, and also means a plain browser refresh no longer
// wipes out real work — still not a substitute for a real backend/backup
// (Phase 2's Firestore), but it's what makes this usable day to day now.
const STORE_KEY = "axeprinting_store_v1";

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.db) return null;
    return parsed;
  } catch {
    return null;
  }
}

const persisted = loadPersisted();

const db = persisted ? persisted.db : {
  warehouses: clone(seed.WAREHOUSES),
  products: clone(seed.PRODUCTS),
  customers: clone(seed.CUSTOMERS),
  vendors: clone(seed.VENDORS),
  printers: clone(seed.PRINTERS),
  salesOrders: clone(seed.SALES_ORDERS),
  printJobs: clone(seed.PRINT_JOBS),
  counterJobs: clone(seed.COUNTER_JOBS),
  purchaseOrders: clone(seed.PURCHASE_ORDERS),
  grns: clone(seed.GRNS),
  dispatches: clone(seed.DISPATCHES),
  invoices: clone(seed.INVOICES),
  ledgerEntries: clone(seed.LEDGER_ENTRIES),
  pdcs: clone(seed.PDCS),
  companyDetails: clone(seed.COMPANY_DETAILS),
  auditLog: null, // deliberately not loaded until Audit Trail is opened
};

// Backfill receivedQty on every PO line from the seed GRNs already on
// record, so partial-receiving math (poRemainingQty / computePoStatus)
// is correct from the very first load. Only needed on a fresh seed load —
// persisted data already has correct receivedQty baked in, and replaying
// every GRN again on top of that would double-count it.
if (!persisted) {
  db.purchaseOrders.forEach((po) => {
    po.items.forEach((i) => { if (i.receivedQty === undefined) i.receivedQty = 0; });
  });
  db.grns.forEach((grn) => {
    const po = db.purchaseOrders.find((p) => p.id === grn.poId);
    if (!po) return;
    grn.items.forEach((line) => {
      const poItem = po.items.find((i) => i.productId === line.productId);
      if (poItem) poItem.receivedQty += line.qty;
    });
  });
}

let idCounter = persisted ? persisted.idCounter : 1000;
export function nextId(prefix) {
  idCounter += 1;
  return `${prefix}${idCounter}`;
}

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ db, idCounter })); } catch {}
}

// A periodic + lifecycle-driven autosave, rather than a persist() call
// added to each of the ~35 functions that mutate `db` — one central place
// that can't accidentally be missed when a new mutator is added later.
// The window between a change and the next tick is at most a second,
// which is a non-issue for anything paced by an actual person clicking
// through a form; `beforeunload`/`visibilitychange` catch a tab closing
// or backgrounding in between ticks.
setInterval(persist, 1000);
window.addEventListener("beforeunload", persist);
document.addEventListener("visibilitychange", () => { if (document.hidden) persist(); });

// --- Reference data -------------------------------------------------
export const getWarehouses = () => db.warehouses;
export const getProducts = () => db.products;
export const getProductById = (id) => db.products.find((p) => p.id === id);

// The raw-material catalog (paper, ink, stickers, whatever this shop
// actually stocks) starts empty on a real deployment — there's no seed
// data to fall back on, so this is the one place it gets defined. Every
// warehouse starts at 0 stock; the real quantity only shows up once a
// GRN is received against a purchase order for it.
export function addProduct(data) {
  const stock = {};
  db.warehouses.forEach((w) => { stock[w.id] = 0; });
  const record = { id: nextId("P"), reorderLevel: 0, ...data, stock };
  db.products.push(record);
  logAudit("Added material", "Stock", record.name);
  return record;
}

export function updateProduct(id, data) {
  const product = getProductById(id);
  if (!product) return null;
  Object.assign(product, data);
  logAudit("Updated material", "Stock", product.name);
  return product;
}

export function productDependents(id) {
  return {
    purchaseOrders: db.purchaseOrders.filter((po) => po.items.some((i) => i.productId === id)).length,
    grns: db.grns.filter((g) => g.items.some((i) => i.productId === id)).length,
    counterJobs: db.counterJobs.filter((j) => j.materials.some((m) => m.productId === id)).length,
  };
}

export function deleteProduct(id) {
  const product = getProductById(id);
  if (!product) return { ok: false, error: "Material not found." };
  const dep = productDependents(id);
  const total = dep.purchaseOrders + dep.grns + dep.counterJobs;
  if (total > 0) {
    return { ok: false, error: `Cannot delete — this material is used on ${dep.purchaseOrders} purchase order(s), ${dep.grns} GRN(s) and ${dep.counterJobs} print counter job(s).` };
  }
  db.products = db.products.filter((p) => p.id !== id);
  logAudit("Deleted material", "Stock", product.name);
  return { ok: true };
}

// --- Customers / Vendors ---------------------------------------------
export const getCustomers = () => db.customers;
export const getCustomerById = (id) => db.customers.find((c) => c.id === id);
export const getVendors = () => db.vendors;
export const getVendorById = (id) => db.vendors.find((v) => v.id === id);

export function addVendor(data) {
  const record = { id: nextId("V"), salesTaxStatus: "Unregistered", salesTaxNumber: "", ...data };
  db.vendors.push(record);
  logAudit("Added vendor", "Vendors", record.name);
  return record;
}

export function updateVendor(id, data) {
  const vendor = getVendorById(id);
  if (!vendor) return null;
  Object.assign(vendor, data);
  logAudit("Updated vendor", "Vendors", vendor.name);
  return vendor;
}

export function vendorDependents(id) {
  return {
    purchaseOrders: db.purchaseOrders.filter((p) => p.vendorId === id).length,
    ledgerEntries: db.ledgerEntries.filter((e) => e.partyType === "vendor" && e.partyId === id).length,
  };
}

export function deleteVendor(id) {
  const vendor = getVendorById(id);
  if (!vendor) return { ok: false, error: "Vendor not found." };
  const dep = vendorDependents(id);
  const total = dep.purchaseOrders + dep.ledgerEntries;
  if (total > 0) {
    return { ok: false, error: `Cannot delete — this vendor has ${dep.purchaseOrders} purchase order(s) and ${dep.ledgerEntries} ledger entr${dep.ledgerEntries === 1 ? "y" : "ies"} on record.` };
  }
  db.vendors = db.vendors.filter((v) => v.id !== id);
  logAudit("Deleted vendor", "Vendors", vendor.name);
  return { ok: true };
}

// --- Printers / Plotters ---------------------------------------------
export const getPrinters = () => db.printers;
export const getPrinterById = (id) => db.printers.find((p) => p.id === id);
export const getActivePrinters = () => db.printers.filter((p) => p.status === "Active");

// Matches a real Windows printer name (as reported by the Print Bridge
// agent when a real job comes in) back to the ERP's own printer record,
// so the New Print Job wizard can preselect it. Case-insensitive since
// Windows printer names are compared that way in practice.
export function findPrinterByWindowsName(windowsPrinterName) {
  if (!windowsPrinterName) return null;
  const needle = windowsPrinterName.trim().toLowerCase();
  return db.printers.find((p) => (p.windowsPrinterName || "").trim().toLowerCase() === needle) || null;
}

export function addPrinter(data) {
  const record = { id: nextId("PR"), status: "Active", supportedCategories: [], windowsPrinterName: "", ...data };
  db.printers.push(record);
  logAudit("Added printer", "Printers", record.name);
  return record;
}

export function updatePrinter(id, data) {
  const printer = getPrinterById(id);
  if (!printer) return null;
  Object.assign(printer, data);
  logAudit("Updated printer", "Printers", printer.name);
  return printer;
}

export function printerDependents(id) {
  return { counterJobs: db.counterJobs.filter((j) => j.printerId === id).length };
}

export function deletePrinter(id) {
  const printer = getPrinterById(id);
  if (!printer) return { ok: false, error: "Printer not found." };
  const dep = printerDependents(id);
  if (dep.counterJobs > 0) {
    return { ok: false, error: `Cannot delete — this printer has ${dep.counterJobs} print job(s) on record. Mark it Inactive instead.` };
  }
  db.printers = db.printers.filter((p) => p.id !== id);
  logAudit("Deleted printer", "Printers", printer.name);
  return { ok: true };
}

export function addCustomer(data) {
  const record = { id: nextId("C"), status: "Active", gstStatus: "Unregistered", gstNumber: "", ...data };
  db.customers.push(record);
  logAudit("Added customer", "Customers", record.name);
  return record;
}

export function updateCustomer(id, data) {
  const customer = getCustomerById(id);
  if (!customer) return null;
  Object.assign(customer, data);
  logAudit("Updated customer", "Customers", customer.name);
  return customer;
}

// Deleting a customer is blocked while dependent records exist, rather
// than silently orphaning sales orders / invoices / ledger history that
// point back at it — this mirrors the "never quietly break a reference"
// principle used throughout the app (e.g. balances never floored to 0).
export function customerDependents(id) {
  return {
    salesOrders: db.salesOrders.filter((s) => s.customerId === id).length,
    invoices: db.invoices.filter((i) => i.customerId === id).length,
    ledgerEntries: db.ledgerEntries.filter((e) => e.partyType === "customer" && e.partyId === id).length,
    counterJobs: db.counterJobs.filter((j) => j.customerId === id).length,
  };
}

export function deleteCustomer(id) {
  const customer = getCustomerById(id);
  if (!customer) return { ok: false, error: "Customer not found." };
  const dep = customerDependents(id);
  const total = dep.salesOrders + dep.invoices + dep.ledgerEntries + dep.counterJobs;
  if (total > 0) {
    return { ok: false, error: `Cannot delete — this customer has ${dep.salesOrders} sales order(s), ${dep.invoices} invoice(s), ${dep.counterJobs} print counter job(s) and ${dep.ledgerEntries} ledger entr${dep.ledgerEntries === 1 ? "y" : "ies"} on record.` };
  }
  db.customers = db.customers.filter((c) => c.id !== id);
  logAudit("Deleted customer", "Customers", customer.name);
  return { ok: true };
}

// Party balance from the ledger — NEVER floored at zero. A negative
// value means the party is in credit / has overpaid, and callers must
// label that distinctly rather than showing "Rs 0".
export function getPartyBalance(partyType, partyId) {
  return db.ledgerEntries
    .filter((e) => e.partyType === partyType && e.partyId === partyId)
    .reduce((sum, e) => sum + e.amount, 0);
}

export function getLedgerForParty(partyType, partyId) {
  return db.ledgerEntries
    .filter((e) => e.partyType === partyType && e.partyId === partyId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export const getAllLedgerEntries = () => db.ledgerEntries;

// --- Sales Orders --------------------------------------------------------
export const getSalesOrders = () => db.salesOrders;
export const getSalesOrderById = (id) => db.salesOrders.find((s) => s.id === id);

export function addSalesOrder(data) {
  const total = data.items.reduce((s, i) => s + i.qty * i.rate, 0);
  const record = { id: nextId("SO"), orderNo: `SO-${1000 + db.salesOrders.length + 1}`, date: todayLocalISO(), status: "New", total, ...data };
  db.salesOrders.push(record);
  logAudit("Created sales order", "Sales Orders", record.orderNo);
  return record;
}

export function updateSalesOrder(id, data) {
  const order = getSalesOrderById(id);
  if (!order) return null;
  Object.assign(order, data);
  if (data.items) order.total = data.items.reduce((s, i) => s + i.qty * i.rate, 0);
  logAudit("Updated sales order", "Sales Orders", order.orderNo);
  return order;
}

export function salesOrderDependents(id) {
  return {
    printJobs: db.printJobs.filter((j) => j.salesOrderId === id).length,
    invoices: db.invoices.filter((i) => i.salesOrderId === id).length,
  };
}

export function deleteSalesOrder(id) {
  const order = getSalesOrderById(id);
  if (!order) return { ok: false, error: "Sales order not found." };
  const dep = salesOrderDependents(id);
  const total = dep.printJobs + dep.invoices;
  if (total > 0) {
    return { ok: false, error: `Cannot delete — this order has ${dep.printJobs} print job(s) and ${dep.invoices} invoice(s) linked to it.` };
  }
  db.salesOrders = db.salesOrders.filter((s) => s.id !== id);
  logAudit("Deleted sales order", "Sales Orders", order.orderNo);
  return { ok: true };
}

// --- Printing / Production ------------------------------------------------
export const getPrintJobs = () => db.printJobs;
export const getPrintJobById = (id) => db.printJobs.find((j) => j.id === id);
export const PRINT_JOB_STAGES = seed.PRINT_JOB_STAGES;

export function advancePrintJobStage(jobId, newStage) {
  const job = getPrintJobById(jobId);
  if (!job) return;
  job.stage = newStage;
  job.stageHistory.push({ stage: newStage, at: todayLocalISO(), by: getCurrentUser()?.name || "—" });
  logAudit("Updated print job stage", "Printing", `${job.jobNo} → ${newStage}`);
}

export function addPrintJob(data) {
  const record = {
    id: nextId("PJ"),
    jobNo: `PJ-${2000 + db.printJobs.length + 1}`,
    stage: "Design",
    createdAt: todayLocalISO(),
    materialConsumption: [],
    finishing: [],
    stageHistory: [{ stage: "Design", at: todayLocalISO(), by: getCurrentUser()?.name || "—" }],
    ...data,
  };
  db.printJobs.push(record);
  logAudit("Created print job", "Printing", record.jobNo);
  return record;
}

// --- Print Counter (walk-up printing + billing) -----------------------
// A guided, point-of-sale-style workflow: pick a customer (regular or
// walk-in), a printer, the material(s) consumed, and a payment choice —
// one action creates the invoice, the ledger entry (regular customers
// only — a walk-in isn't a stored party), and deducts inventory, all
// kept in sync rather than as separate steps that could drift apart.
export const getCounterJobs = () => db.counterJobs;
export const getCounterJobById = (id) => db.counterJobs.find((j) => j.id === id);
export const COUNTER_JOB_STATUSES = seed.COUNTER_JOB_STATUSES;
export const PAYMENT_METHODS = seed.PAYMENT_METHODS;

// Total across all warehouses — used for the "is there enough stock at
// all" check; deduction itself still happens against one chosen
// warehouse (see checkMaterialStock/deductStock below).
export function getProductStock(productId, warehouseId) {
  const product = getProductById(productId);
  if (!product) return 0;
  return warehouseId ? (product.stock[warehouseId] || 0) : Object.values(product.stock).reduce((a, b) => a + b, 0);
}

// Checks every line against the chosen warehouse's stock and returns the
// list of problems (empty = OK) rather than a single boolean, so the UI
// can point at exactly which material is short and by how much.
export function checkMaterialStock(items, warehouseId) {
  const problems = [];
  items.forEach((item) => {
    const product = getProductById(item.productId);
    const available = getProductStock(item.productId, warehouseId);
    if (!product) { problems.push(`Unknown material.`); return; }
    if (item.qty > available) {
      problems.push(`${product.name}: need ${item.qty} ${product.unit}, only ${available} ${product.unit} available.`);
    }
  });
  return problems;
}

function deductStock(productId, warehouseId, qty) {
  const product = getProductById(productId);
  if (!product) return;
  product.stock[warehouseId] = (product.stock[warehouseId] || 0) - qty;
}

function restoreStock(productId, warehouseId, qty) {
  const product = getProductById(productId);
  if (!product) return;
  product.stock[warehouseId] = (product.stock[warehouseId] || 0) + qty;
}

export function addInvoice(data) {
  const record = {
    id: nextId("INV"),
    invoiceNo: `INV-${9000 + db.invoices.length + 1}`,
    date: todayLocalISO(),
    dueDate: todayLocalISO(),
    paid: 0,
    status: "Unpaid",
    salesOrderId: null,
    walkInName: null,
    ...data,
  };
  db.invoices.push(record);
  logAudit("Created invoice", "Invoicing", record.invoiceNo);
  return record;
}

// Status is always derived from paid vs. total (+ due date), never set
// directly — this is the one place that decides Paid / Partially Paid /
// Unpaid / Overdue / Overpaid so every screen agrees.
export function computeInvoiceStatus(invoice) {
  const outstanding = invoiceOutstanding(invoice);
  if (outstanding < 0) return "Overpaid — Credit";
  if (outstanding === 0) return "Paid";
  const overdue = invoice.dueDate && daysBetween(invoice.dueDate) < 0;
  if (overdue) return "Overdue";
  return invoice.paid > 0 ? "Partially Paid" : "Unpaid";
}

// Records a payment (full or partial) against an existing invoice —
// supports being called any time after the invoice was created, not just
// at creation, per the "pay later / partial payment" requirement. Skips
// the ledger entirely for invoices with no customerId (walk-ins), same
// as they get none at creation.
export function recordPayment(invoiceId, amount, method, note = "") {
  const invoice = getInvoiceById(invoiceId);
  if (!invoice) return { ok: false, error: "Invoice not found." };
  if (!(amount > 0)) return { ok: false, error: "Enter an amount greater than zero." };
  invoice.paid += amount;
  invoice.status = computeInvoiceStatus(invoice);
  if (invoice.customerId) {
    db.ledgerEntries.push({
      id: nextId("LG"),
      date: todayLocalISO(),
      partyType: "customer",
      partyId: invoice.customerId,
      type: "Payment",
      reference: invoice.invoiceNo,
      amount: -amount,
      description: note || `Payment received (${method})${invoice.printJobId ? ` — ${getCounterJobById(invoice.printJobId)?.jobNo || ""}` : ""}`,
    });
  }
  logAudit("Recorded payment", "Invoicing", `${invoice.invoiceNo} — Rs ${amount.toLocaleString()} (${method})`);
  return { ok: true, invoice };
}

// The single entry point for the whole "New Print Job" wizard: validates
// stock, deducts it, creates the invoice, records the ledger entry (paid
// now or credit) and the counter job record together, so none of these
// can happen without the others.
//
// `billingItems` and `materials` are deliberately separate and NOT
// required to match each other line-for-line — a print shop bills the
// customer for the finished product/service ("500 business cards", "1
// banner 6x3ft"), not for the raw paper/vinyl it took to make it.
//   - billingItems: [{ description, qty, rate }] — free-text, drives the
//     invoice total. Nothing here touches inventory.
//   - materials: [{ productId, qty }] — the actual stock consumed
//     (paper/vinyl/etc from Products & Inventory). Drives the stock
//     deduction only, never the bill amount.
export function createCounterJob({ customerType, customerId, walkInName, printerId, sourceApplication, warehouseId, billingItems, materials, paymentChoice, paymentMethod, amountPaid, realPrinterName, realJobId }) {
  const stockProblems = checkMaterialStock(materials, warehouseId);
  if (stockProblems.length > 0) return { ok: false, error: stockProblems.join(" ") };

  const total = billingItems.reduce((s, i) => s + i.qty * i.rate, 0);
  const isWalkIn = customerType === "Walk-in";
  const payingNow = paymentChoice === "Pay Now";
  const paidAmount = payingNow ? (amountPaid ?? total) : 0;

  // Deduct inventory up front — printing is authorized once, not per
  // status transition (a later Reprint must NOT deduct again).
  materials.forEach((m) => deductStock(m.productId, warehouseId, m.qty));

  const invoice = addInvoice({
    customerId: isWalkIn ? null : customerId,
    walkInName: isWalkIn ? (walkInName || "Walk-in Customer") : null,
    total,
    paid: paidAmount,
    status: paidAmount >= total ? "Paid" : "Unpaid",
  });
  invoice.status = computeInvoiceStatus(invoice);

  // Ledger: regular customers always get the invoice debit (matching the
  // accounting rule "invoice = debit, payment = credit" even when paid
  // immediately); walk-ins get nothing since they aren't a stored party.
  if (!isWalkIn) {
    db.ledgerEntries.push({
      id: nextId("LG"), date: todayLocalISO(), partyType: "customer", partyId: customerId,
      type: "Invoice", reference: invoice.invoiceNo,
      amount: total, description: `Print Counter ${sourceApplication ? `(${sourceApplication}) ` : ""}— ${billingItems.map((i) => i.description).join(", ")}`,
    });
    if (payingNow && paidAmount > 0) {
      db.ledgerEntries.push({
        id: nextId("LG"), date: todayLocalISO(), partyType: "customer", partyId: customerId,
        type: "Payment", reference: invoice.invoiceNo, amount: -paidAmount,
        description: `Payment received (${paymentMethod})`,
      });
    }
  }

  const job = {
    id: nextId("CJ"),
    jobNo: `PC-${3000 + db.counterJobs.length + 1}`,
    customerType, customerId: isWalkIn ? null : customerId, walkInName: isWalkIn ? (walkInName || "Walk-in Customer") : null,
    printerId, sourceApplication: sourceApplication || "Manual", warehouseId,
    billingItems, materials, total,
    paymentChoice, paymentMethod: payingNow ? paymentMethod : null,
    invoiceId: invoice.id,
    // Set only when this job came from a real print job the Print Bridge
    // agent is holding on an actual Windows printer - lets the wizard's
    // "Confirm & Print" tell the agent to release that exact job so it
    // actually prints, and lets the job's own record show whether that
    // really happened (see realPrintReleased below).
    realPrinterName: realPrinterName || null,
    realJobId: realJobId || null,
    realPrintReleased: false,
    status: "Sent to Printer",
    createdAt: todayLocalISO(), createdBy: getCurrentUser()?.name || "—",
    reprintCount: 0,
  };
  db.counterJobs.push(job);
  invoice.printJobId = job.id;
  logAudit("Created print counter job", "Print Counter", `${job.jobNo} — Rs ${total.toLocaleString()}`);
  return { ok: true, job, invoice };
}

// Status lifecycle: Pending -> Sent to Printer -> Printing -> Completed,
// or -> Failed at any point before Completed. Cancelling/failing does
// NOT restore stock automatically (material was already consumed/cut),
// matching the "reprint must not silently double-deduct, but a genuine
// failure still consumed real material" real-world behavior — an
// operator can use Cancel Job (with stock restore) only while still
// Pending, before anything was actually sent to a machine.
export function updateCounterJobStatus(jobId, status) {
  const job = getCounterJobById(jobId);
  if (!job) return { ok: false, error: "Job not found." };
  job.status = status;
  logAudit("Updated print counter job status", "Print Counter", `${job.jobNo} → ${status}`);
  return { ok: true, job };
}

// Records whether the local Print Bridge agent actually released the real
// held print job after Confirm & Print. This is reported by the browser
// after it calls the agent's local endpoint — never assumed true just
// because the ERP-side job/invoice were created successfully.
export function markRealPrintReleased(jobId, released, note = "") {
  const job = getCounterJobById(jobId);
  if (!job) return;
  job.realPrintReleased = released;
  job.realPrintNote = note;
}

// A reprint creates no new invoice and consumes no additional inventory
// — it's the same job, sent to the printer again.
export function reprintCounterJob(jobId) {
  const job = getCounterJobById(jobId);
  if (!job) return { ok: false, error: "Job not found." };
  job.reprintCount += 1;
  job.status = "Sent to Printer";
  logAudit("Reprinted print counter job", "Print Counter", `${job.jobNo} (reprint #${job.reprintCount})`);
  return { ok: true, job };
}

export function counterJobDependents(id) {
  return { invoicePaid: (() => {
    const job = getCounterJobById(id);
    const invoice = job ? getInvoiceById(job.invoiceId) : null;
    return invoice ? invoice.paid : 0;
  })() };
}

// Cancelling is only meaningful while nothing has been paid and the job
// hasn't actually gone to a machine yet — otherwise use Failed status
// (keeps the record, doesn't pretend it never happened) rather than
// deleting real financial/inventory history.
export function cancelCounterJob(id) {
  const job = getCounterJobById(id);
  if (!job) return { ok: false, error: "Job not found." };
  const invoice = getInvoiceById(job.invoiceId);
  if (invoice && invoice.paid > 0) {
    return { ok: false, error: `Cannot cancel — Rs ${invoice.paid.toLocaleString()} already recorded as paid against ${invoice.invoiceNo}.` };
  }
  job.materials.forEach((m) => restoreStock(m.productId, job.warehouseId, m.qty));
  job.status = "Cancelled";
  logAudit("Cancelled print counter job", "Print Counter", job.jobNo);
  return { ok: true, job };
}

// --- Purchase Orders / GRN --------------------------------------------
export const getPurchaseOrders = () => db.purchaseOrders;
export const getPurchaseOrderById = (id) => db.purchaseOrders.find((p) => p.id === id);
export const getGRNs = () => db.grns;

// Creating a PO immediately credits the vendor's ledger (we now owe them
// this much) — mirrors how creating a customer invoice credits the
// customer's ledger. Stock itself only moves later, when the PO is
// actually received (see receiveGRN below); the ledger entry reflects the
// commitment to pay, not the goods arriving.
export function addPurchaseOrder({ vendorId, items }) {
  const total = items.reduce((sum, i) => sum + i.qty * i.rate, 0);
  const record = {
    id: nextId("PO"),
    poNo: `PO-${500 + db.purchaseOrders.length + 1}`,
    vendorId,
    date: todayLocalISO(),
    status: "Pending",
    items: items.map((i) => ({ ...i, receivedQty: 0 })),
    total,
  };
  db.purchaseOrders.push(record);
  db.ledgerEntries.push({
    id: nextId("LG"),
    date: todayLocalISO(),
    partyType: "vendor",
    partyId: vendorId,
    type: "Bill",
    reference: record.poNo,
    amount: total,
    description: `Purchase order — ${items.map((i) => i.description || getProductById(i.productId)?.name || i.productId).join(", ")}`,
  });
  logAudit("Created purchase order", "Purchase Orders", record.poNo);
  return record;
}

// Paying a vendor debits their ledger (reduces what we owe) — not tied to
// any specific PO, matching the same "simplified running account" model
// used for customer payments.
export function recordVendorPayment(vendorId, amount, method, note = "") {
  if (!(amount > 0)) return { ok: false, error: "Enter an amount greater than zero." };
  const reference = nextId("PYMT-");
  db.ledgerEntries.push({
    id: nextId("LG"),
    date: todayLocalISO(),
    partyType: "vendor",
    partyId: vendorId,
    type: "Payment",
    reference,
    amount: -amount,
    description: note || `Payment made (${method})`,
  });
  logAudit("Recorded vendor payment", "Vendors", `Rs ${amount.toLocaleString()} (${method})`);
  return { ok: true };
}

// Customer-side equivalent of recordVendorPayment — a general "on
// account" receipt against the customer's overall balance, not tied to
// one specific bill. Use recordPayment() instead when paying down a
// particular invoice.
export function recordCustomerPayment(customerId, amount, method, note = "") {
  if (!(amount > 0)) return { ok: false, error: "Enter an amount greater than zero." };
  const reference = nextId("RCPT-");
  db.ledgerEntries.push({
    id: nextId("LG"),
    date: todayLocalISO(),
    partyType: "customer",
    partyId: customerId,
    type: "Payment",
    reference,
    amount: -amount,
    description: note || `Payment received (${method})`,
  });
  logAudit("Recorded customer payment", "Customers", `Rs ${amount.toLocaleString()} (${method})`);
  return { ok: true };
}

// A PO's items track receivedQty individually so it can be received in
// more than one GRN over time (less arrived than was ordered, so the rest
// follows in a later delivery). Status is always derived from where every
// line stands — never set directly — so every screen agrees:
//   Pending -> nothing received yet
//   Partially Received -> some, but not all, lines are fully in
//   Received -> every line's receivedQty has caught up to its ordered qty
export function poOrderedQty(item) { return item.qty; }
export function poReceivedQty(item) { return item.receivedQty || 0; }
export function poRemainingQty(item) { return Math.max(0, item.qty - (item.receivedQty || 0)); }

export function computePoStatus(po) {
  const totalOrdered = po.items.reduce((s, i) => s + i.qty, 0);
  const totalReceived = po.items.reduce((s, i) => s + Math.min(i.qty, i.receivedQty || 0), 0);
  if (totalReceived <= 0) return "Pending";
  if (totalReceived >= totalOrdered) return "Received";
  return "Partially Received";
}

// Receives specific quantities against specific PO line items (a subset,
// and not necessarily the full remaining amount — see partial receiving
// above). `items`: [{ productId, qty }]. Creates one GRN record per call,
// so 2-3 partial deliveries against the same PO show up as 2-3 GRNs.
export function receiveGRN(poId, warehouseId, items) {
  const po = getPurchaseOrderById(poId);
  if (!po) return { ok: false, error: "Purchase order not found." };
  const toReceive = (items && items.length
    ? items
    : po.items.map((i) => ({ productId: i.productId, qty: poRemainingQty(i) }))
  ).filter((i) => i.qty > 0);
  if (toReceive.length === 0) return { ok: false, error: "Enter a quantity greater than zero for at least one item." };

  for (const line of toReceive) {
    const poItem = po.items.find((i) => i.productId === line.productId);
    if (!poItem) return { ok: false, error: "That item isn't on this purchase order." };
    if (line.qty > poRemainingQty(poItem) + 1e-9) {
      return { ok: false, error: `${getProductById(line.productId)?.name || line.productId}: only ${poRemainingQty(poItem)} remaining to receive.` };
    }
  }

  const grn = {
    id: nextId("GRN"),
    grnNo: `GRN-${300 + db.grns.length + 1}`,
    poId,
    vendorId: po.vendorId,
    date: todayLocalISO(),
    warehouseId,
    receivedBy: getCurrentUser()?.name || "—",
    items: toReceive.map((i) => ({ productId: i.productId, qty: i.qty })),
  };
  db.grns.push(grn);

  toReceive.forEach((line) => {
    const poItem = po.items.find((i) => i.productId === line.productId);
    poItem.receivedQty = (poItem.receivedQty || 0) + line.qty;
    const product = getProductById(line.productId);
    if (product) product.stock[warehouseId] = (product.stock[warehouseId] || 0) + line.qty;
  });
  po.status = computePoStatus(po);
  logAudit("Received GRN against PO", "GRN", `${grn.grnNo} — ${po.poNo}`);
  return { ok: true, grn };
}

export function getGRNById(id) { return db.grns.find((g) => g.id === id); }

// Reverses exactly one GRN: subtracts the stock it added back out (can go
// negative if that material was already consumed since — same "don't hide
// the real state" reasoning as balances never being floored at zero) and
// rolls the PO's received quantity back down, recomputing status.
export function deleteGRN(grnId) {
  const grn = getGRNById(grnId);
  if (!grn) return { ok: false, error: "GRN not found." };
  const po = getPurchaseOrderById(grn.poId);
  grn.items.forEach((line) => {
    const product = getProductById(line.productId);
    if (product) product.stock[grn.warehouseId] = (product.stock[grn.warehouseId] || 0) - line.qty;
    if (po) {
      const poItem = po.items.find((i) => i.productId === line.productId);
      if (poItem) poItem.receivedQty = Math.max(0, (poItem.receivedQty || 0) - line.qty);
    }
  });
  if (po) po.status = computePoStatus(po);
  db.grns = db.grns.filter((g) => g.id !== grnId);
  logAudit("Deleted GRN", "GRN", `${grn.grnNo}${po ? ` — ${po.poNo}` : ""}`);
  return { ok: true };
}

// Edits a GRN's received quantities — applies the delta (new - old) to
// both stock and the PO line's receivedQty, so correcting "we said 100 but
// it was really 80" doesn't require deleting and recreating the record.
export function updateGRN(grnId, newItems) {
  const grn = getGRNById(grnId);
  if (!grn) return { ok: false, error: "GRN not found." };
  const po = getPurchaseOrderById(grn.poId);

  for (const line of newItems) {
    if (!(line.qty >= 0)) return { ok: false, error: "Quantities cannot be negative." };
    if (po) {
      const poItem = po.items.find((i) => i.productId === line.productId);
      const oldQty = grn.items.find((i) => i.productId === line.productId)?.qty || 0;
      const otherReceived = (poItem?.receivedQty || 0) - oldQty;
      if (poItem && line.qty + otherReceived > poItem.qty + 1e-9) {
        return { ok: false, error: `${getProductById(line.productId)?.name || line.productId}: that would exceed the ordered quantity (${poItem.qty}).` };
      }
    }
  }

  newItems.forEach((line) => {
    const oldQty = grn.items.find((i) => i.productId === line.productId)?.qty || 0;
    const delta = line.qty - oldQty;
    if (delta === 0) return;
    const product = getProductById(line.productId);
    if (product) product.stock[grn.warehouseId] = (product.stock[grn.warehouseId] || 0) + delta;
    if (po) {
      const poItem = po.items.find((i) => i.productId === line.productId);
      if (poItem) poItem.receivedQty = Math.max(0, (poItem.receivedQty || 0) + delta);
    }
  });
  grn.items = newItems.map((i) => ({ productId: i.productId, qty: i.qty }));
  if (po) po.status = computePoStatus(po);
  logAudit("Edited GRN", "GRN", `${grn.grnNo}${po ? ` — ${po.poNo}` : ""}`);
  return { ok: true, grn };
}

// Deleting a PO removes it entirely — its GRN(s) (reversing the stock they
// added), the vendor ledger entry it created, and the PO itself. For
// genuine mistakes ("wrong vendor", "wrong items") rather than a
// cancellation of something legitimately in progress.
export function deletePurchaseOrder(poId) {
  const po = getPurchaseOrderById(poId);
  if (!po) return { ok: false, error: "Purchase order not found." };
  const relatedGrns = db.grns.filter((g) => g.poId === poId);
  relatedGrns.forEach((grn) => {
    grn.items.forEach((line) => {
      const product = getProductById(line.productId);
      if (product) product.stock[grn.warehouseId] = (product.stock[grn.warehouseId] || 0) - line.qty;
    });
  });
  db.grns = db.grns.filter((g) => g.poId !== poId);
  db.ledgerEntries = db.ledgerEntries.filter((e) => !(e.type === "Bill" && e.partyType === "vendor" && e.partyId === po.vendorId && e.reference === po.poNo));
  db.purchaseOrders = db.purchaseOrders.filter((p) => p.id !== poId);
  logAudit("Deleted purchase order", "Purchase Orders", `${po.poNo}${relatedGrns.length ? ` (and ${relatedGrns.length} GRN(s))` : ""}`);
  return { ok: true };
}

// --- Stock adjustment ---------------------------------------------------
// A manual correction for when the counted, physical quantity doesn't
// match what the system shows (damage, miscount, an old paper record
// finally being entered) — separate from GRN receiving, which is always
// tied to a purchase order.
export function adjustStock(productId, warehouseId, newQty, reason = "") {
  const product = getProductById(productId);
  if (!product) return { ok: false, error: "Product not found." };
  if (!(newQty >= 0)) return { ok: false, error: "Quantity cannot be negative." };
  const before = product.stock[warehouseId] || 0;
  product.stock[warehouseId] = newQty;
  logAudit("Adjusted stock", "Stock", `${product.name} — ${before} → ${newQty}${reason ? ` (${reason})` : ""}`);
  return { ok: true };
}

// --- Dispatch ----------------------------------------------------------
export const getDispatches = () => db.dispatches;

// --- Invoicing -----------------------------------------------------------
export const getInvoices = () => db.invoices;
export const getInvoiceById = (id) => db.invoices.find((i) => i.id === id);
export function invoiceOutstanding(inv) {
  return inv.total - inv.paid; // may be negative — that's a credit, not an error
}

// Editing an invoice's total must keep its linked ledger entry (and
// therefore the customer's balance) in sync — never let the two drift
// apart. Same reference/partyId lookup the seed ledger entries use.
export function updateInvoice(id, data) {
  const invoice = getInvoiceById(id);
  if (!invoice) return null;
  Object.assign(invoice, data);
  const ledgerEntry = db.ledgerEntries.find((e) => e.type === "Invoice" && e.reference === invoice.invoiceNo && e.partyType === "customer" && e.partyId === invoice.customerId);
  if (ledgerEntry) ledgerEntry.amount = invoice.total;
  logAudit("Updated invoice", "Invoicing", invoice.invoiceNo);
  return invoice;
}

// Deleting an invoice is only allowed while nothing has been paid against
// it yet — otherwise the customer's payment history would reference a
// total that no longer exists. Removing it also removes its ledger entry
// so the balance stays correct rather than silently drifting.
export function deleteInvoice(id) {
  const invoice = getInvoiceById(id);
  if (!invoice) return { ok: false, error: "Invoice not found." };
  if (invoice.paid && invoice.paid !== 0) {
    return { ok: false, error: `Cannot delete — Rs ${invoice.paid.toLocaleString()} has already been recorded as paid against this invoice.` };
  }
  db.invoices = db.invoices.filter((i) => i.id !== id);
  db.ledgerEntries = db.ledgerEntries.filter((e) => !(e.type === "Invoice" && e.reference === invoice.invoiceNo && e.partyType === "customer" && e.partyId === invoice.customerId));
  logAudit("Deleted invoice", "Invoicing", invoice.invoiceNo);
  return { ok: true };
}

// --- Tax (GST / Sales Tax) helpers -----------------------------------
// Single place that decides whether tax applies and at what rate, so
// invoice/report screens never hardcode a rate — they all read through
// here, and Company Details (Settings) is the one source of truth.
export function computeInvoiceTax(invoice) {
  const customer = getCustomerById(invoice.customerId);
  const company = getCompanyDetails();
  const applies = !!customer && customer.gstStatus === "Registered" && company.isGstRegistered;
  const rate = company.defaultTaxRate || 0;
  if (!applies) return { applies: false, rate: 0, subtotal: invoice.total, taxAmount: 0 };
  // Historical/seeded invoice totals are treated as tax-inclusive so this
  // is purely a display breakdown — it never changes what's actually owed.
  const subtotal = invoice.total / (1 + rate / 100);
  const taxAmount = invoice.total - subtotal;
  return { applies: true, rate, subtotal, taxAmount };
}

export function computePurchaseOrderTax(po) {
  const vendor = getVendorById(po.vendorId);
  const company = getCompanyDetails();
  const applies = !!vendor && vendor.salesTaxStatus === "Registered" && company.isGstRegistered;
  const rate = company.defaultTaxRate || 0;
  if (!applies) return { applies: false, rate: 0, subtotal: po.total, taxAmount: 0 };
  const subtotal = po.total / (1 + rate / 100);
  const taxAmount = po.total - subtotal;
  return { applies: true, rate, subtotal, taxAmount };
}

// --- PDC -----------------------------------------------------------------
export const getPDCs = () => db.pdcs;

// --- Company Details ---------------------------------------------------
// The single source of truth for invoice/letterhead branding and tax
// logic (see computeInvoiceTax/computePurchaseOrderTax above) — editable
// only by Super Admin, from Settings.
export const getCompanyDetails = () => db.companyDetails;

export function updateCompanyDetails(data) {
  Object.assign(db.companyDetails, data);
  logAudit("Updated company details", "Settings", db.companyDetails.tradingName);
  return db.companyDetails;
}

// --- Audit log (on-demand only) -------------------------------------------
export function loadAuditLog() {
  if (db.auditLog === null) db.auditLog = clone(seed.AUDIT_LOG);
  return db.auditLog;
}

export function logAudit(action, module, details) {
  if (db.auditLog === null) return; // not loaded this session — don't force it live
  db.auditLog.unshift({
    id: nextId("A"),
    ts: new Date().toISOString(),
    user: getCurrentUser()?.name || "System",
    action, module, details,
  });
}

// --- Backup / export --------------------------------------------------------
// Phase 1: exports the in-memory demo data as JSON. In Phase 2 this becomes
// a trigger for the Cloud Scheduler + Firestore export pipeline (run
// server-side, outside the app) — this button stays as a manual/on-demand
// export option alongside that scheduled pipeline.
export function exportAllData() {
  return {
    exportedAt: new Date().toISOString(),
    warehouses: db.warehouses,
    products: db.products,
    customers: db.customers,
    vendors: db.vendors,
    printers: db.printers,
    salesOrders: db.salesOrders,
    printJobs: db.printJobs,
    counterJobs: db.counterJobs,
    purchaseOrders: db.purchaseOrders,
    grns: db.grns,
    dispatches: db.dispatches,
    invoices: db.invoices,
    ledgerEntries: db.ledgerEntries,
    pdcs: db.pdcs,
    companyDetails: db.companyDetails,
  };
}

// --- Dashboard aggregates --------------------------------------------------
export function getLowStockProducts() {
  return db.products.filter((p) => {
    const total = Object.values(p.stock).reduce((a, b) => a + b, 0);
    return total <= p.reorderLevel;
  });
}

// Aggregate KPI: sum of amounts actually OWED to us. This is a different
// thing from flooring an individual balance — each customer's own balance
// (shown on their ledger) is never floored, so a customer in credit still
// shows their true negative/credit balance there. Here we're deliberately
// answering "how much are we owed in total", so credit balances correctly
// contribute 0 to that specific total rather than reducing it.
export function getTotalReceivables() {
  return db.customers.reduce((sum, c) => sum + Math.max(0, getPartyBalance("customer", c.id)), 0);
}

// Companion KPI: total credit/advance sitting with customers (money we owe
// back to them), shown separately so it's never silently netted away.
export function getTotalCustomerCredit() {
  return db.customers.reduce((sum, c) => sum + Math.max(0, -getPartyBalance("customer", c.id)), 0);
}

// Companion KPI on the vendor side: total we currently owe across all
// vendors (a vendor "in credit" — we've overpaid them — contributes 0
// here rather than reducing the total, same reasoning as receivables).
export function getTotalPayables() {
  return db.vendors.reduce((sum, v) => sum + Math.max(0, getPartyBalance("vendor", v.id)), 0);
}
