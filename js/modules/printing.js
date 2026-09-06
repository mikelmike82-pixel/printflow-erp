import {
  getPrintJobs, getPrintJobById, advancePrintJobStage, addPrintJob,
  PRINT_JOB_STAGES, getSalesOrderById, getCustomerById, getProductById,
  getSalesOrders,
} from "../core/store.js";
import { formatDate, relativeDay, escapeHtml, todayLocalISO } from "../core/format.js";
import { navigateTo } from "../core/router.js";
import { openModal, closeModal, confirmAction, toast, emptyState } from "../core/ui.js";

const STAGE_TONE = {
  Design: "neutral", Proofing: "info", "Plate Setup": "info",
  Printing: "warning", Finishing: "warning", Completed: "success",
};

export function render(container, params) {
  if (params.job) {
    renderJobDetail(container, params.job);
  } else {
    renderJobList(container);
  }
}

function renderJobList(container) {
  const jobs = getPrintJobs();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Print Jobs</h1>
        <div class="page-subtitle">${jobs.length} jobs · ${jobs.filter(j => j.stage !== "Completed").length} in progress</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="new-job-btn">+ New Print Job</button>
      </div>
    </div>

    <div class="filter-bar">
      <input type="search" id="job-search" placeholder="Search job #, customer, description..." />
      <select id="stage-filter">
        <option value="">All Stages</option>
        ${PRINT_JOB_STAGES.map((s) => `<option value="${s}">${s}</option>`).join("")}
      </select>
    </div>

    <div id="job-table-wrap"></div>
  `;

  const wrap = container.querySelector("#job-table-wrap");

  function draw() {
    const q = container.querySelector("#job-search").value.trim().toLowerCase();
    const stageFilter = container.querySelector("#stage-filter").value;
    const filtered = jobs.filter((j) => {
      const customer = getCustomerById(j.customerId);
      const matchesText = !q || j.jobNo.toLowerCase().includes(q) || j.description.toLowerCase().includes(q) || (customer?.name || "").toLowerCase().includes(q);
      const matchesStage = !stageFilter || j.stage === stageFilter;
      return matchesText && matchesStage;
    });

    wrap.innerHTML = filtered.length === 0 ? emptyState("No print jobs match.") : `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Job #</th><th>Customer</th><th>Description</th><th>Qty</th><th>Machine</th><th>Stage</th><th>Due</th></tr></thead>
          <tbody>
            ${filtered.map((j) => `
              <tr class="row-link" data-job="${j.id}">
                <td class="mono">${j.jobNo}</td>
                <td>${escapeHtml(getCustomerById(j.customerId)?.name || "—")}</td>
                <td>${escapeHtml(j.description)}</td>
                <td class="num">${Number(j.quantity).toLocaleString()}</td>
                <td>${escapeHtml(j.machine || "—")}</td>
                <td><span class="badge badge-${STAGE_TONE[j.stage] || "neutral"}">${j.stage}</span></td>
                <td>${relativeDay(j.dueDate)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>`;

    wrap.querySelectorAll("[data-job]").forEach((el) => {
      el.addEventListener("click", () => navigateTo("printing", { job: el.dataset.job }));
    });
  }

  draw();
  container.querySelector("#job-search").addEventListener("input", draw);
  container.querySelector("#stage-filter").addEventListener("change", draw);
  container.querySelector("#new-job-btn").addEventListener("click", () => openNewJobModal());
}

function openNewJobModal() {
  const orders = getSalesOrders();
  openModal({
    title: "New Print Job",
    size: "lg",
    bodyHtml: `
      <div class="form-grid">
        <div class="form-field">
          <label>Sales Order</label>
          <select id="f-so">
            <option value="">— Not linked —</option>
            ${orders.map((o) => `<option value="${o.id}">${o.orderNo} — ${getCustomerById(o.customerId)?.name}</option>`).join("")}
          </select>
        </div>
        <div class="form-field"><label>Quantity</label><input type="number" id="f-qty" min="1" /></div>
        <div class="form-field full"><label>Job Description</label><input id="f-desc" placeholder="e.g. Product label printing, gloss finish" /></div>
        <div class="form-field"><label>Material</label><input id="f-material" placeholder="e.g. Art Paper 130gsm" /></div>
        <div class="form-field"><label>Size</label><input id="f-size" placeholder="e.g. 60mm x 40mm" /></div>
        <div class="form-field"><label>Machine / Press</label><input id="f-machine" placeholder="e.g. Heidelberg SM-74" /></div>
        <div class="form-field"><label>Due Date</label><input type="date" id="f-due" /></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="save-job">Create Job</button>
      </div>
    `,
    onMount: (root) => {
      root.querySelector("[data-close-modal]").addEventListener("click", closeModal);
      root.querySelector("#save-job").addEventListener("click", () => {
        const description = root.querySelector("#f-desc").value.trim();
        const qty = Number(root.querySelector("#f-qty").value);
        if (!description || !qty) { toast("Description and quantity are required.", "danger"); return; }
        const soId = root.querySelector("#f-so").value || null;
        const so = soId ? getSalesOrderById(soId) : null;
        const job = addPrintJob({
          salesOrderId: soId,
          customerId: so ? so.customerId : null,
          description,
          quantity: qty,
          material: root.querySelector("#f-material").value.trim(),
          size: root.querySelector("#f-size").value.trim(),
          machine: root.querySelector("#f-machine").value.trim(),
          dueDate: root.querySelector("#f-due").value || todayLocalISO(),
        });
        closeModal();
        toast("Print job created.", "success");
        navigateTo("printing", { job: job.id });
      });
    },
  });
}

function renderJobDetail(container, jobId) {
  const job = getPrintJobById(jobId);
  if (!job) { container.innerHTML = emptyState("Print job not found."); return; }
  const customer = job.customerId ? getCustomerById(job.customerId) : null;
  const so = job.salesOrderId ? getSalesOrderById(job.salesOrderId) : null;
  const currentIdx = PRINT_JOB_STAGES.indexOf(job.stage);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div style="margin-bottom:6px;"><a href="#/printing">&larr; Back to print jobs</a></div>
        <h1>${job.jobNo}</h1>
        <div class="page-subtitle">${escapeHtml(job.description)}</div>
      </div>
      <div class="page-actions">
        ${currentIdx < PRINT_JOB_STAGES.length - 1 ? `<button class="btn btn-primary" id="advance-btn">Advance to "${PRINT_JOB_STAGES[currentIdx + 1]}"</button>` : `<span class="badge badge-success">Completed</span>`}
      </div>
    </div>

    <div class="stepper">
      ${PRINT_JOB_STAGES.map((stage, i) => `
        ${i > 0 ? `<div class="step-line ${i <= currentIdx ? "done" : ""}"></div>` : ""}
        <div class="step ${i < currentIdx ? "done" : i === currentIdx ? "current" : ""}">
          <div class="step-dot">${i < currentIdx ? "✓" : i + 1}</div>
          <div class="step-label">${stage}</div>
        </div>
      `).join("")}
    </div>

    <div class="detail-grid">
      <div>
        <div class="card">
          <div class="card-title">Job Details</div>
          <div class="info-row"><span class="label">Customer</span><span class="value">${customer ? `<a href="#/customers?customer=${customer.id}">${escapeHtml(customer.name)}</a>` : "—"}</span></div>
          <div class="info-row"><span class="label">Sales Order</span><span class="value">${so ? `<a href="#/sales-orders?order=${so.id}">${so.orderNo}</a>` : "—"}</span></div>
          <div class="info-row"><span class="label">Quantity</span><span class="value">${Number(job.quantity).toLocaleString()}</span></div>
          <div class="info-row"><span class="label">Material</span><span class="value">${escapeHtml(job.material || "—")}</span></div>
          <div class="info-row"><span class="label">Size</span><span class="value">${escapeHtml(job.size || "—")}</span></div>
          <div class="info-row"><span class="label">Machine / Press</span><span class="value">${escapeHtml(job.machine || "—")}</span></div>
          <div class="info-row"><span class="label">Finishing</span><span class="value">${job.finishing.length ? job.finishing.join(", ") : "—"}</span></div>
          <div class="info-row"><span class="label">Due Date</span><span class="value">${formatDate(job.dueDate)} (${relativeDay(job.dueDate)})</span></div>
        </div>

        <div class="card">
          <div class="card-title">Material Consumption</div>
          ${job.materialConsumption.length === 0 ? emptyState("No material recorded against this job yet.") : `
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>Material</th><th class="num">Qty Consumed</th></tr></thead>
                <tbody>
                  ${job.materialConsumption.map((m) => {
                    const p = getProductById(m.productId);
                    return `<tr><td>${escapeHtml(p?.name || m.productId)}</td><td class="num">${m.qty} ${escapeHtml(p?.unit || "")}</td></tr>`;
                  }).join("")}
                </tbody>
              </table>
            </div>`}
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-title">Stage History</div>
          <div class="timeline">
            ${[...job.stageHistory].reverse().map((h) => `
              <div class="timeline-item">
                <div class="ts">${formatDate(h.at)} · ${escapeHtml(h.by)}</div>
                <div class="body">Moved to <strong>${h.stage}</strong></div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    </div>
  `;

  const advanceBtn = container.querySelector("#advance-btn");
  if (advanceBtn) {
    advanceBtn.addEventListener("click", () => {
      const nextStage = PRINT_JOB_STAGES[currentIdx + 1];
      confirmAction({
        title: "Advance Print Job",
        message: `Move ${job.jobNo} from "${job.stage}" to "${nextStage}"?`,
        confirmLabel: "Advance",
        danger: false,
        onConfirm: () => {
          advancePrintJobStage(job.id, nextStage);
          toast(`Job moved to ${nextStage}.`, "success");
          renderJobDetail(container, jobId);
        },
      });
    });
  }
}
