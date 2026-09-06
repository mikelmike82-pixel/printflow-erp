// In-memory seed data for the Phase 1 demo.
//
// This whole module is the seam that gets replaced in Phase 2: every
// module reads its records through js/core/store.js, never straight from
// here, so swapping this file's contents for real Firestore reads later
// touches one layer, not every screen.
import { todayLocalISO, parseLocalDate, localDateToISO } from "../core/format.js";

// Relative-date helper so the demo always looks "current" whenever it's
// opened, rather than showing dates that quietly drift into the past.
function offsetDate(days) {
  const d = parseLocalDate(todayLocalISO());
  d.setDate(d.getDate() + days);
  return localDateToISO(d);
}

export const WAREHOUSES = [
  { id: "WH1", name: "Main Warehouse", location: "Karachi — Head Office" },
  { id: "WH2", name: "Production Store", location: "Karachi — Factory Site" },
];

export const PRODUCTS = [
  { id: "P1", sku: "PAP-ART130", name: "Art Paper 130gsm", category: "Paper", unit: "Sheet", reorderLevel: 5000, costPrice: 8.5, salePrice: null, stock: { WH1: 12000, WH2: 3200 } },
  { id: "P2", sku: "PAP-CARD300", name: "Art Card 300gsm", category: "Paper", unit: "Sheet", reorderLevel: 3000, costPrice: 14.0, salePrice: null, stock: { WH1: 6400, WH2: 1800 } },
  { id: "P3", sku: "PAP-OFF80", name: "Offset Paper 80gsm", category: "Paper", unit: "Sheet", reorderLevel: 8000, costPrice: 5.2, salePrice: null, stock: { WH1: 21000, WH2: 4000 } },
  { id: "P4", sku: "INK-CYN", name: "Ink — Cyan", category: "Ink", unit: "Kg", reorderLevel: 10, costPrice: 3200, salePrice: null, stock: { WH1: 4, WH2: 22 } },
  { id: "P5", sku: "INK-MAG", name: "Ink — Magenta", category: "Ink", unit: "Kg", reorderLevel: 10, costPrice: 3200, salePrice: null, stock: { WH1: 6, WH2: 18 } },
  { id: "P6", sku: "INK-BLK", name: "Ink — Black", category: "Ink", unit: "Kg", reorderLevel: 15, costPrice: 2600, salePrice: null, stock: { WH1: 40, WH2: 35 } },
  { id: "P7", sku: "LAM-GLOSS", name: "Lamination Film — Gloss", category: "Finishing", unit: "Roll", reorderLevel: 8, costPrice: 6800, salePrice: null, stock: { WH1: 2, WH2: 2 } },
  { id: "P8", sku: "COAT-UV", name: "UV Spot Coating", category: "Finishing", unit: "Litre", reorderLevel: 8, costPrice: 4200, salePrice: null, stock: { WH1: 9, WH2: 5 } },
  { id: "P9", sku: "BIND-WIRE", name: "Binding Wire", category: "Finishing", unit: "Roll", reorderLevel: 6, costPrice: 1500, salePrice: null, stock: { WH1: 2, WH2: 1 } },
  { id: "P10", sku: "PLATE-CTP", name: "CTP Printing Plate", category: "Plates", unit: "Plate", reorderLevel: 20, costPrice: 950, salePrice: null, stock: { WH1: 45, WH2: 12 } },
];

export const CUSTOMERS = [
  { id: "C1", name: "Al-Noor Traders", contactPerson: "Waqas Ali", phone: "0300-1234567", email: "waqas@alnoortraders.demo", address: "Site Area, Karachi", creditLimit: 500000, status: "Active" },
  { id: "C2", name: "Zaitoon Foods Pvt Ltd", contactPerson: "Ayesha Malik", phone: "0321-2345678", email: "ayesha@zaitoonfoods.demo", address: "Korangi Industrial Area, Karachi", creditLimit: 1000000, status: "Active" },
  { id: "C3", name: "Silver Star Publishers", contactPerson: "Imran Sheikh", phone: "0333-3456789", email: "imran@silverstar.demo", address: "Urdu Bazar, Karachi", creditLimit: 300000, status: "Active" },
  { id: "C4", name: "Metro Pharma Distributors", contactPerson: "Dr. Sana Yousuf", phone: "0345-4567890", email: "sana@metropharma.demo", address: "SITE, Karachi", creditLimit: 800000, status: "Active" },
  { id: "C5", name: "Bright Kids Stationers", contactPerson: "Farrukh Naeem", phone: "0312-5678901", email: "farrukh@brightkids.demo", address: "Gulshan-e-Iqbal, Karachi", creditLimit: 200000, status: "Active" },
  { id: "C6", name: "Crescent Textiles Ltd", contactPerson: "Hassan Raza", phone: "0301-6789012", email: "hassan@crescenttex.demo", address: "Landhi Industrial Area, Karachi", creditLimit: 600000, status: "Active" },
];

