import { getVendors, getVendorById, getPartyBalance, getLedgerForParty } from "../core/store.js";
import { formatCurrency, formatDate, escapeHtml } from "../core/format.js";
import { navigateTo } from "../core/router.js";
import { emptyState } from "../core/ui.js";

function balanceCell(balance) {
  if (balance > 0) return `<span style="color:var(--warning-fg); font-weight:700;">${formatCurrency(balance)}</span>`;
  if (balance < 0) return `<span class="badge badge-success">Credit ${formatCurrency(-balance)}</span>`;
  return `<span class="text-muted">Settled</span>`;
}

export function render(container, params) {
  if (params.vendor) renderDetail(container, params.vendor);
  else renderList(container);
}

function renderList(container) {
  const vendors = getVendors();
  container.innerHTML = `
    <div class="page-header">
      <div><h1>Vendors</h1><div class="page-subtitle">${vendors.length} vendors — raw material &amp; supply</div></div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Contact Person</th><th>Phone</th><th class="num">Payable Balance</th></tr></thead>
        <tbody>
          ${vendors.map((v) => `
            <tr class="row-link" data-vendor="${v.id}">
              <td><strong>${escapeHtml(v.name)}</strong></td>
              <td>${escapeHtml(v.contactPerson || "—")}</td>
              <td>${escapeHtml(v.phone || "—")}</td>
              <td class="num">${balanceCell(getPartyBalance("vendor", v.id))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
  container.querySelectorAll("[data-vendor]").forEach((el) => {
    el.addEventListener("click", () => navigateTo("vendors", { vendor: el.dataset.vendor }));
  });
}

function renderDetail(container, vendorId) {
  const vendor = getVendorById(vendorId);
  if (!vendor) { container.innerHTML = emptyState("Vendor not found."); return; }
  const balance = getPartyBalance("vendor", vendorId);
  const ledger = getLedgerForParty("vendor", vendorId);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div style="margin-bottom:6px;"><a href="#/vendors">&larr; Back to vendors</a></div>
        <h1>${escapeHtml(vendor.name)}</h1>
        <div class="page-subtitle">${escapeHtml(vendor.contactPerson || "")} · ${escapeHtml(vendor.phone || "")}</div>
      </div>
      <div class="page-actions">${balanceCell(balance)}</div>
    </div>
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
  `;
}
