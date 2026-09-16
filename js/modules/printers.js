import {
  getPrinters, getPrinterById, addPrinter, updatePrinter, deletePrinter, printerDependents,
  getCounterJobs,
} from "../core/store.js";
import { escapeHtml, formatCurrency } from "../core/format.js";
import { openModal, closeModal, toast, confirmAction, emptyState } from "../core/ui.js";
import { getCurrentUser } from "../core/auth.js";

const MATERIAL_CATEGORIES = ["Paper", "Ink", "Finishing", "Plates", "Print Media"];
const PRINTER_TYPES = ["Large Format Plotter", "Vinyl Cutter / Plotter", "Laser Printer", "Offset Press", "POS Receipt Printer", "Other"];

// The Print Bridge agent's local HTTP listener (see
// windows-print-bridge/print-agent.ps1) — same one printCounter.js talks
// to for releasing/discarding held jobs. Only reachable from the same
// computer the agent is running on.
const PRINT_AGENT_URL = "http://127.0.0.1:8899";

async function detectRealPrinters() {
  try {
    const res = await fetch(`${PRINT_AGENT_URL}/printers`);
    if (!res.ok) return { ok: false, error: `Print Bridge agent responded with an error (HTTP ${res.status}).` };
    const printers = await res.json();
    return { ok: true, printers };
  } catch {
    return { ok: false, error: "Couldn't reach the Print Bridge agent on this computer — make sure Install.bat has been run and the agent is running." };
  }
}

function canManage() {
  return getCurrentUser()?.role === "ADMIN";
}

export function render(container) {
  const printers = getPrinters();
  const manage = canManage();
  const jobs = getCounterJobs();

  container.innerHTML = `
    <div class="page-header">
      <div><h1>Printers / Plotters</h1><div class="page-subtitle">${printers.length} machines — used by the Print Counter workflow</div></div>
      <div class="page-actions">
        ${manage ? `<button class="btn btn-secondary" id="detect-printers-btn">Detect from This Computer</button><button class="btn btn-primary" id="new-printer-btn">+ New Printer</button>` : ""}
      </div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Type</th><th>Model</th><th>Windows Printer</th><th>Materials</th><th class="num">Jobs</th><th class="num">Revenue</th><th>Status</th>${manage ? "<th></th>" : ""}</tr></thead>
        <tbody>
          ${printers.map((p) => {
            const printerJobs = jobs.filter((j) => j.printerId === p.id);
            const revenue = printerJobs.reduce((s, j) => s + j.total, 0);
            return `
            <tr>
              <td><strong>${escapeHtml(p.name)}</strong></td>
              <td>${escapeHtml(p.type)}</td>
              <td>${escapeHtml(p.model || "—")}</td>
              <td>${p.windowsPrinterName ? `<span class="mono">${escapeHtml(p.windowsPrinterName)}</span>` : `<span class="text-muted">Not linked</span>`}</td>
              <td>${p.supportedCategories.length ? p.supportedCategories.map((c) => `<span class="badge badge-neutral" style="margin-right:4px;">${escapeHtml(c)}</span>`).join("") : "<span class=\"text-muted\">—</span>"}</td>
              <td class="num">${printerJobs.length}</td>
              <td class="num">${formatCurrency(revenue)}</td>
              <td>${p.status === "Active" ? `<span class="badge badge-success">Active</span>` : `<span class="badge badge-neutral">Inactive</span>`}</td>
              ${manage ? `<td><div class="row-actions"><button class="btn btn-ghost btn-icon" data-edit="${p.id}" title="Edit" aria-label="Edit">✎</button><button class="btn btn-ghost btn-icon" data-delete="${p.id}" title="Delete" aria-label="Delete">🗑</button></div></td>` : ""}
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  if (printers.length === 0) container.querySelector(".table-wrap").innerHTML = emptyState("No printers set up yet.");

  container.querySelectorAll("[data-edit]").forEach((el) => {
    el.addEventListener("click", () => openPrinterModal(getPrinterById(el.dataset.edit), () => render(container)));
  });
  container.querySelectorAll("[data-delete]").forEach((el) => {
    el.addEventListener("click", () => handleDeletePrinter(el.dataset.delete, () => render(container)));
  });
  if (manage) {
    container.querySelector("#new-printer-btn").addEventListener("click", () => openPrinterModal(null, () => render(container)));
    container.querySelector("#detect-printers-btn").addEventListener("click", () => openDetectPrintersModal(() => render(container)));
  }
}