export const VENDORS = [
  { id: "V1", name: "Paper House Karachi", contactPerson: "Tariq Mehmood", phone: "021-34567890", email: "sales@paperhouse.demo", address: "M.A. Jinnah Road, Karachi" },
  { id: "V2", name: "InkTech Supplies", contactPerson: "Kashif Iqbal", phone: "021-35678901", email: "info@inktech.demo", address: "SITE, Karachi" },
  { id: "V3", name: "Lamination World", contactPerson: "Adnan Shah", phone: "021-36789012", email: "sales@laminationworld.demo", address: "North Karachi" },
  { id: "V4", name: "Bindwell Traders", contactPerson: "Omer Farooq", phone: "021-37890123", email: "omer@bindwell.demo", address: "Shershah, Karachi" },
];

export const LEADS = [
  {
    id: "L1", name: "Faisal Ahmed", company: "Faisal Enterprises", phone: "0300-9871234", email: "faisal@faisalent.demo",
    source: "Referral", stage: "New", owner: "u-sales", estValue: 150000, createdAt: offsetDate(-3),
    contactHistory: [
      { ts: offsetDate(-3), type: "Call", note: "Inbound enquiry about printed carton labels.", by: "Sara Khan" },
    ],
    followUps: [{ id: "F1", dueDate: offsetDate(1), note: "Send catalogue and rate card", done: false }],
  },
  {
    id: "L2", name: "Nadia Aslam", company: "Green Valley Dairy", phone: "0333-1122334", email: "nadia@greenvalley.demo",
    source: "Website", stage: "Contacted", owner: "u-sales", estValue: 420000, createdAt: offsetDate(-10),
    contactHistory: [
      { ts: offsetDate(-10), type: "Email", note: "Requested quote for milk pouch labels, 200k qty/month.", by: "Sara Khan" },
      { ts: offsetDate(-6), type: "Call", note: "Discussed material options — leaning toward gloss lamination.", by: "Sara Khan" },
    ],
    followUps: [{ id: "F2", dueDate: offsetDate(-1), note: "Follow up on sample approval", done: false }],
  },
  {
    id: "L3", name: "Junaid Latif", company: "Rapid Logistics", phone: "0345-2233445", email: "junaid@rapidlog.demo",
    source: "Trade Show", stage: "Quoted", owner: "u-sales", estValue: 90000, createdAt: offsetDate(-18),
    contactHistory: [
      { ts: offsetDate(-18), type: "Meeting", note: "Met at Karachi Printing Expo, needs shipping labels + tags.", by: "Sara Khan" },
      { ts: offsetDate(-12), type: "Email", note: "Sent formal quotation PF-Q-118.", by: "Sara Khan" },
    ],
    followUps: [{ id: "F3", dueDate: offsetDate(2), note: "Check on quotation decision", done: false }],
  },
  {
    id: "L4", name: "Waqas Ali", company: "Al-Noor Traders", phone: "0300-1234567", email: "waqas@alnoortraders.demo",
    source: "Referral", stage: "Won", owner: "u-sales", estValue: 260000, createdAt: offsetDate(-60), convertedCustomerId: "C1",
    contactHistory: [
      { ts: offsetDate(-60), type: "Call", note: "Initial enquiry for product labels.", by: "Sara Khan" },
      { ts: offsetDate(-45), type: "Meeting", note: "Finalized artwork and pricing.", by: "Sara Khan" },
      { ts: offsetDate(-40), type: "Note", note: "Converted to customer.", by: "Sara Khan" },
    ],
    followUps: [],
  },
  {
    id: "L5", name: "Hassan Raza", company: "Crescent Textiles Ltd", phone: "0301-6789012", email: "hassan@crescenttex.demo",
    source: "Cold Call", stage: "Won", owner: "u-sales", estValue: 340000, createdAt: offsetDate(-90), convertedCustomerId: "C6",
    contactHistory: [
      { ts: offsetDate(-90), type: "Call", note: "Cold call regarding fabric care tags.", by: "Sara Khan" },
      { ts: offsetDate(-70), type: "Note", note: "Converted to customer after sample approval.", by: "Sara Khan" },
    ],
    followUps: [],
  },
  {
    id: "L6", name: "Noor Bakery — Owner", company: "Noor Bakery", phone: "0322-9988776", email: "contact@noorbakery.demo",
    source: "Walk-in", stage: "Lost", owner: "u-sales", estValue: 40000, createdAt: offsetDate(-25),
    contactHistory: [
      { ts: offsetDate(-25), type: "Call", note: "Wanted bakery box labels, went with a cheaper local printer.", by: "Sara Khan" },
    ],
    followUps: [],
    lostReason: "Price — chose a lower-cost local vendor",
  },
  {
    id: "L7", name: "Sameer Khan", company: "Skyline Motors", phone: "0311-4455667", email: "sameer@skylinemotors.demo",
    source: "Website", stage: "New", owner: "u-sales", estValue: 75000, createdAt: offsetDate(-1),
    contactHistory: [
      { ts: offsetDate(-1), type: "Email", note: "Enquiry for warranty card printing.", by: "Sara Khan" },
    ],
    followUps: [{ id: "F4", dueDate: offsetDate(0), note: "First call to qualify the lead", done: false }],
  },
];

