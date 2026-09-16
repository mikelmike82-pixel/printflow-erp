import { getProducts, getWarehouses, adjustStock, addProduct, updateProduct, deleteProduct, productDependents } from "../core/store.js";
import { escapeHtml } from "../core/format.js";
import { emptyState, openModal, closeModal, toast, confirmAction } from "../core/ui.js";
import { getCurrentUser } from "../core/auth.js";

function canManage() {
  return getCurrentUser()?.role === "ADMIN";
}

// Suggested categories only — shown as a datalist so a real deployment
// isn't locked to exactly these, but new users get a sensible starting
// point that matches what the Print Counter's material picker and the
// Printers screen's "supported materials" checkboxes expect to see.
const SUGGESTED_CATEGORIES = ["Paper", "Ink", "Finishing", "Plates", "Print Media"];

// Simplified to a single running total per item — this shop runs off one
// stock pool day to day, so a per-warehouse breakdown just added a
// question ("which warehouse?") nobody here actually needs answered, but
// a manual correction (damage, miscount, an old paper record) still needs
// to target one specific warehouse under the hood.
export function render(container) {
  const products = getProducts();
  const manage = canManage();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Stock</h1>
        <div class="page-subtitle">${products.length} raw materials — paper, stickers, ink and everything else used to print</div>
      </div>
      <div class="page-actions">${manage ? `<button class="btn btn-primary" id="new-material-btn">+ New Material</button>` : ""}</div>
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

    wrap.innerHTML = filtered.length === 0 ? emptyState(products.length === 0 ? "No raw materials set up yet. Add the paper, ink, stickers and other supplies this shop uses." : "No items match.") : `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>SKU</th><th>Name</th><th>Category</th>
              <th class="num">In Stock</th><th class="num">Reorder Level</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map((p) => {
              const total = Object.values(p.stock).reduce((a, b) => a + b, 0);
              const low = total <= p.reorderLevel;
              return `
                <tr>
                  <td class="mono">${escapeHtml(p.sku)}</td>
                  <td>${escapeHtml(p.name)}</td>
                  <td>${escapeHtml(p.category)}</td>
                  <td class="num"><strong>${total.toLocaleString()} ${escapeHtml(p.unit)}</strong></td>
                  <td class="num">${p.reorderLevel.toLocaleString()}</td>
                  <td>${low ? `<span class="badge badge-warning">Low Stock</span>` : `<span class="badge badge-success">OK</span>`}</td>
                  <td>
                    <div class="row-actions">
                      ${manage ? `<button class="btn btn-ghost btn-sm" data-adjust="${p.id}">Adjust</button>` : ""}
                      ${manage ? `<button class="btn btn-ghost btn-icon" data-edit="${p.id}" title="Edit" aria-label="Edit">✎</button><button class="btn btn-ghost btn-icon" data-delete="${p.id}" title="Delete" aria-label="Delete">🗑</button>` : ""}
                    </div>
                  </td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;
    wrap.querySelectorAll("[data-adjust]").forEach((btn) => {
      btn.addEventListener("click", () => openAdjustModal(products.find((p) => p.id === btn.dataset.adjust), () => render(container)));
    });
    wrap.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => openMaterialModal(products.find((p) => p.id === btn.dataset.edit), () => render(container)));
    });
    wrap.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", () => handleDeleteMaterial(btn.dataset.delete, () => render(container)));
    });
  }
  draw();
  container.querySelector("#inv-search").addEventListener("input", draw);
  container.querySelector("#cat-filter").addEventListener("change", draw);
  if (manage) container.querySelector("#new-material-btn").addEventListener("click", () => openMaterialModal(null, () => render(container)));
}

function handleDeleteMaterial(productId, onDeleted) {
  const product = getProducts().find((p) => p.id === productId);
  if (!product) return;
  const dep = productDependents(productId);
  const total = dep.purchaseOrders + dep.grns + dep.counterJobs;
  if (total > 0) {
    toast(`Cannot delete — used on ${dep.purchaseOrders} purchase order(s), ${dep.grns} GRN(s) and ${dep.counterJobs} print counter job(s).`, "danger");
    return;
  }
  confirmAction({
    title: "Delete Material",
    message: `Delete "${escapeHtml(product.name)}"? This cannot be undone.`,
    confirmLabel: "Delete",
    onConfirm: () => {
      const result = deleteProduct(productId);
      if (result.ok) { toast("Material deleted.", "success"); onDeleted(); }
      else toast(result.error, "danger");
    },
  });
}

