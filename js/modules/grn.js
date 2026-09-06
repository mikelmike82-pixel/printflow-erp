import { getGRNs, getVendorById, getWarehouses, getProductById } from "../core/store.js";
import { formatDate, escapeHtml } from "../core/format.js";
import { emptyState } from "../core/ui.js";

export function render(container) {
  const grns = getGRNs();
  const warehouses = getWarehouses();

  container.innerHTML = `
    <div class="page-header">
      <div><h1>Goods Receiving (GRN)</h1><div class="page-subtitle">${grns.length} receipts recorded</div></div>
    </div>
    ${grns.length === 0 ? emptyState("No goods received yet. Receive a Purchase Order to create a GRN.") : grns.map((g) => {
      const wh = warehouses.find((w) => w.id === g.warehouseId);
      return `
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div>
              <strong class="mono">${g.grnNo}</strong> — against PO ${escapeHtml(g.poId)}
              <div class="text-muted" style="font-size:12px;">${escapeHtml(getVendorById(g.vendorId)?.name || "—")} · ${wh?.name || "—"} · Received by ${escapeHtml(g.receivedBy)}</div>
            </div>
            <div class="text-muted">${formatDate(g.date)}</div>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Item</th><th class="num">Qty Received</th></tr></thead>
              <tbody>${g.items.map((i) => `<tr><td>${escapeHtml(getProductById(i.productId)?.name || i.productId)}</td><td class="num">${i.qty}</td></tr>`).join("")}</tbody>
            </table>
          </div>
        </div>`;
    }).join("")}
  `;
}
