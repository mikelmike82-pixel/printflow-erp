import { getCustomers, getCustomerById, addCustomer, getPartyBalance, getLedgerForParty } from "../core/store.js";
import { formatCurrency, formatDate, escapeHtml } from "../core/format.js";
import { navigateTo } from "../core/router.js";
import { openModal, closeModal, toast, emptyState } from "../core/ui.js";

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

function renderList(container) {
  const customers = getCustomers();
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Customers</h1>
        <div class="page-subtitle">${customers.length} customers</div>
      </div>
      <div class="page-actions"><button class="btn btn-primary" id="new-customer-btn">+ New Customer</button></div>
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
          <thead><tr><th>Name</th><th>Contact Person</th><th>Phone</th><th>Credit Limit</th><th class="num">Balance</th></tr></thead>
          <tbody>
            ${filtered.map((c) => `
              <tr class="row-link" data-customer="${c.id}">
                <td><strong>${escapeHtml(c.name)}</strong></td>
                <td>${escapeHtml(c.contactPerson || "—")}</td>
                <td>${escapeHtml(c.phone || "—")}</td>
                <td class="num">${formatCurrency(c.creditLimit)}</td>
                <td class="num">${balanceCell(getPartyBalance("customer", c.id))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>`;
    wrap.querySelectorAll("[data-customer]").forEach((el) => {
      el.addEventListener("click", () => navigateTo("customers", { customer: el.dataset.customer }));
    });
  }
  draw();
  container.querySelector("#cust-search").addEventListener("input", draw);
  container.querySelector("#new-customer-btn").addEventListener("click", openNewCustomerModal);
}

function openNewCustomerModal() {
  openModal({
    title: "New Customer",
    bodyHtml: `
      <div class="form-field"><label>Company / Customer Name *</label><input id="f-name" required /></div>
      <div class="form-field"><label>Contact Person</label><input id="f-contact" /></div>
      <div class="form-field"><label>Phone</label><input id="f-phone" /></div>
      <div class="form-field"><label>Email</label><input id="f-email" type="email" /></div>
      <div class="form-field"><label>Address</label><textarea id="f-address" rows="2"></textarea></div>
      <div class="form-field"><label>Credit Limit (Rs)</label><input id="f-credit" type="number" min="0" value="0" /></div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="save-customer">Save Customer</button>
      </div>
    `,
    onMount: (root) => {
      root.querySelector("[data-close-modal]").addEventListener("click", closeModal);
      root.querySelector("#save-customer").addEventListener("click", () => {
        const name = root.querySelector("#f-name").value.trim();
        if (!name) { toast("Customer name is required.", "danger"); return; }
        const customer = addCustomer({
          name,
          contactPerson: root.querySelector("#f-contact").value.trim(),
          phone: root.querySelector("#f-phone").value.trim(),
          email: root.querySelector("#f-email").value.trim(),
          address: root.querySelector("#f-address").value.trim(),
          creditLimit: Number(root.querySelector("#f-credit").value) || 0,
        });
        closeModal();
        toast("Customer added.", "success");
        navigateTo("customers", { customer: customer.id });
      });
    },
  });
}

function renderDetail(container, customerId) {
  const customer = getCustomerById(customerId);
  if (!customer) { container.innerHTML = emptyState("Customer not found."); return; }
  const balance = getPartyBalance("customer", customerId);
  const ledger = getLedgerForParty("customer", customerId);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div style="margin-bottom:6px;"><a href="#/customers">&larr; Back to customers</a></div>
        <h1>${escapeHtml(customer.name)}</h1>
        <div class="page-subtitle">${escapeHtml(customer.contactPerson || "")} · ${escapeHtml(customer.phone || "")} · ${escapeHtml(customer.email || "")}</div>
      </div>
      <div class="page-actions">${balanceCell(balance)}</div>
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
      </div>
    </div>
  `;
}
