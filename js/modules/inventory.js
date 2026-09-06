import { getProducts, getWarehouses } from "../core/store.js";
import { formatCurrency, escapeHtml } from "../core/format.js";
import { emptyState } from "../core/ui.js";

export function render(container) {
  const products = getProducts();
  const warehouses = getWarehouses();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Inventory / Warehouses</h1>
        <div class="page-subtitle">${products.length} items across ${warehouses.length} warehouses</div>
      </div>
    </div>
    <div class="filter-bar">
      <input type="search" id="inv-search" placeholder="Search by name or SKU..." />
      <select id="cat-filter">
        <option value="">All Categories</option>
        ${[...new Set(products.map((p) => p.category))].map((c) => `<option value="${c}">${c}</option>`).join("")}
      </select>
    </div>
    <div id="inv-table-wrap"></div>
  `;

  const wrap = container.querySelector("#inv-table-wrap");
  function draw() {
    const q = container.querySelector("#inv-search").value.trim().toLowerCase();
    const cat = container.querySelector("#cat-filter").value;
    const filtered = products.filter((p) => (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) && (!cat || p.category === cat));

    wrap.innerHTML = filtered.length === 0 ? emptyState("No items match.") : `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>SKU</th><th>Name</th><th>Category</th>
              ${warehouses.map((w) => `<th class="num">${w.name}</th>`).join("")}
              <th class="num">Total</th><th class="num">Reorder Level</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map((p) => {
              const total = warehouses.reduce((sum, w) => sum + (p.stock[w.id] || 0), 0);
              const low = total <= p.reorderLevel;
              return `
                <tr>
                  <td class="mono">${p.sku}</td>
                  <td>${escapeHtml(p.name)}</td>
                  <td>${escapeHtml(p.category)}</td>
                  ${warehouses.map((w) => `<td class="num">${(p.stock[w.id] || 0).toLocaleString()}</td>`).join("")}
                  <td class="num"><strong>${total.toLocaleString()} ${escapeHtml(p.unit)}</strong></td>
                  <td class="num">${p.reorderLevel.toLocaleString()}</td>
                  <td>${low ? `<span class="badge badge-warning">Low Stock</span>` : `<span class="badge badge-success">OK</span>`}</td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;
  }
  draw();
  container.querySelector("#inv-search").addEventListener("input", draw);
  container.querySelector("#cat-filter").addEventListener("change", draw);
}
