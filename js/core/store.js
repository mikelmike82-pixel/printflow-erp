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
import { todayLocalISO } from "./format.js";

// Deep-clone the seed once per page load so edits in the demo don't
// mutate the imported module object across route re-renders in weird ways.
const db = {
  warehouses: clone(seed.WAREHOUSES),
  products: clone(seed.PRODUCTS),
  customers: clone(seed.CUSTOMERS),
  vendors: clone(seed.VENDORS),
  leads: clone(seed.LEADS),
  salesOrders: clone(seed.SALES_ORDERS),
  printJobs: clone(seed.PRINT_JOBS),
  purchaseOrders: clone(seed.PURCHASE_ORDERS),
  grns: clone(seed.GRNS),
  dispatches: clone(seed.DISPATCHES),
  invoices: clone(seed.INVOICES),
  ledgerEntries: clone(seed.LEDGER_ENTRIES),
  pdcs: clone(seed.PDCS),
  auditLog: null, // deliberately not loaded until Audit Trail is opened
};

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

let idCounter = 1000;
export function nextId(prefix) {
  idCounter += 1;
  return `${prefix}${idCounter}`;
}

// --- Reference data -------------------------------------------------
export const getWarehouses = () => db.warehouses;
export const getProducts = () => db.products;
export const getProductById = (id) => db.products.find((p) => p.id === id);

// --- Customers / Vendors ---------------------------------------------
export const getCustomers = () => db.customers;
export const getCustomerById = (id) => db.customers.find((c) => c.id === id);
export const getVendors = () => db.vendors;
export const getVendorById = (id) => db.vendors.find((v) => v.id === id);

export function addCustomer(data) {
  const record = { id: nextId("C"), status: "Active", ...data };
  db.customers.push(record);
  logAudit("Added customer", "Customers", record.name);
  return record;
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

// --- CRM / Leads -------------------------------------------------------
export const getLeads = () => db.leads;
export const getLeadById = (id) => db.leads.find((l) => l.id === id);

export function addLead(data) {
  const record = {
    id: nextId("L"),
    stage: "New",
    createdAt: todayLocalISO(),
    contactHistory: [],
    followUps: [],
    ...data,
  };
  db.leads.push(record);
  logAudit("Added lead", "CRM", `${record.name} (${record.company || "—"})`);
  return record;
}

export function updateLeadStage(leadId, stage) {
  const lead = getLeadById(leadId);
  if (!lead) return;
  lead.stage = stage;
  logAudit("Updated lead stage", "CRM", `${lead.company || lead.name} → ${stage}`);
}

export function addLeadContact(leadId, entry) {
  const lead = getLeadById(leadId);
  if (!lead) return;
  lead.contactHistory.push({ ts: todayLocalISO(), by: getCurrentUser()?.name || "—", ...entry });
  logAudit("Logged contact", "CRM", `${lead.company || lead.name}: ${entry.type}`);
}

export function addFollowUp(leadId, followUp) {
  const lead = getLeadById(leadId);
  if (!lead) return;
  lead.followUps.push({ id: nextId("F"), done: false, ...followUp });
}

export function toggleFollowUp(leadId, followUpId) {
  const lead = getLeadById(leadId);
  const fu = lead?.followUps.find((f) => f.id === followUpId);
  if (fu) fu.done = !fu.done;
}

export function convertLeadToCustomer(leadId) {
  const lead = getLeadById(leadId);
  if (!lead) return null;
  const customer = addCustomer({
    name: lead.company || lead.name,
    contactPerson: lead.name,
    phone: lead.phone,
    email: lead.email,
    address: "",
    creditLimit: 200000,
  });
  lead.stage = "Won";
  lead.convertedCustomerId = customer.id;
  logAudit("Converted lead to customer", "CRM", `${lead.company || lead.name} → ${customer.id}`);
  return customer;
}

export function getAllFollowUps() {
  return db.leads.flatMap((lead) =>
    lead.followUps.filter((f) => !f.done).map((f) => ({ ...f, leadId: lead.id, leadName: lead.company || lead.name }))
  );
}

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

// --- Purchase Orders / GRN --------------------------------------------
export const getPurchaseOrders = () => db.purchaseOrders;
export const getPurchaseOrderById = (id) => db.purchaseOrders.find((p) => p.id === id);
export const getGRNs = () => db.grns;

export function receiveGRN(poId, warehouseId) {
  const po = getPurchaseOrderById(poId);
  if (!po) return;
  po.status = "Received";
  db.grns.push({
    id: nextId("GRN"),
    grnNo: `GRN-${300 + db.grns.length + 1}`,
    poId,
    vendorId: po.vendorId,
    date: todayLocalISO(),
    warehouseId,
    receivedBy: getCurrentUser()?.name || "—",
    items: po.items.map((i) => ({ productId: i.productId, qty: i.qty })),
  });
  po.items.forEach((i) => {
    const product = getProductById(i.productId);
    if (product) product.stock[warehouseId] = (product.stock[warehouseId] || 0) + i.qty;
  });
  logAudit("Received GRN against PO", "GRN", po.poNo);
}

// --- Dispatch ----------------------------------------------------------
export const getDispatches = () => db.dispatches;

// --- Invoicing -----------------------------------------------------------
export const getInvoices = () => db.invoices;
export const getInvoiceById = (id) => db.invoices.find((i) => i.id === id);
export function invoiceOutstanding(inv) {
  return inv.total - inv.paid; // may be negative — that's a credit, not an error
}

// --- PDC -----------------------------------------------------------------
export const getPDCs = () => db.pdcs;

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
    leads: db.leads,
    salesOrders: db.salesOrders,
    printJobs: db.printJobs,
    purchaseOrders: db.purchaseOrders,
    grns: db.grns,
    dispatches: db.dispatches,
    invoices: db.invoices,
    ledgerEntries: db.ledgerEntries,
    pdcs: db.pdcs,
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
