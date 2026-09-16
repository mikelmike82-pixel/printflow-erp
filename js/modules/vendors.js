import { getVendors, getVendorById, addVendor, updateVendor, deleteVendor, vendorDependents, getPartyBalance, getLedgerForParty, recordVendorPayment } from "../core/store.js";
import { formatCurrency, formatDate, escapeHtml } from "../core/format.js";
import { navigateTo } from "../core/router.js";
import { openModal, closeModal, toast, confirmAction, emptyState } from "../core/ui.js";
import { getCurrentUser } from "../core/auth.js";

function balanceCell(balance) {
  if (balance > 0) return `<span style="color:var(--warning-fg); font-weight:700;">${formatCurrency(balance)}</span>`;
  if (balance < 0) return `<span class="badge badge-success">Credit ${formatCurrency(-balance)}</span>`;
  return `<span class="text-muted">Settled</span>`;
}

function taxBadge(vendor) {
  return vendor.salesTaxStatus === "Registered"
    ? `<span class="badge badge-success">Sales Tax</span>`
    : `<span class="badge badge-neutral">Non-Reg.</span>`;
}

function canManage() {
  return getCurrentUser()?.role === "ADMIN";
}

export function render(container, params) {
  if (params.vendor) renderDetail(container, params.vendor);
  else renderList(container);
}

function renderList(container) {
  const vendors = getVendors();
  const manage = canManage();
  container.innerHTML = `
    <div class="page-header">
      <div><h1>Vendors</h1><div class="page-subtitle">${vendors.length} vendors — raw material &amp; supply</div></div>
      <div class="page-actions">${manage ? `<button class="btn btn-primary" id="new-vendor-btn">+ New Vendor</button>` : ""}</div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Contact Person</th><th>Phone</th><th>Tax Status</th><th class="num">Payable Balance</th>${manage ? "<th></th>" : ""}</tr></thead>
        <tbody>
          ${vendors.map((v) => `
            <tr class="row-link" data-vendor="${v.id}">
              <td><strong>${escapeHtml(v.name)}</strong></td>
              <td>${escapeHtml(v.contactPerson || "—")}</td>
              <td>${escapeHtml(v.phone || "—")}</td>
              <td>${taxBadge(v)}</td>
              <td class="num">${balanceCell(getPartyBalance("vendor", v.id))}</td>
              ${manage ? `<td><div class="row-actions"><button class="btn btn-ghost btn-icon" data-edit="${v.id}" title="Edit" aria-label="Edit">✎</button><button class="btn btn-ghost btn-icon" data-delete="${v.id}" title="Delete" aria-label="Delete">🗑</button></div></td>` : ""}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
  container.querySelectorAll("[data-vendor]").forEach((el) => {
    el.addEventListener("click", () => navigateTo("vendors", { vendor: el.dataset.vendor }));
  });
  container.querySelectorAll("[data-edit]").forEach((el) => {
    el.addEventListener("click", (e) => { e.stopPropagation(); openVendorModal(getVendorById(el.dataset.edit), () => render(container, {})); });
  });
  container.querySelectorAll("[data-delete]").forEach((el) => {
    el.addEventListener("click", (e) => { e.stopPropagation(); handleDeleteVendor(el.dataset.delete, () => render(container, {})); });
  });
  if (manage) container.querySelector("#new-vendor-btn").addEventListener("click", () => openVendorModal());
}

function handleDeleteVendor(vendorId, onDeleted) {
  const vendor = getVendorById(vendorId);
  if (!vendor) return;
  const dep = vendorDependents(vendorId);
  const total = dep.purchaseOrders + dep.ledgerEntries;
  if (total > 0) {
    toast(`Cannot delete — ${dep.purchaseOrders} purchase order(s), ${dep.ledgerEntries} ledger entr${dep.ledgerEntries === 1 ? "y" : "ies"} on record.`, "danger");
    return;
  }
  confirmAction({
    title: "Delete Vendor",
    message: `Delete "${escapeHtml(vendor.name)}"? This cannot be undone.`,
    confirmLabel: "Delete",
    onConfirm: () => {
      const result = deleteVendor(vendorId);
      if (result.ok) { toast("Vendor deleted.", "success"); onDeleted(); }
      else toast(result.error, "danger");
    },
  });
}

function taxFieldsHtml(vendor) {
  const status = vendor?.salesTaxStatus || "Unregistered";
  return `
    <div class="form-grid">
      <div class="form-field">
        <label>Sales Tax Status</label>
        <select id="f-tax-status">
          <option value="Unregistered" ${status === "Unregistered" ? "selected" : ""}>Non-Sales-Tax (Unregistered)</option>
          <option value="Registered" ${status === "Registered" ? "selected" : ""}>Sales Tax Registered</option>
        </select>
      </div>
      <div class="form-field" id="f-tax-number-wrap" style="${status === "Registered" ? "" : "display:none"}">
        <label>Sales Tax Registration No.</label>
        <input id="f-tax-number" value="${escapeHtml(vendor?.salesTaxNumber || "")}" placeholder="e.g. 21-98-7654-321-11" />
      </div>
    </div>`;
}

