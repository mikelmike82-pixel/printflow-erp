// Reports — a landing page of report cards, each opening into its own
// filtered view (From/To date range, then a report-type/breakdown select)
// rather than one long scroll of every report at once. Built for someone
// who's mostly working in other design software and only dips in here
// occasionally — pick a card, pick a range, see the numbers.
//
// Cards cover what a small printing press actually needs day to day:
// what's selling and to whom (Sales), what's outstanding (Billing),
// what's owed to suppliers (Vendor), what customers owe (Customer), how
// each counter operator is doing (Staff Performance), and what's low on
// the shelf (Stock). Icons are plain monochrome line-art, not emoji —
// this is a working tool, not a consumer app.
import {
  getCustomerById, getPartyBalance, getCustomers, getVendors, getVendorById, getInvoices,
  getCounterJobs, getInvoiceById, getPrinterById, computeInvoiceTax, getPurchaseOrders, getProducts,
} from "../core/store.js";
import { MOCK_USERS } from "../core/auth.js";
import { formatCurrency, formatDate, escapeHtml } from "../core/format.js";
import { navigateTo } from "../core/router.js";

const ICONS = {
  sales: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V11M10 19V5M16 19V14M21 19H3"/><path d="M14 6l5-2 1 1"/></svg>`,
  billing: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/></svg>`,
  vendor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16V6a1 1 0 0 1 1-1h9v11"/><path d="M13 9h4l3 3v4h-2"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/></svg>`,
  customer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 2.7-5 6-5s6 2 6 5"/><circle cx="17.5" cy="9.5" r="2.2"/><path d="M15.8 15c2 .4 3.7 1.9 4.2 4.3"/></svg>`,
  staff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2.5"/><circle cx="9.5" cy="10" r="2"/><path d="M6.2 17c0-2 1.6-3.3 3.3-3.3s3.3 1.3 3.3 3.3"/><path d="M14.5 9l1.4 1.4L18.5 8"/></svg>`,
  stock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7.5L12 3 3 7.5l9 4.5 9-4.5z"/><path d="M3 7.5v9L12 21l9-4.5v-9"/><path d="M12 12v9"/></svg>`,
};

const REPORT_CARDS = [
  { key: "sales", icon: ICONS.sales, title: "Sales Report", description: "Revenue by customer, by printer, or an overall total — plus the tax breakdown, for any date range." },
  { key: "billing", icon: ICONS.billing, title: "Billing Report", description: "Every bill in a date range, filtered by paid / unpaid / overdue." },
  { key: "vendor", icon: ICONS.vendor, title: "Vendor Report", description: "What's owed to vendors, or purchase activity for a date range." },
  { key: "customer", icon: ICONS.customer, title: "Customer Report", description: "Customer balances, or sales activity for a date range." },
  { key: "staff", icon: ICONS.staff, title: "Staff Performance", description: "How many bills each user made at the Print Counter — click a name to see their bills." },
  { key: "stock", icon: ICONS.stock, title: "Stock Report", description: "Every raw material's current level against its reorder point." },
];

export function render(container, params) {
  if (params.report) renderReportDetail(container, params);
  else renderLanding(container);
}

function renderLanding(container) {
  container.innerHTML = `
    <div class="page-header">
      <div><h1>Reports</h1><div class="page-subtitle">Pick a report to open it</div></div>
    </div>
    <div class="report-card-grid">
      ${REPORT_CARDS.map((r) => `
        <div class="card report-card" data-report="${r.key}">
          <div class="report-card-icon">${r.icon}</div>
          <div class="card-title" style="margin-bottom:6px; text-transform:none; letter-spacing:normal; font-size:var(--text-md); color:var(--text-primary);">${r.title}</div>
          <div class="text-secondary" style="font-size:13px; line-height:1.5;">${r.description}</div>
        </div>
      `).join("")}
    </div>
  `;
  container.querySelectorAll("[data-report]").forEach((el) => {
    el.addEventListener("click", () => navigateTo("reports", { report: el.dataset.report }));
  });
}