async function openDetectPrintersModal(onImported) {
  toast("Looking for printers on this computer...");
  const result = await detectRealPrinters();
  if (!result.ok) { toast(result.error, "danger"); return; }

  const existingWindowsNames = new Set(getPrinters().map((p) => p.windowsPrinterName).filter(Boolean));
  const found = result.printers || [];
  const newOnes = found.filter((p) => !existingWindowsNames.has(p.name));

  if (found.length === 0) {
    toast("No real printers were found on this computer — only virtual ones like \"Microsoft Print to PDF\" are excluded from detection.", "danger");
    return;
  }
  if (newOnes.length === 0) {
    toast("No new printers found — every printer this computer sees is already in your list.", "success");
    return;
  }

  openModal({
    title: "Detect Printers from This Computer",
    size: "lg",
    bodyHtml: `
      <p class="text-secondary" style="font-size:13px; margin-bottom:12px;">
        Found ${newOnes.length} printer${newOnes.length === 1 ? "" : "s"} on this computer that ${newOnes.length === 1 ? "isn't" : "aren't"} in your list yet.
        Pick which to add — each is imported with its exact Windows name already linked, so the Print Bridge can match jobs to it right away.
        Set its type and supported materials afterward from Edit.
      </p>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${newOnes.map((p, i) => `
          <label style="display:flex; align-items:flex-start; gap:10px; padding:10px; border:1px solid var(--border-default); border-radius:6px; font-weight:400;">
            <input type="checkbox" class="f-detected" value="${i}" checked style="margin-top:3px;" />
            <span>
              <strong>${escapeHtml(p.name)}</strong>
              ${p.gated ? `<span class="badge badge-success" style="margin-left:6px;">Already routed via Print Bridge</span>` : `<span class="badge badge-neutral" style="margin-left:6px;">Not gated yet</span>`}
              <br /><span class="text-muted" style="font-size:12px;">${escapeHtml(p.driverName || "")}</span>
            </span>
          </label>
        `).join("")}
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="import-detected-btn">Import Selected</button>
      </div>
    `,
    onMount: (root) => {
      root.querySelector("#import-detected-btn").addEventListener("click", () => {
        const selected = [...root.querySelectorAll(".f-detected:checked")].map((el) => newOnes[Number(el.value)]);
        if (selected.length === 0) { toast("Select at least one printer to import.", "danger"); return; }
        selected.forEach((p) => {
          addPrinter({
            name: p.name,
            type: "Other",
            model: p.driverName || "",
            location: "",
            status: "Active",
            windowsPrinterName: p.name,
            supportedCategories: [],
          });
        });
        closeModal();
        toast(`${selected.length} printer${selected.length === 1 ? "" : "s"} imported — set type and supported materials from Edit.`, "success");
        onImported();
      });
    },
  });
}

function handleDeletePrinter(printerId, onDeleted) {
  const printer = getPrinterById(printerId);
  if (!printer) return;
  const dep = printerDependents(printerId);
  if (dep.counterJobs > 0) {
    toast(`Cannot delete — ${dep.counterJobs} print job(s) on record. Mark it Inactive instead.`, "danger");
    return;
  }
  confirmAction({
    title: "Delete Printer",
    message: `Delete "${escapeHtml(printer.name)}"? This cannot be undone.`,
    confirmLabel: "Delete",
    onConfirm: () => {
      const result = deletePrinter(printerId);
      if (result.ok) { toast("Printer deleted.", "success"); onDeleted(); }
      else toast(result.error, "danger");
    },
  });
}

function openPrinterModal(printer, onSaved) {
  const isEdit = !!printer;
  const selectedCats = new Set(printer?.supportedCategories || []);
  openModal({
    title: isEdit ? "Edit Printer" : "New Printer / Plotter",
    bodyHtml: `
      <div class="form-field"><label>Name *</label><input id="f-name" value="${escapeHtml(printer?.name || "")}" placeholder="e.g. Epson SureColor P8000" required /></div>
      <div class="form-grid">
        <div class="form-field">
          <label>Type</label>
          <select id="f-type">${PRINTER_TYPES.map((t) => `<option value="${t}" ${printer?.type === t ? "selected" : ""}>${t}</option>`).join("")}</select>
        </div>
        <div class="form-field"><label>Model</label><input id="f-model" value="${escapeHtml(printer?.model || "")}" /></div>
      </div>
      <div class="form-grid">
        <div class="form-field"><label>Location</label><input id="f-location" value="${escapeHtml(printer?.location || "")}" placeholder="e.g. Main Floor" /></div>
        <div class="form-field">
          <label>Status</label>
          <select id="f-status">
            <option value="Active" ${(!printer || printer.status === "Active") ? "selected" : ""}>Active</option>
            <option value="Inactive" ${printer?.status === "Inactive" ? "selected" : ""}>Inactive</option>
          </select>
        </div>
      </div>
      <div class="form-field">
        <label>Windows Printer Name (for the Print Bridge)</label>
        <input id="f-windows-name" value="${escapeHtml(printer?.windowsPrinterName || "")}" placeholder="Exactly as it appears in Windows' Printers &amp; Scanners" />
        <div class="hint">Leave blank if this machine isn't connected to a computer running the Print Bridge yet. Must match the real Windows printer name exactly — that's how a print job sent to it gets matched back to this record.</div>
      </div>
      <div class="form-field">
        <label>Supported Materials</label>
        <div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:4px;">
          ${MATERIAL_CATEGORIES.map((c) => `
            <label style="display:flex; align-items:center; gap:5px; font-size:13px; font-weight:400;">
              <input type="checkbox" class="f-cat" value="${c}" ${selectedCats.has(c) ? "checked" : ""} /> ${c}
            </label>
          `).join("")}
        </div>
        <div class="hint">Used to filter the material picker in the Print Counter workflow to what this machine can actually run.</div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="save-printer">${isEdit ? "Save Changes" : "Save Printer"}</button>
      </div>
    `,
    onMount: (root) => {
      root.querySelector("#save-printer").addEventListener("click", () => {
        const name = root.querySelector("#f-name").value.trim();
        if (!name) { toast("Printer name is required.", "danger"); return; }
        const data = {
          name,
          type: root.querySelector("#f-type").value,
          model: root.querySelector("#f-model").value.trim(),
          location: root.querySelector("#f-location").value.trim(),
          status: root.querySelector("#f-status").value,
          windowsPrinterName: root.querySelector("#f-windows-name").value.trim(),
          supportedCategories: [...root.querySelectorAll(".f-cat:checked")].map((el) => el.value),
        };
        if (isEdit) updatePrinter(printer.id, data);
        else addPrinter(data);
        closeModal();
        toast(isEdit ? "Printer updated." : "Printer added.", "success");
        if (onSaved) onSaved();
      });
    },
  });
}
