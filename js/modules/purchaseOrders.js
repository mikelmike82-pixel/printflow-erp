import {
  getPurchaseOrders, getPurchaseOrderById, getVendors, getVendorById, getProducts, getProductById, getWarehouses,
  addPurchaseOrder, receiveGRN, deletePurchaseOrder, computePurchaseOrderTax, poRemainingQty, poReceivedQty,
} from "../core/store.js";
import { formatCurrency, formatDate, escapeHtml } from "../core/format.js";
import { navigateTo } from "../core/router.js";
import { confirmAction, openModal, closeModal, toast, emptyState } from "../core/ui.js";
import { getCurrentUser } from "../core/auth.js";

const STATUS_TONE = { Pending: "warning", "Partially Received": "warning", Received: "success" };

function canManage() {
  return getCurrentUser()?.role === "ADMIN";
}

export function render(container, params) {
  if (params.order) renderDetail(container, params.order);
  else renderList(container);
}

function renderList(container) {
  const orders = getPurchaseOrders();
  const manage = canManage();
  container.innerHTML = `
    <div class="page-header">
      <div><h1>Purchase Orders</h1><div class="page-subtitle">${orders.length} purchase orders to vendors</div></div>
      <div class="page-actions">${manage ? `<button class="btn btn-primary" id="new-po-btn">+ New Purchase Order</button>` : ""}</div>
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
              <td><span class="badge badge-${STATUS_TONE[o.status] || "neutral"}">${o.status}</span></td>
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
  if (manage) container.querySelector("#new-po-btn").addEventListener("click", () => openNewPOModal());
}

function poItemRowHtml(index) {
  const products = getProducts();
  return `
    <div class="po-item-row" data-row="${index}" style="display:grid; grid-template-columns: 2fr 90px 110px 32px; gap:8px; align-items:end; margin-bottom:8px;">
      <div class="form-field" style="margin:0;">
        <label>Material</label>
        <select class="f-po-product">${products.map((p) => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.unit)})</option>`).join("")}</select>
      </div>
      <div class="form-field" style="margin:0;"><label>Qty</label><input type="number" class="f-po-qty" min="1" value="1" /></div>
      <div class="form-field" style="margin:0;"><label>Rate (Rs)</label><input type="number" class="f-po-rate" min="0" step="0.01" value="0" /></div>
      <button type="button" class="btn btn-ghost btn-icon remove-po-row" title="Remove" aria-label="Remove">🗑</button>
    </div>`;
}

function openNewPOModal() {
  const vendors = getVendors();
  if (vendors.length === 0) { toast("Add a vendor first.", "danger"); return; }
  if (getProducts().length === 0) { toast("Add a raw material first, in the Stock section.", "danger"); return; }
  let rowCount = 1;
  openModal({
    title: "New Purchase Order",
    size: "lg",
    bodyHtml: `
      <div class="form-field">
        <label>Vendor *</label>
        <select id="f-po-vendor">${vendors.map((v) => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join("")}</select>
      </div>
      <div id="po-item-rows">${poItemRowHtml(0)}</div>
      <button type="button" class="btn btn-secondary btn-sm" id="add-po-row">+ Add Material</button>
      <div class="hint" style="margin-top:10px;">Saving this immediately credits the vendor's ledger for the total — stock itself is only added once you receive it (GRN), and a PO can be received in more than one delivery if less than the full order arrives at once.</div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="save-po">Save Purchase Order</button>
      </div>
    `,
    onMount: (root) => {
      const rowsWrap = root.querySelector("#po-item-rows");
      root.querySelector("#add-po-row").addEventListener("click", () => {
        rowCount += 1;
        rowsWrap.insertAdjacentHTML("beforeend", poItemRowHtml(rowCount));
        bindRemove(rowsWrap.lastElementChild);
      });
      function bindRemove(rowEl) {
        rowEl.querySelector(".remove-po-row").addEventListener("click", () => {
          if (rowsWrap.children.length > 1) rowEl.remove();
        });
      }
      bindRemove(rowsWrap.firstElementChild);

      root.querySelector("#save-po").addEventListener("click", () => {
        const vendorId = root.querySelector("#f-po-vendor").value;
        const items = [...rowsWrap.querySelectorAll(".po-item-row")].map((row) => {
          const productId = row.querySelector(".f-po-product").value;
          return {
            productId,
            description: getProductById(productId)?.name || productId,
            qty: Number(row.querySelector(".f-po-qty").value) || 0,
            rate: Number(row.querySelector(".f-po-rate").value) || 0,
          };
        });
        if (items.some((i) => i.qty <= 0)) { toast("Every item needs a quantity greater than zero.", "danger"); return; }
        if (items.some((i) => i.rate <= 0)) { toast("Every item needs a rate greater than zero.", "danger"); return; }
        const po = addPurchaseOrder({ vendorId, items });
        closeModal();
        toast(`${po.poNo} created — ${formatCurrency(po.total)} credited to the vendor's account.`, "success");
        navigateTo("purchase-orders", { order: po.id });
      });
    },
  });
}

