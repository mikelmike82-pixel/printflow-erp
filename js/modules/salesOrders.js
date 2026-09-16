import {
  getSalesOrders, getSalesOrderById, addSalesOrder, updateSalesOrder, deleteSalesOrder, salesOrderDependents,
  getCustomers, getCustomerById, getPrintJobs, getInvoices,
} from "../core/store.js";
import { formatCurrency, formatDate, escapeHtml, todayLocalISO } from "../core/format.js";
import { navigateTo } from "../core/router.js";
import { openModal, closeModal, toast, confirmAction, emptyState } from "../core/ui.js";
import { getCurrentUser } from "../core/auth.js";

const STATUS_TONE = {
  "New": "neutral", "In Production": "info", "Ready to Dispatch": "warning", "Completed": "success",
};
const STATUSES = Object.keys(STATUS_TONE);

function canManage() {
  const role = getCurrentUser()?.role;
  return role === "SUPER_ADMIN" || role === "SALES_CRM" || role === "ACCOUNTS";
}

export function render(container, params) {
  if (params.order) renderDetail(container, params.order);
  else renderList(container);
}

function renderList(container) {
  const orders = getSalesOrders();
  const manage = canManage();
  container.innerHTML = `
    <div class="page-header">
      <div><h1>Sales Orders</h1><div class="page-subtitle">${orders.length} orders</div></div>
      <div class="page-actions">${manage ? `<button class="btn btn-primary" id="new-order-btn">+ New Sales Order</button>` : ""}</div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Order #</th><th>Customer</th><th>Date</th><th>Status</th><th class="num">Total</th>${manage ? "<th></th>" : ""}</tr></thead>
        <tbody>
          ${orders.map((o) => `
            <tr class="row-link" data-order="${o.id}">
              <td class="mono">${o.orderNo}</td>
              <td>${escapeHtml(getCustomerById(o.customerId)?.name || "—")}</td>
              <td>${formatDate(o.date)}</td>
              <td><span class="badge badge-${STATUS_TONE[o.status] || "neutral"}">${o.status}</span></td>
              <td class="num">${formatCurrency(o.total)}</td>
              ${manage ? `<td><div class="row-actions"><button class="btn btn-ghost btn-icon" data-edit="${o.id}" title="Edit" aria-label="Edit">✎</button><button class="btn btn-ghost btn-icon" data-delete="${o.id}" title="Delete" aria-label="Delete">🗑</button></div></td>` : ""}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
  container.querySelectorAll("[data-order]").forEach((el) => {
    el.addEventListener("click", () => navigateTo("sales-orders", { order: el.dataset.order }));
  });
  container.querySelectorAll("[data-edit]").forEach((el) => {
    el.addEventListener("click", (e) => { e.stopPropagation(); openOrderModal(getSalesOrderById(el.dataset.edit), () => render(container, {})); });
  });
  container.querySelectorAll("[data-delete]").forEach((el) => {
    el.addEventListener("click", (e) => { e.stopPropagation(); handleDeleteOrder(el.dataset.delete, () => render(container, {})); });
  });
  if (manage) container.querySelector("#new-order-btn").addEventListener("click", () => openOrderModal());
}

function handleDeleteOrder(orderId, onDeleted) {
  const order = getSalesOrderById(orderId);
  if (!order) return;
  const dep = salesOrderDependents(orderId);
  const total = dep.printJobs + dep.invoices;
  if (total > 0) {
    toast(`Cannot delete — ${dep.printJobs} print job(s) and ${dep.invoices} invoice(s) are linked to this order.`, "danger");
    return;
  }
  confirmAction({
    title: "Delete Sales Order",
    message: `Delete order ${order.orderNo}? This cannot be undone.`,
    confirmLabel: "Delete",
    onConfirm: () => {
      const result = deleteSalesOrder(orderId);
      if (result.ok) { toast("Sales order deleted.", "success"); onDeleted(); }
      else toast(result.error, "danger");
    },
  });
}

