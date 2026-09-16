import { getCurrentUser } from "../core/auth.js";
import {
  getLowStockProducts, getInvoices, getCounterJobs, getPrinterById,
  invoiceOutstanding, getTotalReceivables, getTotalPayables,
  getCustomerById,
} from "../core/store.js";
import { formatCurrency, formatDate, relativeDay, escapeHtml, todayLocalISO } from "../core/format.js";
import { navigateTo } from "../core/router.js";
import { emptyState } from "../core/ui.js";

export function render(container) {
  const user = getCurrentUser();
  const today = todayLocalISO();
  const lowStock = getLowStockProducts();
  const invoices = getInvoices();
  const overdue = invoices.filter((i) => i.status === "Overdue");
  const totalReceivables = getTotalReceivables();
  const totalPayables = getTotalPayables();

  // "Today" is judged by the bill's own date field, not creation timestamp
  // — every bill in this app is created same-day at the counter, so this
  // is simply "today's walk-in business" at a glance.
  const todaysBills = invoices.filter((i) => i.date === today);
  const todaysSales = todaysBills.reduce((sum, i) => sum + i.total, 0);
  const recentBills = [...invoices].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 8);
  const overdueSorted = [...overdue].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  function alertBadge(count, tone, label) {
    if (!count) return "";
    return `<span class="reminder-badge ${tone}">${count} ${label}</span>`;
  }

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Welcome back, ${escapeHtml(user.name.split(" ")[0])}</h1>
        <div class="page-subtitle">Here's what's happening at the counter today.</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card ok">
        <div class="kpi-label">Today's Sales</div>
        <div class="kpi-value">${formatCurrency(todaysSales)}</div>
        <div class="kpi-meta">${todaysBills.length} bill${todaysBills.length === 1 ? "" : "s"} today</div>
      </div>
      <div class="kpi-card ${totalReceivables > 300000 ? "warn" : ""}">
        <div class="kpi-label">Total Receivables</div>
        <div class="kpi-value">${formatCurrency(totalReceivables)}</div>
        <div class="kpi-meta">Owed by customers</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Payables</div>
        <div class="kpi-value">${formatCurrency(totalPayables)}</div>
        <div class="kpi-meta">Owed to vendors</div>
      </div>
      <div class="kpi-card ${overdue.length ? "danger" : ""}">
        <div class="kpi-label">Overdue Bills</div>
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
          <div class="card-title">Recent Bills</div>
          ${recentBills.length === 0 ? emptyState("No bills yet — they'll show up here as soon as a print job is billed.") : `
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Bill #</th><th>Customer</th><th>Printer</th><th>Date</th><th class="num">Total</th><th>Status</th></tr></thead>
              <tbody>
                ${recentBills.map((i) => {
                  const job = getCounterJobs().find((j) => j.id === i.printJobId);
                  const printerName = job ? getPrinterById(job.printerId)?.name : null;
                  return `
                  <tr class="row-link" data-invoice="${i.id}">
                    <td class="mono">${i.invoiceNo}</td>
                    <td>${escapeHtml(getCustomerById(i.customerId)?.name || i.walkInName || "—")}</td>
                    <td>${escapeHtml(printerName || "—")}</td>
                    <td>${formatDate(i.date)}</td>
                    <td class="num">${formatCurrency(i.total)}</td>
                    <td><span class="badge badge-${i.status === "Paid" ? "success" : i.status === "Overdue" ? "danger" : "neutral"}">${i.status}</span></td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>`}
        </div>
      </div>

      <div>
        <div class="card ${overdueSorted.length ? "reminder-card has-danger" : ""}">
          <div class="card-title" style="display:flex; align-items:center; gap:8px;">
            <span>Overdue Bills</span>
            ${alertBadge(overdueSorted.length, "danger", "overdue")}
          </div>
          ${overdueSorted.length === 0 ? emptyState("All bills current.") : `
            <ul>
              ${overdueSorted.slice(0, 6).map((i) => `
                <li class="info-row row-link" data-invoice="${i.id}" style="cursor:pointer;">
                  <span class="label">${i.invoiceNo}<br/><span class="text-muted">${escapeHtml(getCustomerById(i.customerId)?.name || "—")}</span></span>
                  <span class="value" style="color:var(--danger-fg);">${formatCurrency(invoiceOutstanding(i))}<br/><span style="font-weight:400; font-size:11px;">${relativeDay(i.dueDate)}</span></span>
                </li>
              `).join("")}
            </ul>
          `}
        </div>

        <div class="card ${lowStock.length ? "reminder-card has-warn" : ""}">
          <div class="card-title" style="display:flex; align-items:center; gap:8px;">
            <span>Low Stock</span>
            ${alertBadge(lowStock.length, "warn", "low")}
          </div>
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

  container.querySelectorAll("[data-invoice]").forEach((el) => {
    el.addEventListener("click", () => navigateTo("invoicing", { invoice: el.dataset.invoice }));
  });
}
