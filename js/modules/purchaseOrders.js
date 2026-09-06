import { getPurchaseOrders, getPurchaseOrderById, getVendorById, getProductById, getWarehouses, receiveGRN } from "../core/store.js";
import { formatCurrency, formatDate, escapeHtml } from "../core/format.js";
import { navigateTo } from "../core/router.js";
import { confirmAction, openModal, closeModal, toast, emptyState } from "../core/ui.js";

const STATUS_TONE = { Pending: "warning", Received: "success" };

export function render(container, params) {
  if (params.order) renderDetail(container, params.order);
  else renderList(container);
}

function renderList(container) {
  const orders = getPurchaseOrders();
  container.innerHTML = `
    <div class="page-header">
      <div><h1>Purchase Orders</h1><div class="page-subtitle">${orders.length} purchase orders to vendors</div></div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>PO #</th><th>Vendor</th><th>Date</th><th>Status</th><th class="num">Total</th></tr></thead>
        <tbody>
          ${orders.map((o) => `
            <tr class="row-link" data-order="${o.id}">
              <td class="mono">${o.poNo}</td>
              <td>${escapeHtml(getVendorById(o.vendorId)?.name || "—")}</td>
              <td>${formatDate(o.date)}</td>
              <td><span class="badge badge-${STATUS_TONE[o.status]}">${o.status}</span></td>
              <td class="num">${formatCurrency(o.total)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
  container.querySelectorAll("[data-order]").forEach((el) => {
    el.addEventListener("click", () => navigateTo("purchase-orders", { order: el.dataset.order }));
  });
}

function renderDetail(container, orderId) {
  const po = getPurchaseOrderById(orderId);
  if (!po) { container.innerHTML = emptyState("Purchase order not found."); return; }
  const vendor = getVendorById(po.vendorId);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div style="margin-bottom:6px;"><a href="#/purchase-orders">&larr; Back to purchase orders</a></div>
        <h1>${po.poNo}</h1>
        <div class="page-subtitle">${escapeHtml(vendor?.name || "—")} · ${formatDate(po.date)}</div>
      </div>
      <div class="page-actions">
        <span class="badge badge-${STATUS_TONE[po.status]}">${po.status}</span>
        ${po.status === "Pending" ? `<button class="btn btn-primary" id="receive-btn">Receive (Create GRN)</button>` : ""}
      </div>
    </div>
    <div class="card">
      <div class="card-title">Items</div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
          <tbody>
            ${po.items.map((i) => `
              <tr><td>${escapeHtml(i.description || getProductById(i.productId)?.name || i.productId)}</td><td class="num">${i.qty}</td><td class="num">${formatCurrency(i.rate)}</td><td class="num">${formatCurrency(i.qty * i.rate)}</td></tr>
            `).join("")}
            <tr><td colspan="3" class="num"><strong>Total</strong></td><td class="num"><strong>${formatCurrency(po.total)}</strong></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  const receiveBtn = container.querySelector("#receive-btn");
  if (receiveBtn) {
    receiveBtn.addEventListener("click", () => {
      const warehouses = getWarehouses();
      openModal({
        title: "Receive Goods (GRN)",
        bodyHtml: `
          <p class="text-secondary" style="font-size:13px; margin-bottom:12px;">Receiving against ${po.poNo} will add stock to the selected warehouse.</p>
          <div class="form-field">
            <label>Receiving Warehouse</label>
            <select id="wh-select">${warehouses.map((w) => `<option value="${w.id}">${w.name}</option>`).join("")}</select>
          </div>
          <div class="form-actions">
            <button class="btn btn-secondary" data-close-modal>Cancel</button>
            <button class="btn btn-primary" id="confirm-receive">Confirm Receipt</button>
          </div>
        `,
        onMount: (root) => {
          root.querySelector("[data-close-modal]").addEventListener("click", closeModal);
          root.querySelector("#confirm-receive").addEventListener("click", () => {
            const warehouseId = root.querySelector("#wh-select").value;
            closeModal();
            receiveGRN(po.id, warehouseId);
            toast("GRN created and stock updated.", "success");
            renderDetail(container, orderId);
          });
        },
      });
    });
  }
}
