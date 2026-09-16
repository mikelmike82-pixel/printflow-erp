import { getInvoices, getInvoiceById, updateInvoice, deleteInvoice, getCustomerById, getCounterJobById, getPrinterById, invoiceOutstanding, computeInvoiceTax, recordPayment } from "../core/store.js";
import { formatCurrency, formatDate, escapeHtml } from "../core/format.js";
import { navigateTo } from "../core/router.js";
import { openModal, closeModal, toast, confirmAction, emptyState } from "../core/ui.js";
import { getCurrentUser } from "../core/auth.js";
import { printBill } from "../core/printBill.js";

const STATUS_TONE = {
  Paid: "success", Unpaid: "neutral", "Partially Paid": "warning", Overdue: "danger", "Overpaid — Credit": "success",
};
const STATUSES = Object.keys(STATUS_TONE);
const PAYMENT_METHODS = ["Cash", "Bank Transfer", "Card", "Online", "Other"];
const PAID_STATUSES = ["Paid", "Overpaid — Credit"];
function isPaidStatus(status) { return PAID_STATUSES.includes(status); }

function canManage() {
  return getCurrentUser()?.role === "ADMIN";
}

export function render(container, params) {
  if (params.invoice) renderDetail(container, params.invoice);
  else renderList(container);
}

function renderList(container) {
  const invoices = getInvoices();
  const manage = canManage();
  container.innerHTML = `
    <div class="page-header">
      <div><h1>Bills</h1><div class="page-subtitle">${invoices.length} bills</div></div>
    </div>
    <div class="filter-bar">
      <input type="search" id="bill-search" placeholder="Search by bill #, customer..." />
      <select id="bill-status-filter">
        <option value="unpaid">Unpaid bills</option>
        <option value="paid">Paid bills</option>
        <option value="all">All bills</option>
      </select>
      <input type="date" id="bill-date-filter" title="Filter by bill date" />
      <button type="button" class="btn btn-ghost btn-sm" id="bill-clear-date" title="Clear date filter">Clear date</button>
    </div>
    <div id="bill-table-wrap"></div>
  `;

  const wrap = container.querySelector("#bill-table-wrap");
  function draw() {
    const q = container.querySelector("#bill-search").value.trim().toLowerCase();
    const statusFilter = container.querySelector("#bill-status-filter").value;
    const dateFilter = container.querySelector("#bill-date-filter").value;
    const filtered = invoices.filter((i) => {
      if (q) {
        const customerName = (getCustomerById(i.customerId)?.name || i.walkInName || "").toLowerCase();
        if (!i.invoiceNo.toLowerCase().includes(q) && !customerName.includes(q)) return false;
      }
      if (dateFilter && i.date !== dateFilter) return false;
      // Paid bills are hidden from the default "Unpaid" view the moment
      // they're settled — a bill that gets fully paid off just disappears
      // from the everyday list rather than piling up, unless the filter is
      // explicitly switched to "Paid" or "All".
      if (statusFilter === "unpaid" && isPaidStatus(i.status)) return false;
      if (statusFilter === "paid" && !isPaidStatus(i.status)) return false;
      return true;
    });
    wrap.innerHTML = filtered.length === 0 ? emptyState("No bills match.") : `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Bill #</th><th>Customer</th><th>Date</th><th>Due</th><th class="num">Total</th><th class="num">Outstanding</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${filtered.map((i) => {
              const outstanding = invoiceOutstanding(i);
              return `
              <tr class="row-link" data-invoice="${i.id}">
                <td class="mono">${i.invoiceNo}</td>
                <td>${escapeHtml(getCustomerById(i.customerId)?.name || i.walkInName || "—")}</td>
                <td>${formatDate(i.date)}</td>
                <td>${formatDate(i.dueDate)}</td>
                <td class="num">${formatCurrency(i.total)}</td>
                <td class="num">${outstanding > 0 ? formatCurrency(outstanding) : outstanding < 0 ? `<span class="badge badge-success">Credit ${formatCurrency(-outstanding)}</span>` : "—"}</td>
                <td><span class="badge badge-${STATUS_TONE[i.status] || "neutral"}">${i.status}</span></td>
                <td><div class="row-actions">
                  <button class="btn btn-ghost btn-icon" data-print="${i.id}" title="Print Bill" aria-label="Print Bill">🖨</button>
                  ${manage ? `<button class="btn btn-ghost btn-icon" data-edit="${i.id}" title="Edit" aria-label="Edit">✎</button><button class="btn btn-ghost btn-icon" data-delete="${i.id}" title="Delete" aria-label="Delete">🗑</button>` : ""}
                </div></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;
    wrap.querySelectorAll("[data-invoice]").forEach((el) => {
      el.addEventListener("click", () => navigateTo("invoicing", { invoice: el.dataset.invoice }));
    });
    wrap.querySelectorAll("[data-print]").forEach((el) => {
      el.addEventListener("click", (e) => { e.stopPropagation(); printBill(el.dataset.print); });
    });
    wrap.querySelectorAll("[data-edit]").forEach((el) => {
      el.addEventListener("click", (e) => { e.stopPropagation(); openInvoiceModal(getInvoiceById(el.dataset.edit), () => draw()); });
    });
    wrap.querySelectorAll("[data-delete]").forEach((el) => {
      el.addEventListener("click", (e) => { e.stopPropagation(); handleDeleteInvoice(el.dataset.delete, () => draw()); });
    });
  }
  draw();
  container.querySelector("#bill-search").addEventListener("input", draw);
  container.querySelector("#bill-status-filter").addEventListener("change", draw);
  container.querySelector("#bill-date-filter").addEventListener("change", draw);
  container.querySelector("#bill-clear-date").addEventListener("click", () => {
    container.querySelector("#bill-date-filter").value = "";
    draw();
  });
}