export const SALES_ORDERS = [
  { id: "SO1", orderNo: "SO-1001", customerId: "C2", date: offsetDate(-14), status: "In Production", items: [{ description: "Milk Pouch Labels — 500ml", qty: 200000, rate: 1.8 }], notes: "Rush order — client requested gloss lamination." },
  { id: "SO2", orderNo: "SO-1002", customerId: "C3", date: offsetDate(-9), status: "In Production", items: [{ description: "Paperback Book Covers — 'Urdu Adab' series", qty: 5000, rate: 22 }], notes: "" },
  { id: "SO3", orderNo: "SO-1003", customerId: "C4", date: offsetDate(-5), status: "In Production", items: [{ description: "Pharma Carton Labels — Batch A", qty: 80000, rate: 2.1 }], notes: "Regulatory text must match approved artwork exactly." },
  { id: "SO4", orderNo: "SO-1004", customerId: "C1", date: offsetDate(-20), status: "Ready to Dispatch", items: [{ description: "Product Labels — General Range", qty: 60000, rate: 1.5 }], notes: "" },
  { id: "SO5", orderNo: "SO-1005", customerId: "C6", date: offsetDate(-30), status: "Completed", items: [{ description: "Woven Fabric Care Tags", qty: 100000, rate: 1.2 }], notes: "" },
  { id: "SO6", orderNo: "SO-1006", customerId: "C5", date: offsetDate(-2), status: "In Production", items: [{ description: "Notebook Cover Printing — A5", qty: 15000, rate: 9.5 }], notes: "" },
];

function soTotal(so) {
  return so.items.reduce((sum, i) => sum + i.qty * i.rate, 0);
}
SALES_ORDERS.forEach((so) => (so.total = soTotal(so)));