function openOrderModal(order = null, onSaved = null) {
  const isEdit = !!order;
  const customers = getCustomers();
  const item = order?.items?.[0] || {};
  openModal({
    title: isEdit ? `Edit ${order.orderNo}` : "New Sales Order",
    size: "lg",
    bodyHtml: `
      <div class="form-grid">
        <div class="form-field">
          <label>Customer *</label>
          <select id="f-customer">${customers.map((c) => `<option value="${c.id}" ${order?.customerId === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}</select>
        </div>
        ${isEdit ? `
          <div class="form-field">
            <label>Status</label>
            <select id="f-status">${STATUSES.map((s) => `<option value="${s}" ${order.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>
          </div>` : ""}
      </div>
      <div class="form-grid">
        <div class="form-field full"><label>Item Description *</label><input id="f-desc" value="${escapeHtml(item.description || "")}" placeholder="e.g. Product Labels — General Range" /></div>
        <div class="form-field"><label>Quantity</label><input type="number" id="f-qty" min="1" value="${item.qty || ""}" /></div>
        <div class="form-field"><label>Rate (Rs)</label><input type="number" id="f-rate" min="0" step="0.01" value="${item.rate || ""}" /></div>
      </div>
      <div class="form-field"><label>Notes</label><textarea id="f-notes" rows="2">${escapeHtml(order?.notes || "")}</textarea></div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="save-order">${isEdit ? "Save Changes" : "Create Order"}</button>
      </div>
    `,
    onMount: (root) => {
      root.querySelector("#save-order").addEventListener("click", () => {
        const description = root.querySelector("#f-desc").value.trim();
        const qty = Number(root.querySelector("#f-qty").value);
        const rate = Number(root.querySelector("#f-rate").value);
        if (!description || !qty || !rate) { toast("Description, quantity and rate are required.", "danger"); return; }
        const data = {
          customerId: root.querySelector("#f-customer").value,
          items: [{ description, qty, rate }],
          notes: root.querySelector("#f-notes").value.trim(),
        };
        if (isEdit) {
          data.status = root.querySelector("#f-status").value;
          updateSalesOrder(order.id, data);
          closeModal();
          toast("Sales order updated.", "success");
          if (onSaved) onSaved(); else navigateTo("sales-orders", { order: order.id });
        } else {
          const created = addSalesOrder(data);
          closeModal();
          toast("Sales order created.", "success");
          navigateTo("sales-orders", { order: created.id });
        }
      });
    },
  });
}

function renderDetail(container, orderId) {
  const order = getSalesOrderById(orderId);
  if (!order) { container.innerHTML = emptyState("Sales order not found."); return; }
  const customer = getCustomerById(order.customerId);
  const relatedJobs = getPrintJobs().filter((j) => j.salesOrderId === order.id);
  const relatedInvoices = getInvoices().filter((i) => i.salesOrderId === order.id);
  const manage = canManage();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div style="margin-bottom:6px;"><a href="#/sales-orders">&larr; Back to sales orders</a></div>
        <h1>${order.orderNo}</h1>
        <div class="page-subtitle">${escapeHtml(customer?.name || "—")} · ${formatDate(order.date)}</div>
      </div>
      <div class="page-actions">
        <span class="badge badge-${STATUS_TONE[order.status] || "neutral"}">${order.status}</span>
        ${manage ? `<button class="btn btn-secondary btn-sm" id="edit-order-btn">Edit</button><button class="btn btn-danger btn-sm" id="delete-order-btn">Delete</button>` : ""}
      </div>
    </div>

    <div class="detail-grid">
      <div>
        <div class="card">
          <div class="card-title">Order Items</div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
              <tbody>
                ${order.items.map((i) => `
                  <tr><td>${escapeHtml(i.description)}</td><td class="num">${i.qty.toLocaleString()}</td><td class="num">${formatCurrency(i.rate)}</td><td class="num">${formatCurrency(i.qty * i.rate)}</td></tr>
                `).join("")}
                <tr><td colspan="3" class="num"><strong>Total</strong></td><td class="num"><strong>${formatCurrency(order.total)}</strong></td></tr>
              </tbody>
            </table>
          </div>
          ${order.notes ? `<div class="hint" style="margin-top:10px;">${escapeHtml(order.notes)}</div>` : ""}
        </div>

        <div class="card">
          <div class="card-title">Linked Print Jobs</div>
          ${relatedJobs.length === 0 ? emptyState("No print job created for this order yet.") : `
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>Job #</th><th>Stage</th><th>Due</th></tr></thead>
                <tbody>${relatedJobs.map((j) => `<tr class="row-link" data-job="${j.id}"><td class="mono">${j.jobNo}</td><td><span class="badge badge-info">${j.stage}</span></td><td>${formatDate(j.dueDate)}</td></tr>`).join("")}</tbody>
              </table>
            </div>`}
        </div>
      </div>
      <div>
        <div class="card">
          <div class="card-title">Invoices</div>
          ${relatedInvoices.length === 0 ? emptyState("Not invoiced yet.") : `
            <ul>
              ${relatedInvoices.map((i) => `<li class="info-row"><span class="label"><a href="#/invoicing?invoice=${i.id}">${i.invoiceNo}</a></span><span class="value">${formatCurrency(i.total)}</span></li>`).join("")}
            </ul>`}
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll("[data-job]").forEach((el) => {
    el.addEventListener("click", () => navigateTo("printing", { job: el.dataset.job }));
  });

  if (manage) {
    container.querySelector("#edit-order-btn").addEventListener("click", () => openOrderModal(order, () => renderDetail(container, order.id)));
    container.querySelector("#delete-order-btn").addEventListener("click", () => handleDeleteOrder(order.id, () => navigateTo("sales-orders")));
  }
}