function handleDeleteInvoice(invoiceId, onDeleted) {
  const invoice = getInvoiceById(invoiceId);
  if (!invoice) return;
  if (invoice.paid && invoice.paid !== 0) {
    toast(`Cannot delete — Rs ${invoice.paid.toLocaleString()} already recorded as paid against this bill.`, "danger");
    return;
  }
  confirmAction({
    title: "Delete Bill",
    message: `Delete bill ${invoice.invoiceNo}? This also removes its ledger entry. This cannot be undone.`,
    confirmLabel: "Delete",
    onConfirm: () => {
      const result = deleteInvoice(invoiceId);
      if (result.ok) { toast("Bill deleted.", "success"); onDeleted(); }
      else toast(result.error, "danger");
    },
  });
}

function openInvoiceModal(invoice, onSaved) {
  openModal({
    title: `Edit ${invoice.invoiceNo}`,
    bodyHtml: `
      <div class="form-grid">
        <div class="form-field"><label>Bill Total (Rs)</label><input type="number" id="f-total" min="0" step="0.01" value="${invoice.total}" /></div>
        <div class="form-field"><label>Amount Paid (Rs)</label><input type="number" id="f-paid" min="0" step="0.01" value="${invoice.paid}" /></div>
        <div class="form-field"><label>Due Date</label><input type="date" id="f-due" value="${invoice.dueDate}" /></div>
        <div class="form-field">
          <label>Status</label>
          <select id="f-status">${STATUSES.map((s) => `<option value="${s}" ${invoice.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>
        </div>
      </div>
      <div class="hint">Editing the total keeps this customer's ledger entry (and balance) in sync automatically.</div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="save-invoice">Save Changes</button>
      </div>
    `,
    onMount: (root) => {
      root.querySelector("#save-invoice").addEventListener("click", () => {
        const total = Number(root.querySelector("#f-total").value);
        const paid = Number(root.querySelector("#f-paid").value);
        if (!(total >= 0) || !(paid >= 0)) { toast("Enter valid amounts.", "danger"); return; }
        updateInvoice(invoice.id, {
          total,
          paid,
          dueDate: root.querySelector("#f-due").value,
          status: root.querySelector("#f-status").value,
        });
        closeModal();
        toast("Bill updated.", "success");
        onSaved();
      });
    },
  });
}

function openRecordPaymentModal(invoice, onSaved) {
  const outstanding = invoiceOutstanding(invoice);
  openModal({
    title: `Record Payment — ${invoice.invoiceNo}`,
    bodyHtml: `
      <div class="info-row"><span class="label">Outstanding</span><span class="value"><strong>${formatCurrency(outstanding)}</strong></span></div>
      <div class="form-grid">
        <div class="form-field"><label>Amount Received (Rs) *</label><input type="number" id="f-amount" min="0.01" step="0.01" value="${Math.max(0, outstanding)}" /></div>
        <div class="form-field">
          <label>Payment Method</label>
          <select id="f-method">${PAYMENT_METHODS.map((m) => `<option value="${m}">${m}</option>`).join("")}</select>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="save-payment">Record Payment</button>
      </div>
    `,
    onMount: (root) => {
      root.querySelector("#save-payment").addEventListener("click", () => {
        const amount = Number(root.querySelector("#f-amount").value);
        const method = root.querySelector("#f-method").value;
        if (!(amount > 0)) { toast("Enter an amount greater than zero.", "danger"); return; }
        const result = recordPayment(invoice.id, amount, method);
        if (result.ok) { closeModal(); toast("Payment recorded.", "success"); onSaved(); }
        else toast(result.error, "danger");
      });
    },
  });
}

function renderDetail(container, invoiceId) {
  const invoice = getInvoiceById(invoiceId);
  if (!invoice) { container.innerHTML = emptyState("Bill not found."); return; }
  const customer = getCustomerById(invoice.customerId);
  const job = invoice.printJobId ? getCounterJobById(invoice.printJobId) : null;
  const printer = job ? getPrinterById(job.printerId) : null;
  const outstanding = invoiceOutstanding(invoice);
  const tax = computeInvoiceTax(invoice);
  const manage = canManage();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div style="margin-bottom:6px;"><a href="#/invoicing">&larr; Back to bills</a></div>
        <h1>${invoice.invoiceNo}</h1>
        <div class="page-subtitle">${escapeHtml(customer?.name || invoice.walkInName || "—")} · Issued ${formatDate(invoice.date)} · Due ${formatDate(invoice.dueDate)}</div>
      </div>
      <div class="page-actions">
        <span class="badge badge-${STATUS_TONE[invoice.status] || "neutral"}">${invoice.status}</span>
        <button class="btn btn-secondary btn-sm" id="print-bill-btn">🖨 Print Bill</button>
        ${manage && outstanding > 0 ? `<button class="btn btn-primary btn-sm" id="record-payment-btn">Record Payment</button>` : ""}
        ${manage ? `<button class="btn btn-secondary btn-sm" id="edit-invoice-btn">Edit</button><button class="btn btn-danger btn-sm" id="delete-invoice-btn">Delete</button>` : ""}
      </div>
    </div>
    <div class="detail-grid">
      <div class="card">
        <div class="card-title">Items Billed</div>
        ${job ? `
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
              <tbody>
                ${job.billingItems.map((i) => `<tr><td>${escapeHtml(i.description)}</td><td class="num">${i.qty}</td><td class="num">${formatCurrency(i.rate)}</td><td class="num">${formatCurrency(i.qty * i.rate)}</td></tr>`).join("")}
              </tbody>
            </table>
          </div>` : `<div class="hint">No itemized detail on record for this bill.</div>`}
        ${tax.applies ? `
          <div class="info-row"><span class="label">Subtotal</span><span class="value">${formatCurrency(tax.subtotal)}</span></div>
          <div class="info-row"><span class="label">Sales Tax @ ${tax.rate}%</span><span class="value">${formatCurrency(tax.taxAmount)}</span></div>` : ""}
        <div class="info-row"><span class="label">Bill Total</span><span class="value">${formatCurrency(invoice.total)}</span></div>
        <div class="info-row"><span class="label">Amount Paid</span><span class="value">${formatCurrency(invoice.paid)}</span></div>
        <div class="info-row"><span class="label">Outstanding</span><span class="value">${outstanding > 0 ? formatCurrency(outstanding) : outstanding < 0 ? `<span class="badge badge-success">Credit ${formatCurrency(-outstanding)}</span>` : "Settled"}</span></div>
      </div>
      <div>
        <div class="card">
          <div class="card-title">Customer</div>
          <div class="info-row"><span class="label">Name</span><span class="value">${customer ? `<a href="#/customers?customer=${customer.id}">${escapeHtml(customer.name)}</a>` : escapeHtml(invoice.walkInName || "—")}</span></div>
          <div class="info-row"><span class="label">Phone</span><span class="value">${escapeHtml(customer?.phone || "—")}</span></div>
        </div>
        ${printer ? `
        <div class="card">
          <div class="card-title">Print Job</div>
          <div class="info-row"><span class="label">Printer</span><span class="value">${escapeHtml(printer.name)}</span></div>
          <div class="info-row"><span class="label">Source</span><span class="value">${escapeHtml(job.sourceApplication || "—")}</span></div>
          <div class="info-row"><span class="label">Job #</span><span class="value"><a href="#/print-counter?job=${job.id}">${job.jobNo}</a></span></div>
        </div>` : ""}
        <div class="card">
          <div class="card-title">Tax Status</div>
          ${tax.applies
            ? `<div class="info-row"><span class="label">GST Number</span><span class="value mono">${escapeHtml(customer?.gstNumber || "—")}</span></div><div class="hint">GST-registered customer — Sales Tax applied at the company's standard rate.</div>`
            : `<div class="hint">${customer?.gstStatus === "Registered" ? "Company is not GST-registered — no tax applied." : "Non-GST customer — no Sales Tax applied on this bill."}</div>`}
        </div>
      </div>
    </div>
  `;

  container.querySelector("#print-bill-btn").addEventListener("click", () => printBill(invoice.id));
  const paymentBtn = container.querySelector("#record-payment-btn");
  if (paymentBtn) paymentBtn.addEventListener("click", () => openRecordPaymentModal(invoice, () => renderDetail(container, invoiceId)));
  if (manage) {
    container.querySelector("#edit-invoice-btn").addEventListener("click", () => openInvoiceModal(invoice, () => renderDetail(container, invoiceId)));
    container.querySelector("#delete-invoice-btn").addEventListener("click", () => handleDeleteInvoice(invoice.id, () => navigateTo("invoicing")));
  }
}
