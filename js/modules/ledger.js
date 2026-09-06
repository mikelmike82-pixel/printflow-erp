import { getAllLedgerEntries, getCustomerById, getVendorById } from "../core/store.js";
import { formatCurrency, formatDate, escapeHtml } from "../core/format.js";
import { navigateTo } from "../core/router.js";
import { emptyState } from "../core/ui.js";

function partyName(entry) {
  return entry.partyType === "customer" ? getCustomerById(entry.partyId)?.name : getVendorById(entry.partyId)?.name;
}

export function render(container) {
  const entries = [...getAllLedgerEntries()].sort((a, b) => b.date.localeCompare(a.date));

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Accounting Ledger</h1>
        <div class="page-subtitle">Party-wise transaction ledger — customers and vendors</div>
      </div>
    </div>
    <div class="filter-bar">
      <input type="search" id="ledger-search" placeholder="Search party or reference..." />
      <select id="party-filter">
        <option value="">All Parties</option>
        <option value="customer">Customers</option>
        <option value="vendor">Vendors</option>
      </select>
    </div>
    <div id="ledger-table-wrap"></div>
  `;

  const wrap = container.querySelector("#ledger-table-wrap");
  function draw() {
    const q = container.querySelector("#ledger-search").value.trim().toLowerCase();
    const partyType = container.querySelector("#party-filter").value;
    const filtered = entries.filter((e) => {
      const name = (partyName(e) || "").toLowerCase();
      const matchesText = !q || name.includes(q) || e.reference.toLowerCase().includes(q);
      const matchesType = !partyType || e.partyType === partyType;
      return matchesText && matchesType;
    });

    wrap.innerHTML = filtered.length === 0 ? emptyState("No ledger entries match.") : `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Date</th><th>Party</th><th>Type</th><th>Reference</th><th>Description</th><th class="num">Amount</th></tr></thead>
          <tbody>
            ${filtered.map((e) => `
              <tr class="row-link" data-party-type="${e.partyType}" data-party-id="${e.partyId}">
                <td>${formatDate(e.date)}</td>
                <td>${escapeHtml(partyName(e) || "—")} <span class="badge badge-neutral" style="margin-left:6px;">${e.partyType}</span></td>
                <td><span class="badge ${e.amount >= 0 ? "badge-warning" : "badge-success"}">${e.type}</span></td>
                <td class="mono">${escapeHtml(e.reference)}</td>
                <td>${escapeHtml(e.description)}</td>
                <td class="num">${e.amount >= 0 ? formatCurrency(e.amount) : `(${formatCurrency(-e.amount)})`}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>`;

    wrap.querySelectorAll("[data-party-id]").forEach((el) => {
      el.addEventListener("click", () => {
        const type = el.dataset.partyType === "customer" ? "customers" : "vendors";
        const paramKey = el.dataset.partyType === "customer" ? "customer" : "vendor";
        navigateTo(type, { [paramKey]: el.dataset.partyId });
      });
    });
  }
  draw();
  container.querySelector("#ledger-search").addEventListener("input", draw);
  container.querySelector("#party-filter").addEventListener("change", draw);
}
