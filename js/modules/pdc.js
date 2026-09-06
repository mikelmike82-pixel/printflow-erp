import { getPDCs, getCustomerById, getVendorById } from "../core/store.js";
import { formatCurrency, formatDate, relativeDay, escapeHtml } from "../core/format.js";
import { emptyState } from "../core/ui.js";

const STATUS_TONE = { Pending: "warning", Cleared: "success", Bounced: "danger" };

function partyName(pdc) {
  return pdc.partyType === "customer" ? getCustomerById(pdc.partyId)?.name : getVendorById(pdc.partyId)?.name;
}

export function render(container) {
  const pdcs = [...getPDCs()].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const receivable = pdcs.filter((p) => p.direction === "Receivable" && p.status === "Pending").reduce((s, p) => s + p.amount, 0);
  const payable = pdcs.filter((p) => p.direction === "Payable" && p.status === "Pending").reduce((s, p) => s + p.amount, 0);
  const bounced = pdcs.filter((p) => p.status === "Bounced");

  container.innerHTML = `
    <div class="page-header">
      <div><h1>Post-Dated Cheques</h1><div class="page-subtitle">${pdcs.length} cheques tracked</div></div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Pending Receivable</div>
        <div class="kpi-value">${formatCurrency(receivable)}</div>
      </div>
      <div class="kpi-card warn">
        <div class="kpi-label">Pending Payable</div>
        <div class="kpi-value">${formatCurrency(payable)}</div>
      </div>
      <div class="kpi-card ${bounced.length ? "danger" : "ok"}">
        <div class="kpi-label">Bounced Cheques</div>
        <div class="kpi-value">${bounced.length}</div>
      </div>
    </div>

    ${pdcs.length === 0 ? emptyState("No cheques on file.") : `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Cheque #</th><th>Party</th><th>Direction</th><th>Bank</th><th>Due Date</th><th class="num">Amount</th><th>Status</th></tr></thead>
          <tbody>
            ${pdcs.map((p) => `
              <tr>
                <td class="mono">${p.chequeNo}</td>
                <td>${escapeHtml(partyName(p) || "—")}</td>
                <td><span class="badge ${p.direction === "Receivable" ? "badge-success" : "badge-neutral"}">${p.direction}</span></td>
                <td>${escapeHtml(p.bank)}</td>
                <td>${formatDate(p.dueDate)} <span class="text-muted">(${relativeDay(p.dueDate)})</span></td>
                <td class="num">${formatCurrency(p.amount)}</td>
                <td><span class="badge badge-${STATUS_TONE[p.status] || "neutral"}">${p.status}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>`}
  `;
}