export const PRINT_JOBS = [
  {
    id: "PJ1", jobNo: "PJ-2001", salesOrderId: "SO1", customerId: "C2",
    description: "Milk Pouch Labels — 500ml, gloss lamination", quantity: 200000,
    material: "Art Paper 130gsm", size: "80mm x 120mm", machine: "Heidelberg SM-74 (Press 1)",
    stage: "Printing", proofingApproved: true, plateReady: true,
    finishing: ["Gloss Lamination"], createdAt: offsetDate(-13), dueDate: offsetDate(2),
    materialConsumption: [{ productId: "P1", qty: 4200 }, { productId: "P4", qty: 3 }, { productId: "P7", qty: 1 }],
    stageHistory: [
      { stage: "Design", at: offsetDate(-13), by: "Bilal Ahmed" },
      { stage: "Proofing", at: offsetDate(-11), by: "Bilal Ahmed" },
      { stage: "Plate Setup", at: offsetDate(-9), by: "Bilal Ahmed" },
      { stage: "Printing", at: offsetDate(-6), by: "Bilal Ahmed" },
    ],
  },
  {
    id: "PJ2", jobNo: "PJ-2002", salesOrderId: "SO2", customerId: "C3",
    description: "Paperback book covers, matte finish", quantity: 5000,
    material: "Art Card 300gsm", size: "5.5in x 8.5in", machine: "Komori L-428 (Press 2)",
    stage: "Proofing", proofingApproved: false, plateReady: false,
    finishing: ["Matte Lamination"], createdAt: offsetDate(-8), dueDate: offsetDate(5),
    materialConsumption: [{ productId: "P2", qty: 600 }],
    stageHistory: [
      { stage: "Design", at: offsetDate(-8), by: "Bilal Ahmed" },
      { stage: "Proofing", at: offsetDate(-4), by: "Bilal Ahmed" },
    ],
  },
  {
    id: "PJ3", jobNo: "PJ-2003", salesOrderId: "SO3", customerId: "C4",
    description: "Pharma carton labels, batch-coded", quantity: 80000,
    material: "Art Paper 130gsm", size: "60mm x 40mm", machine: "Heidelberg SM-74 (Press 1)",
    stage: "Design", proofingApproved: false, plateReady: false,
    finishing: [], createdAt: offsetDate(-4), dueDate: offsetDate(9),
    materialConsumption: [],
    stageHistory: [{ stage: "Design", at: offsetDate(-4), by: "Bilal Ahmed" }],
  },
  {
    id: "PJ4", jobNo: "PJ-2004", salesOrderId: "SO4", customerId: "C1",
    description: "General range product labels", quantity: 60000,
    material: "Art Paper 130gsm", size: "50mm x 80mm", machine: "Komori L-428 (Press 2)",
    stage: "Finishing", proofingApproved: true, plateReady: true,
    finishing: ["Die Cutting"], createdAt: offsetDate(-19), dueDate: offsetDate(-1),
    materialConsumption: [{ productId: "P1", qty: 1500 }, { productId: "P6", qty: 2 }],
    stageHistory: [
      { stage: "Design", at: offsetDate(-19), by: "Bilal Ahmed" },
      { stage: "Proofing", at: offsetDate(-17), by: "Bilal Ahmed" },
      { stage: "Plate Setup", at: offsetDate(-15), by: "Bilal Ahmed" },
      { stage: "Printing", at: offsetDate(-12), by: "Bilal Ahmed" },
      { stage: "Finishing", at: offsetDate(-3), by: "Bilal Ahmed" },
    ],
  },
  {
    id: "PJ5", jobNo: "PJ-2005", salesOrderId: "SO5", customerId: "C6",
    description: "Woven fabric care tags", quantity: 100000,
    material: "Art Card 300gsm", size: "30mm x 60mm", machine: "Komori L-428 (Press 2)",
    stage: "Completed", proofingApproved: true, plateReady: true,
    finishing: ["UV Coating"], createdAt: offsetDate(-29), dueDate: offsetDate(-15),
    materialConsumption: [{ productId: "P2", qty: 2100 }, { productId: "P8", qty: 4 }],
    stageHistory: [
      { stage: "Design", at: offsetDate(-29), by: "Bilal Ahmed" },
      { stage: "Proofing", at: offsetDate(-27), by: "Bilal Ahmed" },
      { stage: "Plate Setup", at: offsetDate(-25), by: "Bilal Ahmed" },
      { stage: "Printing", at: offsetDate(-22), by: "Bilal Ahmed" },
      { stage: "Finishing", at: offsetDate(-18), by: "Bilal Ahmed" },
      { stage: "Completed", at: offsetDate(-15), by: "Bilal Ahmed" },
    ],
  },
  {
    id: "PJ6", jobNo: "PJ-2006", salesOrderId: "SO6", customerId: "C5",
    description: "A5 notebook cover printing, spot UV", quantity: 15000,
    material: "Art Card 300gsm", size: "A5", machine: "Heidelberg SM-74 (Press 1)",
    stage: "Plate Setup", proofingApproved: true, plateReady: false,
    finishing: ["Spot UV"], createdAt: offsetDate(-2), dueDate: offsetDate(6),
    materialConsumption: [{ productId: "P2", qty: 320 }],
    stageHistory: [
      { stage: "Design", at: offsetDate(-2), by: "Bilal Ahmed" },
      { stage: "Proofing", at: offsetDate(-1), by: "Bilal Ahmed" },
      { stage: "Plate Setup", at: offsetDate(0), by: "Bilal Ahmed" },
    ],
  },
];