function openMaterialModal(product, onSaved) {
  const isEdit = !!product;
  openModal({
    title: isEdit ? "Edit Material" : "New Material",
    bodyHtml: `
      <div class="form-grid">
        <div class="form-field"><label>Name *</label><input id="f-mat-name" value="${escapeHtml(product?.name || "")}" placeholder="e.g. Art Paper 130gsm" /></div>
        <div class="form-field"><label>SKU *</label><input id="f-mat-sku" value="${escapeHtml(product?.sku || "")}" placeholder="e.g. PAP-ART130" /></div>
      </div>
      <div class="form-grid">
        <div class="form-field">
          <label>Category *</label>
          <input id="f-mat-category" list="mat-category-suggestions" value="${escapeHtml(product?.category || "")}" placeholder="e.g. Paper" />
          <datalist id="mat-category-suggestions">${SUGGESTED_CATEGORIES.map((c) => `<option value="${c}">`).join("")}</datalist>
          <div class="hint">Matches what a printer's "Supported Materials" and the Print Counter's material picker filter on.</div>
        </div>
        <div class="form-field"><label>Unit *</label><input id="f-mat-unit" value="${escapeHtml(product?.unit || "")}" placeholder="e.g. Sheet, Kg, Roll, Ft" /></div>
      </div>
      <div class="form-field"><label>Reorder Level</label><input id="f-mat-reorder" type="number" min="0" step="1" value="${product?.reorderLevel ?? 0}" /></div>
      ${!isEdit ? `<div class="hint">Starts at 0 stock in every warehouse — receive a GRN against a purchase order for it to bring stock in.</div>` : ""}
      <div class="form-actions">
        <button class="btn btn-secondary" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="save-material">${isEdit ? "Save Changes" : "Save Material"}</button>
      </div>
    `,
    onMount: (root) => {
      root.querySelector("#save-material").addEventListener("click", () => {
        const name = root.querySelector("#f-mat-name").value.trim();
        const sku = root.querySelector("#f-mat-sku").value.trim();
        const category = root.querySelector("#f-mat-category").value.trim();
        const unit = root.querySelector("#f-mat-unit").value.trim();
        const reorderLevel = Number(root.querySelector("#f-mat-reorder").value) || 0;
        if (!name || !sku || !category || !unit) { toast("Name, SKU, category and unit are all required.", "danger"); return; }
        if (isEdit) {
          updateProduct(product.id, { name, sku, category, unit, reorderLevel });
          toast("Material updated.", "success");
        } else {
          addProduct({ name, sku, category, unit, reorderLevel });
          toast("Material added.", "success");
        }
        closeModal();
        onSaved();
      });
    },
  });
}

function openAdjustModal(product, onSaved) {
  const warehouses = getWarehouses();
  openModal({
    title: `Adjust Stock — ${product.name}`,
    bodyHtml: `
      <p class="text-secondary" style="font-size:13px; margin-bottom:12px;">Use this for a manual correction — a physical count that doesn't match, damaged stock, or an old paper record — not for regular receiving (that's the GRN section).</p>
      <div class="form-grid">
        <div class="form-field">
          <label>Warehouse</label>
          <select id="f-adj-wh">${warehouses.map((w) => `<option value="${w.id}">${w.name}</option>`).join("")}</select>
        </div>
        <div class="form-field"><label>Correct Quantity (${escapeHtml(product.unit)}) *</label><input type="number" id="f-adj-qty" min="0" step="1" /></div>
      </div>
      <div class="form-field"><label>Reason (optional)</label><input id="f-adj-reason" placeholder="e.g. physical count, damaged stock" /></div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="save-adjust">Save Adjustment</button>
      </div>
    `,
    onMount: (root) => {
      const whSelect = root.querySelector("#f-adj-wh");
      const qtyInput = root.querySelector("#f-adj-qty");
      function fillCurrent() { qtyInput.value = product.stock[whSelect.value] || 0; }
      fillCurrent();
      whSelect.addEventListener("change", fillCurrent);
      root.querySelector("#save-adjust").addEventListener("click", () => {
        const newQty = Number(qtyInput.value);
        const result = adjustStock(product.id, whSelect.value, newQty, root.querySelector("#f-adj-reason").value.trim());
        if (!result.ok) { toast(result.error, "danger"); return; }
        closeModal();
        toast("Stock adjusted.", "success");
        onSaved();
      });
    },
  });
}
