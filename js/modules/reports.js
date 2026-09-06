import { getSalesOrders, getCustomerById, getPartyBalance, getCustomers, getPrintJobs, PRINT_JOB_STAGES } from "../core/store.js";
import { formatCurrency, escapeHtml } from "../core/format.js";

export function render(container) {
  const orders = getSalesOrders();
  const byCustomer = {};
  orders.forEach((o) => {
    byCustomer[o.customerId] = (byCustomer[o.customerId] || 0) + o.total;
  });
  const salesRows = Object.entries(byCustomer)
    .map(([customerId, total]) => ({ name: getCustomerById(customerId)?.name || customerId, total }))
    .sort((a, b) => b.total - a.total);

  const receivables = getCustomers()
    .map((c) => ({ name: c.name, balance: getPartyBalance("customer", c.id) }))
    .filter((r) => r.balance !== 0)
    .sort((a, b) => b.balance - a.balance);

  const jobs = getPrintJobs();
  const stageCounts = PRINT_JOB_STAGES.map((s) => ({ stage: s, count: jobs.filter((j) => j.stage === s).length }));

  container.innerHTML = `
    <div class="page-header">
      <div><h1>Reports</h1><div class="page-subtitle">Quick summary reports from current data</div></div>
    </div>

    <div class="detail-grid">
      <div>
        <div class="card">
          <div class="card-title">Sales by Customer</div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Customer</th><th class="num">Total Sales</th></tr></thead>
              <tbody>${salesRows.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td class="num">${formatCurrency(r.total)}</td></tr>`).join("")}</tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Print Jobs by Stage</div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Stage</th><th class="num">Jobs</th></tr></thead>
              <tbody>${stageCounts.map((r) => `<tr><td>${r.stage}</td><td class="num">${r.count}</td></tr>`).join("")}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-title">Customer Balances</div>
          ${receivables.length === 0 ? `<div class="text-muted" style="font-size:13px;">All accounts settled.</div>` : `
            <ul>
              ${receivables.map((r) => `
                <li class="info-row">
                  <span class="label">${escapeHtml(r.name)}</span>
                  <span class="value">${r.balance > 0 ? formatCurrency(r.balance) : `<span class="badge badge-success">Credit ${formatCurrency(-r.balance)}</span>`}</span>
                </li>`).join("")}
            </ul>`}
        </div>
      </div>
    </div>
  `;
}
