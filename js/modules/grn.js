import {
  getGRNs, getGRNById, getVendorById, getWarehouses, getProductById, getPurchaseOrders, getPurchaseOrderById,
  deleteGRN, updateGRN, poRemainingQty,
} from "../core/store.js";
import { formatDate, escapeHtml } from "../core/format.js";
import { navigateTo } from "../core/router.js";
import { emptyState, openModal, closeModal, toast, confirmAction } from "../core/ui.js";
import { getCurrentUser } from "../core/auth.js";
import { openReceiveModal } from "./purchaseOrders.js";

function canManage() {
  return getCurrentUser()?.role === "ADMIN";
}

export function render(container, params) {
  if (params.grn) renderDetail(container, params.grn);
  else renderList(container);
}

function renderList(container) {
  const grns = [...getGRNs()].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const manage = canManage();

  container.innerHTML = `
    <div class="page-header">
      <div><h1>Goods Receiving (GRN)</h1><div class="page-subtitle">${grns.length} receipts recorded</div></div>
      <div class="page-actions">${manage ? `<button class="btn btn-primary" id="new-grn-btn">+ New GRN</button>` : ""}</div>
    </div>
    ${grns.length === 0 ? emptyState("No goods received yet.") : `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>GRN #</th><th>Against PO</th><th>Vendor</th><th>Warehouse</th><th>Received By</th><th class="num">Items</th><th>Date</th></tr></thead>
          <tbody>
            ${grns.map((g) => {
              const wh = getWarehouses().find((w) => w.id === g.warehouseId);
              const po = getPurchaseOrderById(g.poId);
              return `
              <tr class="row-link" data-grn="${g.id}">
                <td class="mono">${g.grnNo}</td>
                <td class="mono">${escapeHtml(po?.poNo || g.poId)}</td>
                <td>${escapeHtml(getVendorById(g.vendorId)?.name || "—")}</td>
                <td>${escapeHtml(wh?.name || "—")}</td>
                <td>${escapeHtml(g.receivedBy)}</td>
                <td class="num">${g.items.length}</td>
                <td>${formatDate(g.date)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`}
  `;

  container.querySelectorAll("[data-grn]").forEach((el) => {
    el.addEventListener("click", () => navigateTo("grn", { grn: el.dataset.grn }));
  });

  const newBtn = container.querySelector("#new-grn-btn");
  if (newBtn) newBtn.addEventListener("click", () => openPickPOModal(container));
}

function openPickPOModal(container) {
  const receivable = getPurchaseOrders().filter((po) => po.status !== "Received");
  if (receivable.length === 0) { toast("Every purchase order is already fully received. Create a new Purchase Order first.", "info"); return; }
  openModal({
    title: "New GRN — Receive a Purchase Order",
    bodyHtml: `
      <div class="form-field">
        <label>Purchase Order *</label>
        <select id="f-grn-po">
          ${receivable.map((po) => `<option value="${po.id}">${po.poNo} — ${escapeHtml(getVendorById(po.vendorId)?.name || "—")} (${po.status})</option>`).join("")}
        </select>
      </div>
      <div class="hint">You'll choose exactly how much of each item arrived on the next step — a partial delivery is fine.</div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="next-step">Next</button>
      </div>
    `,
    onMount: (root) => {
      root.querySelector("#next-step").addEventListener("click", () => {
        const po = getPurchaseOrderById(root.querySelector("#f-grn-po").value);
        closeModal();
        openReceiveModal(po, () => render(container, {}));
      });
    },
  });
}

function renderDetail(container, grnId) {
  const grn = getGRNById(grnId);
  if (!grn) { container.innerHTML = emptyState("GRN not found."); return; }
  const po = getPurchaseOrderById(grn.poId);
  const vendor = getVendorById(grn.vendorId);
  const wh = getWarehouses().find((w) => w.id === grn.warehouseId);
  const manage = canManage();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div style="margin-bottom:6px;"><a href="#/grn">&larr; Back to GRN</a></div>
        <h1>${grn.grnNo}</h1>
        <div class="page-subtitle">Against ${po ? `<a href="#/purchase-orders?order=${po.id}">${po.poNo}</a>` : escapeHtml(grn.poId)} · ${escapeHtml(vendor?.name || "—")} · ${formatDate(grn.date)}</div>
      </div>
      <div class="page-actions">
        ${manage ? `<button class="btn btn-secondary btn-sm" id="edit-grn-btn">Edit</button><button class="btn btn-danger btn-sm" id="delete-grn-btn">Delete</button>` : ""}
      </div>
    </div>
    <div class="detail-grid">
      <div class="card">
        <div class="card-title">Items Received</div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Item</th><th class="num">Qty Received</th></tr></thead>
            <tbody>${grn.items.map((i) => `<tr><td>${escapeHtml(getProductById(i.productId)?.name || i.productId)}</td><td class="num">${i.qty}</td></tr>`).join("")}</tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Receipt Details</div>
        <div class="info-row"><span class="label">Warehouse</span><span class="value">${escapeHtml(wh?.name || "—")}</span></div>
        <div class="info-row"><span class="label">Received By</span><span class="value">${escapeHtml(grn.receivedBy)}</span></div>
        <div class="info-row"><span class="label">Purchase Order</span><span class="value">${po ? `<a href="#/purchase-orders?order=${po.id}">${po.poNo}</a> (${po.status})` : "—"}</span></div>
      </div>
    </div>
  `;

  const editBtn = container.querySelector("#edit-grn-btn");
  if (editBtn) editBtn.addEventListener("click", () => openEditGrnModal(grn, () => renderDetail(container, grnId)));

  const deleteBtn = container.querySelector("#delete-grn-btn");
  if (deleteBtn) deleteBtn.addEventListener("click", () => {
    confirmAction({
      title: "Delete GRN",
      message: `Delete ${grn.grnNo}? This reverses the stock it added${po ? ` and reopens the remaining quantity on ${po.poNo}` : ""}. This cannot be undone.`,
      confirmLabel: "Delete",
      requirePassword: true,
      onConfirm: () => {
        const result = deleteGRN(grn.id);
        if (result.ok) { toast("GRN deleted, stock reversed.", "success"); navigateTo("grn"); }
        else toast(result.error, "danger");
      },
    });
  });
}

function openEditGrnModal(grn, onSaved) {
  const po = getPurchaseOrderById(grn.poId);
  openModal({
    title: `Edit ${grn.grnNo}`,
    bodyHtml: `
      <p class="text-secondary" style="font-size:13px; margin-bottom:12px;">Correcting quantities here adjusts stock by the difference and keeps the purchase order's received total in sync.</p>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Item</th><th class="num">Qty Received</th></tr></thead>
          <tbody>
            ${grn.items.map((i) => `
              <tr data-edit-row="${i.productId}">
                <td>${escapeHtml(getProductById(i.productId)?.name || i.productId)}</td>
                <td class="num"><input type="number" class="f-edit-qty" min="0" step="1" value="${i.qty}" style="width:90px;" /></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      ${po ? `<div class="hint">Ordered quantities on ${po.poNo} cap how high you can raise any line here.</div>` : ""}
      <div class="form-actions">
        <button class="btn btn-secondary" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="save-grn-edit">Save Changes</button>
      </div>
    `,
    onMount: (root) => {
      root.querySelector("#save-grn-edit").addEventListener("click", () => {
        const items = [...root.querySelectorAll("[data-edit-row]")].map((row) => ({
          productId: row.dataset.editRow,
          qty: Number(row.querySelector(".f-edit-qty").value) || 0,
        }));
        const result = updateGRN(grn.id, items);
        if (!result.ok) { toast(result.error, "danger"); return; }
        closeModal();
        toast("GRN updated.", "success");
        onSaved();
      });
    },
  });
}
