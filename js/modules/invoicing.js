import { getInvoices, getInvoiceById, getCustomerById, getSalesOrderById, invoiceOutstanding } from "../core/store.js";
import { formatCurrency, formatDate, escapeHtml } from "../core/format.js";
import { navigateTo } from "../core/router.js";
import { emptyState } from "../core/ui.js";

const STATUS_TONE = {
  Paid: "success", Unpaid: "neutral", "Partially Paid": "warning", Overdue: "danger", "Overpaid — Credit": "success",
};

export function render(container, params) {
  if (params.invoice) renderDetail(container, params.invoice);
  else renderList(container);
}

function renderList(container) {
  const invoices = getInvoices();
  container.innerHTML = `
    <div class="page-header">
      <div><h1>Invoicing</h1><div class="page-subtitle">${invoices.length} invoices</div></div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Invoice #</th><th>Customer</th><th>Date</th><th>Due</th><th class="num">Total</th><th class="num">Outstanding</th><th>Status</th></tr></thead>
        <tbody>
          ${invoices.map((i) => {
            const outstanding = invoiceOutstanding(i);
            return `
            <tr class="row-link" data-invoice="${i.id}">
              <td class="mono">${i.invoiceNo}</td>
              <td>${escapeHtml(getCustomerById(i.customerId)?.name || "—")}</td>
              <td>${formatDate(i.date)}</td>
              <td>${formatDate(i.dueDate)}</td>
              <td class="num">${formatCurrency(i.total)}</td>
              <td class="num">${outstanding > 0 ? formatCurrency(outstanding) : outstanding < 0 ? `<span class="badge badge-success">Credit ${formatCurrency(-outstanding)}</span>` : "—"}</td>
              <td><span class="badge badge-${STATUS_TONE[i.status] || "neutral"}">${i.status}</span></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
  container.querySelectorAll("[data-invoice]").forEach((el) => {
    el.addEventListener("click", () => navigateTo("invoicing", { invoice: el.dataset.invoice }));
  });
}

function renderDetail(container, invoiceId) {
  const invoice = getInvoiceById(invoiceId);
  if (!invoice) { container.innerHTML = emptyState("Invoice not found."); return; }
  const customer = getCustomerById(invoice.customerId);
  const so = invoice.salesOrderId ? getSalesOrderById(invoice.salesOrderId) : null;
  const outstanding = invoiceOutstanding(invoice);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div style="margin-bottom:6px;"><a href="#/invoicing">&larr; Back to invoices</a></div>
        <h1>${invoice.invoiceNo}</h1>
        <div class="page-subtitle">${escapeHtml(customer?.name || "—")} · Issued ${formatDate(invoice.date)} · Due ${formatDate(invoice.dueDate)}</div>
      </div>
      <div class="page-actions"><span class="badge badge-${STATUS_TONE[invoice.status] || "neutral"}">${invoice.status}</span></div>
    </div>
    <div class="detail-grid">
      <div class="card">
        <div class="card-title">Summary</div>
        <div class="info-row"><span class="label">Sales Order</span><span class="value">${so ? `<a href="#/sales-orders?order=${so.id}">${so.orderNo}</a>` : "—"}</span></div>
        <div class="info-row"><span class="label">Invoice Total</span><span class="value">${formatCurrency(invoice.total)}</span></div>
        <div class="info-row"><span class="label">Amount Paid</span><span class="value">${formatCurrency(invoice.paid)}</span></div>
        <div class="info-row"><span class="label">Outstanding</span><span class="value">${outstanding > 0 ? formatCurrency(outstanding) : outstanding < 0 ? `<span class="badge badge-success">Credit ${formatCurrency(-outstanding)}</span>` : "Settled"}</span></div>
      </div>
      <div class="card">
        <div class="card-title">Customer</div>
        <div class="info-row"><span class="label">Name</span><span class="value"><a href="#/customers?customer=${customer?.id}">${escapeHtml(customer?.name || "—")}</a></span></div>
        <div class="info-row"><span class="label">Phone</span><span class="value">${escapeHtml(customer?.phone || "—")}</span></div>
      </div>
    </div>
  `;
}
