import {
  getSalesOrders, getSalesOrderById, addSalesOrder, getCustomers,
  getCustomerById, getPrintJobs, getInvoices,
} from "../core/store.js";
import { formatCurrency, formatDate, escapeHtml, todayLocalISO } from "../core/format.js";
import { navigateTo } from "../core/router.js";
import { openModal, closeModal, toast, emptyState } from "../core/ui.js";

const STATUS_TONE = {
  "New": "neutral", "In Production": "info", "Ready to Dispatch": "warning", "Completed": "success",
};

export function render(container, params) {
  if (params.order) renderDetail(container, params.order);
  else renderList(container);
}

function renderList(container) {
  const orders = getSalesOrders();
  container.innerHTML = `
    <div class="page-header">
      <div><h1>Sales Orders</h1><div class="page-subtitle">${orders.length} orders</div></div>
      <div class="page-actions"><button class="btn btn-primary" id="new-order-btn">+ New Sales Order</button></div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Order #</th><th>Customer</th><th>Date</th><th>Status</th><th class="num">Total</th></tr></thead>
        <tbody>
          ${orders.map((o) => `
            <tr class="row-link" data-order="${o.id}">
              <td class="mono">${o.orderNo}</td>
              <td>${escapeHtml(getCustomerById(o.customerId)?.name || "—")}</td>
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
    el.addEventListener("click", () => navigateTo("sales-orders", { order: el.dataset.order }));
  });
  container.querySelector("#new-order-btn").addEventListener("click", openNewOrderModal);
}

function openNewOrderModal() {
  const customers = getCustomers();
  openModal({
    title: "New Sales Order",
    size: "lg",
    bodyHtml: `
      <div class="form-field">
        <label>Customer *</label>
        <select id="f-customer">${customers.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select>
      </div>
      <div class="form-grid">
        <div class="form-field full"><label>Item Description *</label><input id="f-desc" placeholder="e.g. Product Labels — General Range" /></div>
        <div class="form-field"><label>Quantity</label><input type="number" id="f-qty" min="1" /></div>
        <div class="form-field"><label>Rate (Rs)</label><input type="number" id="f-rate" min="0" step="0.01" /></div>
      </div>
      <div class="form-field"><label>Notes</label><textarea id="f-notes" rows="2"></textarea></div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="save-order">Create Order</button>
      </div>
    `,
    onMount: (root) => {
      root.querySelector("[data-close-modal]").addEventListener("click", closeModal);
      root.querySelector("#save-order").addEventListener("click", () => {
        const description = root.querySelector("#f-desc").value.trim();
        const qty = Number(root.querySelector("#f-qty").value);
        const rate = Number(root.querySelector("#f-rate").value);
        if (!description || !qty || !rate) { toast("Description, quantity and rate are required.", "danger"); return; }
        const order = addSalesOrder({
          customerId: root.querySelector("#f-customer").value,
          items: [{ description, qty, rate }],
          notes: root.querySelector("#f-notes").value.trim(),
        });
        closeModal();
        toast("Sales order created.", "success");
        navigateTo("sales-orders", { order: order.id });
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

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div style="margin-bottom:6px;"><a href="#/sales-orders">&larr; Back to sales orders</a></div>
        <h1>${order.orderNo}</h1>
        <div class="page-subtitle">${escapeHtml(customer?.name || "—")} · ${formatDate(order.date)}</div>
      </div>
      <div class="page-actions"><span class="badge badge-${STATUS_TONE[order.status] || "neutral"}">${order.status}</span></div>
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
}