function openVendorModal(vendor = null, onSaved = null) {
  const isEdit = !!vendor;
  openModal({
    title: isEdit ? "Edit Vendor" : "New Vendor",
    bodyHtml: `
      <div class="form-field"><label>Vendor Name *</label><input id="f-name" value="${escapeHtml(vendor?.name || "")}" required /></div>
      <div class="form-field"><label>Contact Person</label><input id="f-contact" value="${escapeHtml(vendor?.contactPerson || "")}" /></div>
      <div class="form-field"><label>Phone</label><input id="f-phone" value="${escapeHtml(vendor?.phone || "")}" /></div>
      <div class="form-field"><label>Email</label><input id="f-email" type="email" value="${escapeHtml(vendor?.email || "")}" /></div>
      <div class="form-field"><label>Address</label><textarea id="f-address" rows="2">${escapeHtml(vendor?.address || "")}</textarea></div>
      <div id="tax-fields">${taxFieldsHtml(vendor)}</div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="save-vendor">${isEdit ? "Save Changes" : "Save Vendor"}</button>
      </div>
    `,
    onMount: (root) => {
      root.querySelector("#f-tax-status").addEventListener("change", (e) => {
        root.querySelector("#f-tax-number-wrap").style.display = e.target.value === "Registered" ? "" : "none";
      });
      root.querySelector("#save-vendor").addEventListener("click", () => {
        const name = root.querySelector("#f-name").value.trim();
        if (!name) { toast("Vendor name is required.", "danger"); return; }
        const salesTaxStatus = root.querySelector("#f-tax-status").value;
        const data = {
          name,
          contactPerson: root.querySelector("#f-contact").value.trim(),
          phone: root.querySelector("#f-phone").value.trim(),
          email: root.querySelector("#f-email").value.trim(),
          address: root.querySelector("#f-address").value.trim(),
          salesTaxStatus,
          salesTaxNumber: salesTaxStatus === "Registered" ? root.querySelector("#f-tax-number").value.trim() : "",
        };
        if (isEdit) {
          updateVendor(vendor.id, data);
          closeModal();
          toast("Vendor updated.", "success");
          if (onSaved) onSaved(); else navigateTo("vendors", { vendor: vendor.id });
        } else {
          const created = addVendor(data);
          closeModal();
          toast("Vendor added.", "success");
          navigateTo("vendors", { vendor: created.id });
        }
      });
    },
  });
}

function renderDetail(container, vendorId) {
  const vendor = getVendorById(vendorId);
  if (!vendor) { container.innerHTML = emptyState("Vendor not found."); return; }
  const balance = getPartyBalance("vendor", vendorId);
  const ledger = getLedgerForParty("vendor", vendorId);
  const manage = canManage();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div style="margin-bottom:6px;"><a href="#/vendors">&larr; Back to vendors</a></div>
        <h1>${escapeHtml(vendor.name)}</h1>
        <div class="page-subtitle">${escapeHtml(vendor.contactPerson || "")} · ${escapeHtml(vendor.phone || "")}</div>
      </div>
      <div class="page-actions">
        ${balanceCell(balance)}
        ${manage && balance > 0 ? `<button class="btn btn-primary btn-sm" id="record-vendor-payment-btn">Record Payment</button>` : ""}
        ${manage ? `<button class="btn btn-secondary btn-sm" id="edit-vendor-btn">Edit</button><button class="btn btn-danger btn-sm" id="delete-vendor-btn">Delete</button>` : ""}
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
          <div class="card-title">Tax Details</div>
          <div class="info-row"><span class="label">Sales Tax Status</span><span class="value">${taxBadge(vendor)}</span></div>
          ${vendor.salesTaxStatus === "Registered" ? `<div class="info-row"><span class="label">Registration No.</span><span class="value mono">${escapeHtml(vendor.salesTaxNumber || "—")}</span></div>` : `<div class="hint">Not Sales Tax registered — no tax shown on purchase bills from this vendor.</div>`}
        </div>
        <div class="card">
          <div class="card-title">Contact</div>
          <div class="info-row"><span class="label">Email</span><span class="value">${escapeHtml(vendor.email || "—")}</span></div>
          <div class="info-row"><span class="label">Address</span><span class="value">${escapeHtml(vendor.address || "—")}</span></div>
        </div>
      </div>
    </div>
  `;

  const paymentBtn = container.querySelector("#record-vendor-payment-btn");
  if (paymentBtn) paymentBtn.addEventListener("click", () => openRecordPaymentModal(vendor, balance, () => renderDetail(container, vendor.id)));
  if (manage) {
    container.querySelector("#edit-vendor-btn").addEventListener("click", () => openVendorModal(vendor, () => renderDetail(container, vendor.id)));
    container.querySelector("#delete-vendor-btn").addEventListener("click", () => handleDeleteVendor(vendor.id, () => navigateTo("vendors")));
  }
}

const PAYMENT_METHODS = ["Cash", "Bank Transfer", "Card", "Online", "Other"];

function openRecordPaymentModal(vendor, balance, onSaved) {
  openModal({
    title: `Record Payment — ${vendor.name}`,
    bodyHtml: `
      <div class="info-row"><span class="label">Payable Balance</span><span class="value"><strong>${formatCurrency(balance)}</strong></span></div>
      <div class="form-grid">
        <div class="form-field"><label>Amount Paid (Rs) *</label><input type="number" id="f-amount" min="0.01" step="0.01" value="${Math.max(0, balance)}" /></div>
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
        const result = recordVendorPayment(vendor.id, amount, method);
        if (result.ok) { closeModal(); toast("Payment recorded.", "success"); onSaved(); }
        else toast(result.error, "danger");
      });
    },
  });
}