// dateFilterApplies: false hides the From/To inputs for reports where a
// date range doesn't mean anything (Stock is always "right now").
const REPORT_META = {
  sales: { title: "Sales Report", dateFilterApplies: true, views: [["customer", "By Customer"], ["printer", "By Printer"], ["overall", "Overall Total"], ["tax", "Tax Summary"]] },
  billing: { title: "Billing Report", dateFilterApplies: true, views: [["all", "All Bills"], ["paid", "Paid Only"], ["unpaid", "Unpaid Only"], ["overdue", "Overdue Only"]] },
  vendor: { title: "Vendor Report", dateFilterApplies: true, views: [["balances", "Current Balances"], ["purchases", "Purchase Activity"]] },
  customer: { title: "Customer Report", dateFilterApplies: true, views: [["balances", "Current Balances"], ["sales", "Sales Activity"]] },
  staff: { title: "Staff Performance", dateFilterApplies: true, views: [["count", "By Bill Count"], ["revenue", "By Revenue"]] },
  stock: { title: "Stock Report", dateFilterApplies: false, views: [["all", "All Items"], ["low", "Low Stock Only"]] },
};

function inRange(dateStr, from, to) {
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}

function renderReportDetail(container, params) {
  const reportKey = params.report;
  const meta = REPORT_META[reportKey];
  if (!meta) { navigateTo("reports"); return; }
  const drillUserId = reportKey === "staff" ? params.user : null;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div style="margin-bottom:6px;"><a href="#/reports">&larr; Back to Reports</a></div>
        <h1>${meta.title}</h1>
        <div class="page-subtitle">Select ${meta.dateFilterApplies ? "a date range and " : ""}a view, then generate</div>
      </div>
      <div class="page-actions"><button class="btn btn-secondary btn-sm" id="print-report-btn">Print</button></div>
    </div>
    <div class="card">
      <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:end;">
        ${meta.dateFilterApplies ? `
          <div class="form-field" style="margin:0;"><label>From</label><input type="date" id="rp-from" /></div>
          <div class="form-field" style="margin:0;"><label>To</label><input type="date" id="rp-to" /></div>
        ` : ""}
        <div class="form-field" style="margin:0;">
          <label>View</label>
          <select id="rp-view">${meta.views.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
        </div>
        <button class="btn btn-primary" id="rp-generate">Generate Report</button>
        ${meta.dateFilterApplies ? `<button class="btn btn-ghost" id="rp-clear">Clear Dates</button>` : ""}
      </div>
      ${meta.dateFilterApplies ? `<div class="hint" style="margin-top:10px;">Leave From/To blank to include everything on record.</div>` : ""}
    </div>
    <div id="rp-results" style="margin-top:16px;"></div>
  `;

  const run = () => {
    const from = meta.dateFilterApplies ? container.querySelector("#rp-from").value : "";
    const to = meta.dateFilterApplies ? container.querySelector("#rp-to").value : "";
    const view = container.querySelector("#rp-view").value;
    const resultsEl = container.querySelector("#rp-results");
    resultsEl.innerHTML = buildReportHtml(reportKey, view, from, to, drillUserId);
    resultsEl.querySelectorAll("[data-invoice]").forEach((el) => {
      el.addEventListener("click", () => navigateTo("invoicing", { invoice: el.dataset.invoice }));
    });
    resultsEl.querySelectorAll("[data-job]").forEach((el) => {
      el.addEventListener("click", () => navigateTo("print-counter", { job: el.dataset.job }));
    });
    resultsEl.querySelectorAll("[data-user]").forEach((el) => {
      el.addEventListener("click", () => navigateTo("reports", { report: "staff", user: el.dataset.user }));
    });
  };

  container.querySelector("#rp-generate").addEventListener("click", run);
  if (meta.dateFilterApplies) {
    container.querySelector("#rp-clear").addEventListener("click", () => {
      container.querySelector("#rp-from").value = "";
      container.querySelector("#rp-to").value = "";
      run();
    });
  }
  container.querySelector("#print-report-btn").addEventListener("click", () => window.print());

  run();
}

function summaryRow(label, value) {
  return `<div class="info-row"><span class="label">${label}</span><span class="value"><strong>${value}</strong></span></div>`;
}

function tableCard(title, headHtml, rowsHtml, emptyMsg) {
  return `
    <div class="card">
      <div class="card-title">${title}</div>
      ${rowsHtml ? `
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>${headHtml}</tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>` : `<div class="text-muted" style="font-size:13px;">${emptyMsg}</div>`}
    </div>`;
}

function buildReportHtml(reportKey, view, from, to, drillUserId) {
  if (reportKey === "sales") return buildSalesReport(view, from, to);
  if (reportKey === "billing") return buildBillingReport(view, from, to);
  if (reportKey === "vendor") return buildVendorReport(view, from, to);
  if (reportKey === "customer") return buildCustomerReport(view, from, to);
  if (reportKey === "staff") return buildStaffReport(view, from, to, drillUserId);
  if (reportKey === "stock") return buildStockReport(view);
  return "";
}

// --- Sales Report ---------------------------------------------------------
function buildSalesReport(view, from, to) {
  const invoices = getInvoices().filter((i) => inRange(i.date, from, to));
  const totalSales = invoices.reduce((s, i) => s + i.total, 0);

  if (view === "tax") {
    const customers = getCustomers();
    const vendors = getVendors();
    const gstCustomers = customers.filter((c) => c.gstStatus === "Registered");
    const registeredVendors = vendors.filter((v) => v.salesTaxStatus === "Registered");
    const taxBreakdown = invoices.reduce((acc, i) => {
      const t = computeInvoiceTax(i);
      if (t.applies) { acc.taxCollected += t.taxAmount; acc.gstSales += t.subtotal; }
      else acc.nonGstSales += i.total;
      return acc;
    }, { taxCollected: 0, gstSales: 0, nonGstSales: 0 });
    return `
      <div class="card">
        <div class="card-title">Tax Summary — ${invoices.length} bill(s)</div>
        ${summaryRow("GST-Registered Customers", `${gstCustomers.length} of ${customers.length}`)}
        ${summaryRow("Sales Tax Registered Vendors", `${registeredVendors.length} of ${vendors.length}`)}
        ${summaryRow("GST Sales (excl. tax)", formatCurrency(taxBreakdown.gstSales))}
        ${summaryRow("Non-GST Sales", formatCurrency(taxBreakdown.nonGstSales))}
        ${summaryRow("Total Sales Tax Collected", formatCurrency(taxBreakdown.taxCollected))}
      </div>`;
  }

  if (view === "overall") {
    const taxCollected = invoices.reduce((s, i) => s + computeInvoiceTax(i).taxAmount, 0);
    return `
      <div class="card">
        <div class="card-title">Overall Sales — ${invoices.length} bill(s)</div>
        ${summaryRow("Total Sales", formatCurrency(totalSales))}
        ${summaryRow("Sales Tax Collected", formatCurrency(taxCollected))}
        ${summaryRow("Average Bill", formatCurrency(invoices.length ? totalSales / invoices.length : 0))}
      </div>`;
  }

  if (view === "printer") {
    const byPrinter = {};
    getCounterJobs().forEach((job) => {
      const invoice = invoices.find((i) => i.id === job.invoiceId);
      if (!invoice) return;
      const name = getPrinterById(job.printerId)?.name || "Unknown printer";
      byPrinter[name] = (byPrinter[name] || 0) + invoice.total;
    });
    const rows = Object.entries(byPrinter).sort((a, b) => b[1] - a[1]);
    return tableCard(
      `Sales by Printer — ${formatCurrency(totalSales)} total`,
      `<th>Printer</th><th class="num">Total Sales</th>`,
      rows.map(([name, total]) => `<tr><td>${escapeHtml(name)}</td><td class="num">${formatCurrency(total)}</td></tr>`).join(""),
      "No print counter jobs in this range."
    );
  }

  // by customer (default)
  const byCustomer = {};
  invoices.forEach((i) => {
    const name = getCustomerById(i.customerId)?.name || i.walkInName || "Walk-in";
    byCustomer[name] = (byCustomer[name] || 0) + i.total;
  });
  const rows = Object.entries(byCustomer).sort((a, b) => b[1] - a[1]);
  return tableCard(
    `Sales by Customer — ${formatCurrency(totalSales)} total`,
    `<th>Customer</th><th class="num">Total Sales</th>`,
    rows.map(([name, total]) => `<tr><td>${escapeHtml(name)}</td><td class="num">${formatCurrency(total)}</td></tr>`).join(""),
    "No bills in this range."
  );
}

// --- Billing Report --------------------------------------------------------
function buildBillingReport(view, from, to) {
  let invoices = getInvoices().filter((i) => inRange(i.date, from, to));
  if (view === "paid") invoices = invoices.filter((i) => i.status === "Paid" || i.status === "Overpaid — Credit");
  if (view === "unpaid") invoices = invoices.filter((i) => !["Paid", "Overpaid — Credit"].includes(i.status));
  if (view === "overdue") invoices = invoices.filter((i) => i.status === "Overdue");

  const total = invoices.reduce((s, i) => s + i.total, 0);
  const collected = invoices.reduce((s, i) => s + i.paid, 0);
  const outstanding = total - collected;

  return `
    <div class="card">
      <div class="card-title">Summary — ${invoices.length} bill(s)</div>
      ${summaryRow("Total Billed", formatCurrency(total))}
      ${summaryRow("Total Collected", formatCurrency(collected))}
      ${summaryRow("Outstanding", formatCurrency(outstanding))}
    </div>
    ${tableCard(
      "Bills",
      `<th>Bill #</th><th>Customer</th><th>Date</th><th class="num">Total</th><th class="num">Paid</th><th>Status</th>`,
      invoices.sort((a, b) => b.date.localeCompare(a.date)).map((i) => `
        <tr class="row-link" data-invoice="${i.id}">
          <td class="mono">${i.invoiceNo}</td>
          <td>${escapeHtml(getCustomerById(i.customerId)?.name || i.walkInName || "—")}</td>
          <td>${formatDate(i.date)}</td>
          <td class="num">${formatCurrency(i.total)}</td>
          <td class="num">${formatCurrency(i.paid)}</td>
          <td><span class="badge badge-neutral">${i.status}</span></td>
        </tr>`).join(""),
      "No bills match this filter."
    )}
  `;
}

// --- Vendor Report ---------------------------------------------------------
function buildVendorReport(view, from, to) {
  const vendors = getVendors();
  if (view === "purchases") {
    const orders = getPurchaseOrders().filter((po) => inRange(po.date, from, to));
    const total = orders.reduce((s, po) => s + po.total, 0);
    return `
      <div class="card">
        <div class="card-title">Summary — ${orders.length} purchase order(s)</div>
        ${summaryRow("Total Purchased", formatCurrency(total))}
      </div>
      ${tableCard(
        "Purchase Orders",
        `<th>PO #</th><th>Vendor</th><th>Date</th><th>Status</th><th class="num">Total</th>`,
        orders.sort((a, b) => b.date.localeCompare(a.date)).map((po) => `
          <tr><td class="mono">${po.poNo}</td><td>${escapeHtml(getVendorById(po.vendorId)?.name || "—")}</td><td>${formatDate(po.date)}</td><td><span class="badge badge-neutral">${po.status}</span></td><td class="num">${formatCurrency(po.total)}</td></tr>
        `).join(""),
        "No purchase orders in this range."
      )}
    `;
  }

  // balances (current standing — not date-filtered, a balance is always "as of now")
  const rows = vendors.map((v) => ({ name: v.name, balance: getPartyBalance("vendor", v.id) })).filter((r) => r.balance !== 0).sort((a, b) => b.balance - a.balance);
  const totalPayable = rows.reduce((s, r) => s + Math.max(0, r.balance), 0);
  return `
    <div class="card">
      <div class="card-title">Summary</div>
      ${summaryRow("Total Payable", formatCurrency(totalPayable))}
    </div>
    ${tableCard(
      "Vendor Balances",
      `<th>Vendor</th><th class="num">Balance</th>`,
      rows.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td class="num">${r.balance > 0 ? formatCurrency(r.balance) : `<span class="badge badge-success">Credit ${formatCurrency(-r.balance)}</span>`}</td></tr>`).join(""),
      "All vendor accounts are settled."
    )}
  `;
}

// --- Customer Report --------------------------------------------------------
function buildCustomerReport(view, from, to) {
  const customers = getCustomers();
  if (view === "sales") {
    const invoices = getInvoices().filter((i) => inRange(i.date, from, to));
    const byCustomer = {};
    invoices.forEach((i) => {
      const name = getCustomerById(i.customerId)?.name || i.walkInName || "Walk-in";
      byCustomer[name] = (byCustomer[name] || 0) + i.total;
    });
    const rows = Object.entries(byCustomer).sort((a, b) => b[1] - a[1]);
    const total = invoices.reduce((s, i) => s + i.total, 0);
    return `
      <div class="card">
        <div class="card-title">Summary — ${invoices.length} bill(s)</div>
        ${summaryRow("Total Sales", formatCurrency(total))}
      </div>
      ${tableCard(
        "Sales by Customer",
        `<th>Customer</th><th class="num">Total Sales</th>`,
        rows.map(([name, t]) => `<tr><td>${escapeHtml(name)}</td><td class="num">${formatCurrency(t)}</td></tr>`).join(""),
        "No bills in this range."
      )}
    `;
  }

  // balances (current standing)
  const rows = customers.map((c) => ({ name: c.name, balance: getPartyBalance("customer", c.id) })).filter((r) => r.balance !== 0).sort((a, b) => b.balance - a.balance);
  const totalReceivable = rows.reduce((s, r) => s + Math.max(0, r.balance), 0);
  return `
    <div class="card">
      <div class="card-title">Summary</div>
      ${summaryRow("Total Receivable", formatCurrency(totalReceivable))}
    </div>
    ${tableCard(
      "Customer Balances",
      `<th>Customer</th><th class="num">Balance</th>`,
      rows.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td class="num">${r.balance > 0 ? formatCurrency(r.balance) : `<span class="badge badge-success">Credit ${formatCurrency(-r.balance)}</span>`}</td></tr>`).join(""),
      "All customer accounts are settled."
    )}
  `;
}

// --- Staff Performance Report ----------------------------------------------
// Every Print Counter job records who created it (job.createdBy — see
// createCounterJob in store.js), so "how many bills did this person make"
// is just a count of counter jobs per user, joined to the invoice each
// job created for the revenue figure. Clicking a staff member drills into
// their own list of bills, each of which opens the real job/bill record.
function buildStaffReport(view, from, to, drillUserId) {
  const jobs = getCounterJobs().filter((j) => inRange(j.createdAt, from, to));

  if (drillUserId) {
    const user = MOCK_USERS.find((u) => u.id === drillUserId);
    if (!user) return `<div class="card"><div class="text-muted">User not found.</div></div>`;
    const userJobs = jobs.filter((j) => j.createdBy === user.name).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = userJobs.reduce((s, j) => s + (getInvoiceById(j.invoiceId)?.total || 0), 0);
    return `
      <div style="margin-bottom:12px;"><a href="#/reports?report=staff">&larr; Back to Staff Performance</a></div>
      <div class="card">
        <div class="card-title">${escapeHtml(user.name)} (${escapeHtml(user.title)}) — ${userJobs.length} bill(s)</div>
        ${summaryRow("Total Billed", formatCurrency(total))}
      </div>
      ${tableCard(
        "Bills Created",
        `<th>Job #</th><th>Bill #</th><th>Customer</th><th>Date</th><th class="num">Total</th><th>Status</th>`,
        userJobs.map((j) => {
          const inv = getInvoiceById(j.invoiceId);
          const customerName = j.customerType === "Walk-in" ? (j.walkInName || "Walk-in Customer") : (getCustomerById(j.customerId)?.name || "—");
          return `
            <tr class="row-link" data-job="${j.id}">
              <td class="mono">${j.jobNo}</td>
              <td class="mono">${inv?.invoiceNo || "—"}</td>
              <td>${escapeHtml(customerName)}</td>
              <td>${formatDate(j.createdAt)}</td>
              <td class="num">${formatCurrency(inv?.total || 0)}</td>
              <td><span class="badge badge-neutral">${inv?.status || "—"}</span></td>
            </tr>`;
        }).join(""),
        "No bills in this range."
      )}
    `;
  }

  const byUser = new Map(MOCK_USERS.map((u) => [u.id, { user: u, count: 0, total: 0 }]));
  jobs.forEach((j) => {
    const user = MOCK_USERS.find((u) => u.name === j.createdBy);
    if (!user) return;
    const entry = byUser.get(user.id);
    entry.count += 1;
    entry.total += getInvoiceById(j.invoiceId)?.total || 0;
  });
  const rows = [...byUser.values()].filter((r) => r.count > 0);
  rows.sort((a, b) => (view === "revenue" ? b.total - a.total : b.count - a.count));

  return tableCard(
    "Bills by Staff Member — click a name to see their bills",
    `<th>Name</th><th>Role</th><th class="num">Bills</th><th class="num">Total Revenue</th>`,
    rows.map((r) => `
      <tr class="row-link" data-user="${r.user.id}">
        <td>${escapeHtml(r.user.name)}</td>
        <td>${escapeHtml(r.user.title)}</td>
        <td class="num">${r.count}</td>
        <td class="num">${formatCurrency(r.total)}</td>
      </tr>`).join(""),
    "No print counter jobs in this range."
  );
}

// --- Stock Report ------------------------------------------------------------
function buildStockReport(view) {
  let products = getProducts();
  const lowCount = products.filter((p) => Object.values(p.stock).reduce((a, b) => a + b, 0) <= p.reorderLevel).length;
  if (view === "low") products = products.filter((p) => Object.values(p.stock).reduce((a, b) => a + b, 0) <= p.reorderLevel);

  return `
    <div class="card">
      <div class="card-title">Summary</div>
      ${summaryRow("Total Items Tracked", getProducts().length)}
      ${summaryRow("Low Stock Items", lowCount)}
    </div>
    ${tableCard(
      "Stock Levels",
      `<th>SKU</th><th>Name</th><th>Category</th><th class="num">In Stock</th><th class="num">Reorder Level</th><th>Status</th>`,
      products.map((p) => {
        const total = Object.values(p.stock).reduce((a, b) => a + b, 0);
        const low = total <= p.reorderLevel;
        return `
          <tr>
            <td class="mono">${p.sku}</td>
            <td>${escapeHtml(p.name)}</td>
            <td>${escapeHtml(p.category)}</td>
            <td class="num">${total.toLocaleString()} ${escapeHtml(p.unit)}</td>
            <td class="num">${p.reorderLevel.toLocaleString()}</td>
            <td>${low ? `<span class="badge badge-warning">Low Stock</span>` : `<span class="badge badge-success">OK</span>`}</td>
          </tr>`;
      }).join(""),
      "No items match this filter."
    )}
  `;
}