function renderDetail(container, orderId) {
  const po = getPurchaseOrderById(orderId);
  if (!po) { container.innerHTML = emptyState("Purchase order not found."); return; }
  const vendor = getVendorById(po.vendorId);
  const tax = computePurchaseOrderTax(po);
  const manage = canManage();
  const fullyReceived = po.status === "Received";

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div style="margin-bottom:6px;"><a href="#/purchase-orders">&larr; Back to purchase orders</a></div>
        <h1>${po.poNo}</h1>
        <div class="page-subtitle">${escapeHtml(vendor?.name || "—")} · ${formatDate(po.date)}</div>
      </div>
      <div class="page-actions">
        <span class="badge badge-${STATUS_TONE[po.status] || "neutral"}">${po.status}</span>
        ${manage && !fullyReceived ? `<button class="btn btn-primary" id="receive-btn">Receive (Create GRN)</button>` : ""}
        ${manage ? `<button class="btn btn-danger btn-sm" id="delete-po-btn">Delete</button>` : ""}
      </div>
    </div>
    <div class="detail-grid">
      <div class="card">
        <div class="card-title">Items</div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Item</th><th class="num">Ordered</th><th class="num">Received</th><th class="num">Remaining</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
            <tbody>
              ${po.items.map((i) => `
                <tr>
                  <td>${escapeHtml(i.description || getProductById(i.productId)?.name || i.productId)}</td>
                  <td class="num">${i.qty}</td>
                  <td class="num">${poReceivedQty(i)}</td>
                  <td class="num">${poRemainingQty(i) > 0 ? poRemainingQty(i) : `<span class="badge badge-success">Complete</span>`}</td>
                  <td class="num">${formatCurrency(i.rate)}</td>
                  <td class="num">${formatCurrency(i.qty * i.rate)}</td>
                </tr>
              `).join("")}
              ${tax.applies ? `<tr><td colspan="5" class="num">Subtotal</td><td class="num">${formatCurrency(tax.subtotal)}</td></tr><tr><td colspan="5" class="num">Sales Tax @ ${tax.rate}%</td><td class="num">${formatCurrency(tax.taxAmount)}</td></tr>` : ""}
              <tr><td colspan="5" class="num"><strong>Total</strong></td><td class="num"><strong>${formatCurrency(po.total)}</strong></td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Tax Status</div>
        ${tax.applies
          ? `<div class="info-row"><span class="label">Sales Tax Reg. No.</span><span class="value mono">${escapeHtml(vendor?.salesTaxNumber || "—")}</span></div><div class="hint">Sales-Tax-registered vendor — tax applied at the company's standard rate.</div>`
          : `<div class="hint">Vendor is not Sales Tax registered — no tax applied on this bill.</div>`}
        <div class="card-title" style="margin-top:16px;">Goods Receiving</div>
        <div class="hint">See the <a href="#/grn">GRN section</a> for every delivery received against this order — a partial delivery is fine, the remaining quantity stays open until it all arrives.</div>
      </div>
    </div>
  `;

  const receiveBtn = container.querySelector("#receive-btn");
  if (receiveBtn) receiveBtn.addEventListener("click", () => openReceiveModal(po, () => renderDetail(container, orderId)));

  const deleteBtn = container.querySelector("#delete-po-btn");
  if (deleteBtn) deleteBtn.addEventListener("click", () => {
    confirmAction({
      title: "Delete Purchase Order",
      message: `Delete ${po.poNo}? This also deletes every GRN received against it (reversing that stock) and removes the vendor ledger entry it created. This cannot be undone.`,
      confirmLabel: "Delete Everything",
      requirePassword: true,
      onConfirm: () => {
        const result = deletePurchaseOrder(po.id);
        if (result.ok) { toast("Purchase order and its GRN(s) deleted.", "success"); navigateTo("purchase-orders"); }
        else toast(result.error, "danger");
      },
    });
  });
}

export function openReceiveModal(po, onSaved) {
  const warehouses = getWarehouses();
  const receivableItems = po.items.filter((i) => poRemainingQty(i) > 0);
  openModal({
    title: `Receive Goods — ${po.poNo}`,
    size: "lg",
    bodyHtml: `
      <p class="text-secondary" style="font-size:13px; margin-bottom:12px;">Enter what actually arrived — leave the default to receive everything remaining, or lower it if this is a partial delivery (the rest stays open for a later GRN).</p>
      <div class="form-field">
        <label>Receiving Warehouse</label>
        <select id="wh-select">${warehouses.map((w) => `<option value="${w.id}">${w.name}</option>`).join("")}</select>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Item</th><th class="num">Ordered</th><th class="num">Already Received</th><th class="num">Receiving Now</th></tr></thead>
          <tbody>
            ${receivableItems.map((i) => `
              <tr data-grn-row="${i.productId}">
                <td>${escapeHtml(i.description || getProductById(i.productId)?.name || i.productId)}</td>
                <td class="num">${i.qty}</td>
                <td class="num">${poReceivedQty(i)}</td>
                <td class="num"><input type="number" class="f-receive-qty" min="0" max="${poRemainingQty(i)}" step="1" value="${poRemainingQty(i)}" style="width:90px;" /></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
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
        const items = [...root.querySelectorAll("[data-grn-row]")].map((row) => ({
          productId: row.dataset.grnRow,
          qty: Number(row.querySelector(".f-receive-qty").value) || 0,
        })).filter((i) => i.qty > 0);
        if (items.length === 0) { toast("Enter a quantity greater than zero for at least one item.", "danger"); return; }
        const result = receiveGRN(po.id, warehouseId, items);
        if (!result.ok) { toast(result.error, "danger"); return; }
        closeModal();
        toast(`${result.grn.grnNo} created and stock updated.`, "success");
        onSaved();
      });
    },
  });
}
