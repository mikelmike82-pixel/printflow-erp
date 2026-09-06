import { getCurrentUser } from "../core/auth.js";
import {
  getLowStockProducts, getPrintJobs, getAllFollowUps, getInvoices,
  invoiceOutstanding, getTotalReceivables, getTotalCustomerCredit,
  getCustomerById, getVendorById, getPDCs, getSalesOrders,
} from "../core/store.js";
import { formatCurrency, formatDate, relativeDay, escapeHtml } from "../core/format.js";
import { navigateTo } from "../core/router.js";
import { emptyState } from "../core/ui.js";

export function render(container) {
  const user = getCurrentUser();
  const lowStock = getLowStockProducts();
  const printJobs = getPrintJobs();
  const activeJobs = printJobs.filter((j) => j.stage !== "Completed");
  const followUps = getAllFollowUps().sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const invoices = getInvoices();
  const overdue = invoices.filter((i) => i.status === "Overdue");
  const totalReceivables = getTotalReceivables();
  const totalCredit = getTotalCustomerCredit();
  const upcomingPdcs = getPDCs().filter((p) => p.status === "Pending").sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5);
  const openOrders = getSalesOrders().filter((s) => s.status !== "Completed");

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Welcome back, ${escapeHtml(user.name.split(" ")[0])}</h1>
        <div class="page-subtitle">Here's what's happening across the shop today.</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card ${totalReceivables > 300000 ? "warn" : ""}">
        <div class="kpi-label">Total Receivables</div>
        <div class="kpi-value">${formatCurrency(totalReceivables)}</div>
        <div class="kpi-meta">Owed by customers</div>
      </div>
      <div class="kpi-card ok">
        <div class="kpi-label">Customer Credit / Advance</div>
        <div class="kpi-value">${formatCurrency(totalCredit)}</div>
        <div class="kpi-meta">Held as credit, not owed to us</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Active Print Jobs</div>
        <div class="kpi-value">${activeJobs.length}</div>
        <div class="kpi-meta">${openOrders.length} open sales orders</div>
      </div>
      <div class="kpi-card ${overdue.length ? "danger" : ""}">
        <div class="kpi-label">Overdue Invoices</div>
        <div class="kpi-value">${overdue.length}</div>
        <div class="kpi-meta">${formatCurrency(overdue.reduce((s, i) => s + invoiceOutstanding(i), 0))} outstanding</div>
      </div>
      <div class="kpi-card ${lowStock.length ? "warn" : "ok"}">
        <div class="kpi-label">Low Stock Items</div>
        <div class="kpi-value">${lowStock.length}</div>
        <div class="kpi-meta">At or below reorder level</div>
      </div>
    </div>

    <div class="detail-grid">
      <div>
        <div class="card">
          <div class="card-title">Print Jobs In Progress</div>
          ${activeJobs.length === 0 ? emptyState("No active print jobs.") : `
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Job #</th><th>Customer</th><th>Description</th><th>Stage</th><th>Due</th></tr></thead>
              <tbody>
                ${activeJobs.slice(0, 6).map((j) => `
                  <tr class="row-link" data-job="${j.id}">
                    <td class="mono">${j.jobNo}</td>
                    <td>${escapeHtml(getCustomerById(j.customerId)?.name || "—")}</td>
                    <td>${escapeHtml(j.description)}</td>
                    <td><span class="badge badge-info">${j.stage}</span></td>
                    <td>${relativeDay(j.dueDate)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>`}
        </div>

        <div class="card">
          <div class="card-title">Upcoming Post-Dated Cheques</div>
          ${upcomingPdcs.length === 0 ? emptyState("No pending cheques.") : `
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Cheque #</th><th>Party</th><th>Direction</th><th>Due</th><th class="num">Amount</th></tr></thead>
              <tbody>
                ${upcomingPdcs.map((p) => `
                  <tr>
                    <td class="mono">${p.chequeNo}</td>
                    <td>${escapeHtml((p.partyType === "customer" ? getCustomerById(p.partyId)?.name : getVendorById(p.partyId)?.name) || p.partyId)}</td>
                    <td><span class="badge ${p.direction === "Receivable" ? "badge-success" : "badge-neutral"}">${p.direction}</span></td>
                    <td>${relativeDay(p.dueDate)}</td>
                    <td class="num">${formatCurrency(p.amount)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>`}
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-title">Follow-Ups Due</div>
          ${followUps.length === 0 ? emptyState("Nothing due — you're caught up.") : `
            <ul>
              ${followUps.slice(0, 6).map((f) => `
                <li class="info-row" style="cursor:pointer" data-lead="${f.leadId}">
                  <span class="label">${escapeHtml(f.leadName)}<br/><span class="text-muted">${escapeHtml(f.note)}</span></span>
                  <span class="value" style="color:${f.dueDate < todayMarker() ? "var(--danger-fg)" : "inherit"}">${relativeDay(f.dueDate)}</span>
                </li>
              `).join("")}
            </ul>
          `}
        </div>
        <div class="card">
          <div class="card-title">Low Stock</div>
          ${lowStock.length === 0 ? emptyState("All stock above reorder level.") : `
            <ul>
              ${lowStock.map((p) => `
                <li class="info-row">
                  <span class="label">${escapeHtml(p.name)}</span>
                  <span class="value" style="color:var(--warning-fg)">${Object.values(p.stock).reduce((a,b)=>a+b,0)} ${p.unit}</span>
                </li>
              `).join("")}
            </ul>
          `}
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll("[data-job]").forEach((el) => {
    el.addEventListener("click", () => navigateTo("printing", { job: el.dataset.job }));
  });
  container.querySelectorAll("[data-lead]").forEach((el) => {
    el.addEventListener("click", () => navigateTo("crm", { lead: el.dataset.lead }));
  });
}

function todayMarker() {
  // local import avoided to keep this file's top import list focused;
  // relativeDay already handles "overdue" labeling — this is just for color.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
