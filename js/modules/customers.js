import { getCustomers, getCustomerById, addCustomer, updateCustomer, deleteCustomer, customerDependents, getPartyBalance, getLedgerForParty, recordCustomerPayment } from "../core/store.js";
import { formatCurrency, formatDate, escapeHtml } from "../core/format.js";
import { navigateTo } from "../core/router.js";
import { openModal, closeModal, toast, confirmAction, emptyState } from "../core/ui.js";
import { getCurrentUser } from "../core/auth.js";

export function render(container, params) {
  if (params.customer) {
    renderDetail(container, params.customer);
  } else {
    renderList(container);
  }
}

function balanceCell(balance) {
  if (balance > 0) return `<span style="color:var(--danger-fg); font-weight:700;">${formatCurrency(balance)}</span>`;
  if (balance < 0) return `<span class="badge badge-success">Credit ${formatCurrency(-balance)}</span>`;
  return `<span class="text-muted">Settled</span>`;
}

function gstBadge(customer) {
  return customer.gstStatus === "Registered"
    ? `<span class="badge badge-success">GST</span>`
    : `<span class="badge badge-neutral">Non-GST</span>`;
}

function canManage() {
  return getCurrentUser()?.role === "ADMIN";
}

function renderList(container) {
  const customers = getCustomers();
  const manage = canManage();
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Customers</h1>
        <div class="page-subtitle">${customers.length} customers</div>
      </div>
      <div class="page-actions">${manage ? `<button class="btn btn-primary" id="new-customer-btn">+ New Customer</button>` : ""}</div>
    </div>
    <div class="filter-bar"><input type="search" id="cust-search" placeholder="Search customers..." /></div>
    <div id="cust-table-wrap"></div>
  `;

  const wrap = container.querySelector("#cust-table-wrap");
  function draw() {
    const q = container.querySelector("#cust-search").value.trim().toLowerCase();
    const filtered = customers.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.contactPerson || "").toLowerCase().includes(q));
    wrap.innerHTML = filtered.length === 0 ? emptyState("No customers found.") : `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Contact Person</th><th>Phone</th><th>Tax Status</th><th>Credit Limit</th><th class="num">Balance</th>${manage ? "<th></th>" : ""}</tr></thead>
          <tbody>
            ${filtered.map((c) => `
              <tr class="row-link" data-customer="${c.id}">
                <td><strong>${escapeHtml(c.name)}</strong></td>
                <td>${escapeHtml(c.contactPerson || "—")}</td>
                <td>${escapeHtml(c.phone || "—")}</td>
                <td>${gstBadge(c)}</td>
                <td class="num">${formatCurrency(c.creditLimit)}</td>
                <td class="num">${balanceCell(getPartyBalance("customer", c.id))}</td>
                ${manage ? `<td><div class="row-actions"><button class="btn btn-ghost btn-icon" data-edit="${c.id}" title="Edit" aria-label="Edit">✎</button><button class="btn btn-ghost btn-icon" data-delete="${c.id}" title="Delete" aria-label="Delete">🗑</button></div></td>` : ""}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>`;
    wrap.querySelectorAll("[data-customer]").forEach((el) => {
      el.addEventListener("click", () => navigateTo("customers", { customer: el.dataset.customer }));
    });
    wrap.querySelectorAll("[data-edit]").forEach((el) => {
      el.addEventListener("click", (e) => { e.stopPropagation(); openCustomerModal(getCustomerById(el.dataset.edit), () => render(container, {})); });
    });
    wrap.querySelectorAll("[data-delete]").forEach((el) => {
      el.addEventListener("click", (e) => { e.stopPropagation(); handleDeleteCustomer(el.dataset.delete, () => render(container, {})); });
    });
  }
  draw();
  container.querySelector("#cust-search").addEventListener("input", draw);
  if (manage) container.querySelector("#new-customer-btn").addEventListener("click", () => openCustomerModal());
}

function handleDeleteCustomer(customerId, onDeleted) {
  const customer = getCustomerById(customerId);
  if (!customer) return;
  const dep = customerDependents(customerId);
  const total = dep.salesOrders + dep.invoices + dep.ledgerEntries;
  if (total > 0) {
    toast(`Cannot delete — ${dep.salesOrders} sales order(s), ${dep.invoices} invoice(s), ${dep.ledgerEntries} ledger entr${dep.ledgerEntries === 1 ? "y" : "ies"} on record.`, "danger");
    return;
  }
  confirmAction({
    title: "Delete Customer",
    message: `Delete "${escapeHtml(customer.name)}"? This cannot be undone.`,
    confirmLabel: "Delete",
    onConfirm: () => {
      const result = deleteCustomer(customerId);
      if (result.ok) { toast("Customer deleted.", "success"); onDeleted(); }
      else toast(result.error, "danger");
    },
  });
}

function gstFieldsHtml(customer) {
  const status = customer?.gstStatus || "Unregistered";
  return `
    <div class="form-grid">
      <div class="form-field">
        <label>GST Status</label>
        <select id="f-gst-status">
          <option value="Unregistered" ${status === "Unregistered" ? "selected" : ""}>Non-GST (Unregistered)</option>
          <option value="Registered" ${status === "Registered" ? "selected" : ""}>GST Registered</option>
        </select>
      </div>
      <div class="form-field" id="f-gst-number-wrap" style="${status === "Registered" ? "" : "display:none"}">
        <label>GST Registration No.</label>
        <input id="f-gst-number" value="${escapeHtml(customer?.gstNumber || "")}" placeholder="e.g. 12-34-5678-901-23" />
      </div>
    </div>`;
}

function openCustomerModal(customer = null, onSaved = null) {
  const isEdit = !!customer;
  openModal({
    title: isEdit ? "Edit Customer" : "New Customer",
    bodyHtml: `
      <div class="form-field"><label>Company / Customer Name *</label><input id="f-name" value="${escapeHtml(customer?.name || "")}" required /></div>
      <div class="form-field"><label>Contact Person</label><input id="f-contact" value="${escapeHtml(customer?.contactPerson || "")}" /></div>
      <div class="form-field"><label>Phone</label><input id="f-phone" value="${escapeHtml(customer?.phone || "")}" /></div>
      <div class="form-field"><label>Email</label><input id="f-email" type="email" value="${escapeHtml(customer?.email || "")}" /></div>
      <div class="form-field"><label>Address</label><textarea id="f-address" rows="2">${escapeHtml(customer?.address || "")}</textarea></div>
      <div class="form-field"><label>Credit Limit (Rs)</label><input id="f-credit" type="number" min="0" value="${customer?.creditLimit ?? 0}" /></div>
      <div id="gst-fields">${gstFieldsHtml(customer)}</div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="save-customer">${isEdit ? "Save Changes" : "Save Customer"}</button>
      </div>
    `,
    onMount: (root) => {
      root.querySelector("#f-gst-status").addEventListener("change", (e) => {
        root.querySelector("#f-gst-number-wrap").style.display = e.target.value === "Registered" ? "" : "none";
      });
      root.querySelector("#save-customer").addEventListener("click", () => {
        const name = root.querySelector("#f-name").value.trim();
        if (!name) { toast("Customer name is required.", "danger"); return; }
        const gstStatus = root.querySelector("#f-gst-status").value;
        const data = {
          name,
          contactPerson: root.querySelector("#f-contact").value.trim(),
          phone: root.querySelector("#f-phone").value.trim(),
          email: root.querySelector("#f-email").value.trim(),
          address: root.querySelector("#f-address").value.trim(),
          creditLimit: Number(root.querySelector("#f-credit").value) || 0,
          gstStatus,
          gstNumber: gstStatus === "Registered" ? root.querySelector("#f-gst-number").value.trim() : "",
        };
        if (isEdit) {
          updateCustomer(customer.id, data);
          closeModal();
          toast("Customer updated.", "success");
          // navigateTo() is a no-op when the hash doesn't change (editing
          // while already viewing the same record) — call the refresh
          // callback directly so the page reflects the update either way.
          if (onSaved) onSaved(); else navigateTo("customers", { customer: customer.id });
        } else {
          const created = addCustomer(data);
          closeModal();
          toast("Customer added.", "success");
          navigateTo("customers", { customer: created.id });
        }
      });
    },
  });
}

function renderDetail(container, customerId) {
  const customer = getCustomerById(customerId);
  if (!customer) { container.innerHTML = emptyState("Customer not found."); return; }
  const balance = getPartyBalance("customer", customerId);
  const ledger = getLedgerForParty("customer", customerId);
  const manage = canManage();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div style="margin-bottom:6px;"><a href="#/customers">&larr; Back to customers</a></div>
        <h1>${escapeHtml(customer.name)}</h1>
        <div class="page-subtitle">${escapeHtml(customer.contactPerson || "")} · ${escapeHtml(customer.phone || "")} · ${escapeHtml(customer.email || "")}</div>
      </div>
      <div class="page-actions">
        ${balanceCell(balance)}
        ${manage && balance > 0 ? `<button class="btn btn-primary btn-sm" id="record-customer-payment-btn">Record Payment</button>` : ""}
        ${manage ? `<button class="btn btn-secondary btn-sm" id="edit-customer-btn">Edit</button><button class="btn btn-danger btn-sm" id="delete-customer-btn">Delete</button>` : ""}
      </div>
    </div>

    <div class="detail-grid">
      <div>
        <div class="card">
          <div class="card-title">Account Statement</div>
          ${ledger.length === 0 ? emptyState("No transactions yet.") : `
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Description</th><th class="num">Amount</th></tr></thead>
                <tbody>
                  ${ledger.map((e) => `
                    <tr>
                      <td>${formatDate(e.date)}</td>
                      <td><span class="badge ${e.amount >= 0 ? "badge-warning" : "badge-success"}">${e.type}</span></td>
                      <td class="mono">${escapeHtml(e.reference)}</td>
                      <td>${escapeHtml(e.description)}</td>
                      <td class="num">${e.amount >= 0 ? formatCurrency(e.amount) : `(${formatCurrency(-e.amount)})`}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>`}
        </div>
      </div>
      <div>
        <div class="card">
          <div class="card-title">Account Info</div>
          <div class="info-row"><span class="label">Credit Limit</span><span class="value">${formatCurrency(customer.creditLimit)}</span></div>
          <div class="info-row"><span class="label">Current Balance</span><span class="value">${balanceCell(balance)}</span></div>
          <div class="info-row"><span class="label">Address</span><span class="value">${escapeHtml(customer.address || "—")}</span></div>
          <div class="info-row"><span class="label">Status</span><span class="value">${customer.status}</span></div>
        </div>
        <div class="card">
          <div class="card-title">Tax Details</div>
          <div class="info-row"><span class="label">GST Status</span><span class="value">${gstBadge(customer)}</span></div>
          ${customer.gstStatus === "Registered" ? `<div class="info-row"><span class="label">GST Number</span><span class="value mono">${escapeHtml(customer.gstNumber || "—")}</span></div>` : `<div class="hint">Non-GST customer — Sales Tax is not applied on invoices.</div>`}
        </div>
      </div>
    </div>
  `;

  const paymentBtn = container.querySelector("#record-customer-payment-btn");
  if (paymentBtn) paymentBtn.addEventListener("click", () => openRecordPaymentModal(customer, balance, () => renderDetail(container, customer.id)));
  if (manage) {
    container.querySelector("#edit-customer-btn").addEventListener("click", () => openCustomerModal(customer, () => renderDetail(container, customer.id)));
    container.querySelector("#delete-customer-btn").addEventListener("click", () => handleDeleteCustomer(customer.id, () => navigateTo("customers")));
  }
}

const PAYMENT_METHODS = ["Cash", "Bank Transfer", "Card", "Online", "Other"];

function openRecordPaymentModal(customer, balance, onSaved) {
  openModal({
    title: `Record Payment — ${customer.name}`,
    bodyHtml: `
      <div class="info-row"><span class="label">Pending Balance</span><span class="value"><strong>${formatCurrency(balance)}</strong></span></div>
      <div class="form-grid">
        <div class="form-field"><label>Amount Received (Rs) *</label><input type="number" id="f-amount" min="0.01" step="0.01" value="${Math.max(0, balance)}" /></div>
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
        const result = recordCustomerPayment(customer.id, amount, method);
        if (result.ok) { closeModal(); toast("Payment recorded.", "success"); onSaved(); }
        else toast(result.error, "danger");
      });
    },
  });
}