export const PRINT_JOB_STAGES = ["Design", "Proofing", "Plate Setup", "Printing", "Finishing", "Completed"];

export const PURCHASE_ORDERS = [
  { id: "PO1", poNo: "PO-501", vendorId: "V1", date: offsetDate(-16), status: "Received", items: [{ productId: "P1", description: "Art Paper 130gsm", qty: 8000, rate: 8.5 }] },
  { id: "PO2", poNo: "PO-502", vendorId: "V2", date: offsetDate(-10), status: "Received", items: [{ productId: "P4", description: "Ink — Cyan", qty: 10, rate: 3200 }, { productId: "P5", description: "Ink — Magenta", qty: 10, rate: 3200 }] },
  { id: "PO3", poNo: "PO-503", vendorId: "V3", date: offsetDate(-3), status: "Pending", items: [{ productId: "P7", description: "Lamination Film — Gloss", qty: 6, rate: 6800 }] },
  { id: "PO4", poNo: "PO-504", vendorId: "V4", date: offsetDate(-1), status: "Pending", items: [{ productId: "P9", description: "Binding Wire", qty: 8, rate: 1500 }] },
];
PURCHASE_ORDERS.forEach((po) => (po.total = po.items.reduce((s, i) => s + i.qty * i.rate, 0)));

export const GRNS = [
  { id: "GRN1", grnNo: "GRN-301", poId: "PO1", vendorId: "V1", date: offsetDate(-14), warehouseId: "WH1", receivedBy: "Bilal Ahmed", items: [{ productId: "P1", qty: 8000 }] },
  { id: "GRN2", grnNo: "GRN-302", poId: "PO2", vendorId: "V2", date: offsetDate(-8), warehouseId: "WH2", receivedBy: "Bilal Ahmed", items: [{ productId: "P4", qty: 10 }, { productId: "P5", qty: 10 }] },
];

export const DISPATCHES = [
  { id: "D1", challanNo: "DC-701", salesOrderId: "SO5", customerId: "C6", date: offsetDate(-16), vehicle: "KHI-2233 (Company Van)", status: "Delivered", items: [{ description: "Woven Fabric Care Tags", qty: 100000 }] },
  { id: "D2", challanNo: "DC-702", salesOrderId: "SO4", customerId: "C1", date: offsetDate(0), vehicle: "Pending Assignment", status: "Pending", items: [{ description: "General range product labels", qty: 60000 }] },
];

export const INVOICES = [
  { id: "INV1", invoiceNo: "INV-9001", customerId: "C6", salesOrderId: "SO5", date: offsetDate(-15), dueDate: offsetDate(15), total: 120000, paid: 120000, status: "Paid" },
  { id: "INV2", invoiceNo: "INV-9002", customerId: "C1", salesOrderId: "SO4", date: offsetDate(-20), dueDate: offsetDate(-5), total: 90000, paid: 40000, status: "Overdue" },
  { id: "INV3", invoiceNo: "INV-9003", customerId: "C2", salesOrderId: "SO1", date: offsetDate(-14), dueDate: offsetDate(16), total: 360000, paid: 150000, status: "Partially Paid" },
  { id: "INV4", invoiceNo: "INV-9004", customerId: "C3", salesOrderId: "SO2", date: offsetDate(-9), dueDate: offsetDate(21), total: 110000, paid: 0, status: "Unpaid" },
  { id: "INV5", invoiceNo: "INV-9005", customerId: "C6", salesOrderId: null, date: offsetDate(-40), dueDate: offsetDate(-10), total: 45000, paid: 60000, status: "Overpaid — Credit" },
];

