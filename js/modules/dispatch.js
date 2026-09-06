import { getDispatches, getCustomerById, getSalesOrderById } from "../core/store.js";
import { formatDate, escapeHtml } from "../core/format.js";
import { navigateTo } from "../core/router.js";
import { emptyState } from "../core/ui.js";

const STATUS_TONE = { Pending: "warning", Delivered: "success" };

export function render(container) {
  const dispatches = getDispatches();
  container.innerHTML = `
    <div class="page-header">
      <div><h1>Dispatch / Delivery Challans</h1><div class="page-subtitle">${dispatches.length} delivery challans</div></div>
    </div>
    ${dispatches.length === 0 ? emptyState("No dispatches recorded yet.") : `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Challan #</th><th>Customer</th><th>Sales Order</th><th>Vehicle</th><th>Date</th><th>Status</th></tr></thead>
          <tbody>
            ${dispatches.map((d) => `
              <tr>
                <td class="mono">${d.challanNo}</td>
                <td>${escapeHtml(getCustomerById(d.customerId)?.name || "—")}</td>
                <td><a href="#/sales-orders?order=${d.salesOrderId}">${getSalesOrderById(d.salesOrderId)?.orderNo || "—"}</a></td>
                <td>${escapeHtml(d.vehicle || "—")}</td>
                <td>${formatDate(d.date)}</td>
                <td><span class="badge badge-${STATUS_TONE[d.status] || "neutral"}">${d.status}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>`}
  `;
}