// Party ledgers — simplified running account per customer/vendor (the
// kind of ledger a small print shop actually keeps day to day), not a
// full double-entry general ledger. Balances are computed in store.js,
// never floored to zero — an overpayment must show as a credit, not "0".
export const LEDGER_ENTRIES = [
  { id: "LG1", date: offsetDate(-40), partyType: "customer", partyId: "C6", type: "Invoice", reference: "INV-9005", amount: 45000, description: "Fabric tag sample run" },
  { id: "LG2", date: offsetDate(-38), partyType: "customer", partyId: "C6", type: "Payment", reference: "RCPT-101", amount: -60000, description: "Payment received (bank transfer)" },
  { id: "LG3", date: offsetDate(-15), partyType: "customer", partyId: "C6", type: "Invoice", reference: "INV-9001", amount: 120000, description: "SO-1005 fabric care tags" },
  { id: "LG4", date: offsetDate(-13), partyType: "customer", partyId: "C6", type: "Payment", reference: "RCPT-104", amount: -120000, description: "Payment received (cheque)" },
  { id: "LG5", date: offsetDate(-20), partyType: "customer", partyId: "C1", type: "Invoice", reference: "INV-9002", amount: 90000, description: "SO-1004 product labels" },
  { id: "LG6", date: offsetDate(-10), partyType: "customer", partyId: "C1", type: "Payment", reference: "RCPT-102", amount: -40000, description: "Partial payment (cash)" },
  { id: "LG7", date: offsetDate(-14), partyType: "customer", partyId: "C2", type: "Invoice", reference: "INV-9003", amount: 360000, description: "SO-1001 milk pouch labels" },
  { id: "LG8", date: offsetDate(-7), partyType: "customer", partyId: "C2", type: "Payment", reference: "RCPT-103", amount: -150000, description: "Partial advance payment" },
  { id: "LG9", date: offsetDate(-9), partyType: "customer", partyId: "C3", type: "Invoice", reference: "INV-9004", amount: 110000, description: "SO-1002 book covers" },
  { id: "LG10", date: offsetDate(-16), partyType: "vendor", partyId: "V1", type: "Bill", reference: "PO-501", amount: 68000, description: "Art paper 130gsm — 8000 sheets" },
  { id: "LG11", date: offsetDate(-11), partyType: "vendor", partyId: "V1", type: "Payment", reference: "PYMT-201", amount: -68000, description: "Paid via bank transfer" },
  { id: "LG12", date: offsetDate(-10), partyType: "vendor", partyId: "V2", type: "Bill", reference: "PO-502", amount: 64000, description: "Cyan + Magenta ink" },
];

export const PDCS = [
  { id: "PDC1", chequeNo: "0442190", direction: "Receivable", partyType: "customer", partyId: "C4", bank: "Meezan Bank", amount: 80000, dueDate: offsetDate(4), status: "Pending" },
  { id: "PDC2", chequeNo: "0117823", direction: "Receivable", partyType: "customer", partyId: "C3", bank: "HBL", amount: 110000, dueDate: offsetDate(21), status: "Pending" },
  { id: "PDC3", chequeNo: "0993312", direction: "Payable", partyType: "vendor", partyId: "V3", bank: "UBL", amount: 40800, dueDate: offsetDate(11), status: "Pending" },
  { id: "PDC4", chequeNo: "0055214", direction: "Receivable", partyType: "customer", partyId: "C1", bank: "Bank Alfalah", amount: 50000, dueDate: offsetDate(-3), status: "Bounced" },
  { id: "PDC5", chequeNo: "0771122", direction: "Receivable", partyType: "customer", partyId: "C6", bank: "Meezan Bank", amount: 120000, dueDate: offsetDate(-13), status: "Cleared" },
];

// Audit log is intentionally NOT live — loaded on demand by the Audit
// Trail module, and would be paginated + auto-expired (e.g. 12 months)
// once this runs on real Firestore, to avoid paying for reads/storage on
// a collection almost nobody opens day to day.
export const AUDIT_LOG = [
  { id: "A1", ts: `${offsetDate(-13)}T09:15:00`, user: "Bilal Ahmed", action: "Created print job", module: "Printing", details: "PJ-2001 for SO-1001" },
  { id: "A2", ts: `${offsetDate(-9)}T11:02:00`, user: "Sara Khan", action: "Converted lead to customer", module: "CRM", details: "Al-Noor Traders (L4 → C1)" },
  { id: "A3", ts: `${offsetDate(-7)}T14:40:00`, user: "Nida Farooq", action: "Recorded payment", module: "Ledger", details: "RCPT-103, Rs 150,000 from Zaitoon Foods" },
  { id: "A4", ts: `${offsetDate(-5)}T10:20:00`, user: "Ahmed Raza", action: "Added user", module: "Users", details: "Created account for Nida Farooq (Accounts)" },
  { id: "A5", ts: `${offsetDate(-3)}T16:05:00`, user: "Bilal Ahmed", action: "Updated print job stage", module: "Printing", details: "PJ-2004 moved to Finishing" },
  { id: "A6", ts: `${offsetDate(-1)}T08:55:00`, user: "Sara Khan", action: "Created sales order", module: "Sales Orders", details: "SO-1006 for Bright Kids Stationers" },
];
