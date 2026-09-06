import {
  getLeads, getLeadById, addLead, updateLeadStage, addLeadContact,
  addFollowUp, toggleFollowUp, convertLeadToCustomer,
} from "../core/store.js";
import { formatDate, relativeDay, escapeHtml, todayLocalISO } from "../core/format.js";
import { navigateTo } from "../core/router.js";
import { openModal, closeModal, confirmAction, toast, badge, emptyState } from "../core/ui.js";

const STAGES = ["New", "Contacted", "Quoted", "Won", "Lost"];
const STAGE_TONE = { New: "neutral", Contacted: "info", Quoted: "warning", Won: "success", Lost: "danger" };

export function render(container, params) {
  if (params.lead) {
    renderLeadDetail(container, params.lead);
  } else {
    renderPipeline(container);
  }
}

function renderPipeline(container) {
  const leads = getLeads();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Leads &amp; Pipeline</h1>
        <div class="page-subtitle">${leads.length} leads · ${leads.filter(l => !["Won","Lost"].includes(l.stage)).length} active</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="new-lead-btn">+ New Lead</button>
      </div>
    </div>

    <div class="filter-bar">
      <input type="search" id="lead-search" placeholder="Search leads or companies..." />
    </div>

    <div id="pipeline-board" style="display:grid; grid-template-columns:repeat(5,1fr); gap:12px; align-items:start;"></div>
  `;

  const board = container.querySelector("#pipeline-board");

  function draw(filterText = "") {
    const q = filterText.trim().toLowerCase();
    board.innerHTML = STAGES.map((stage) => {
      const items = leads.filter((l) => l.stage === stage && (
        !q || l.name.toLowerCase().includes(q) || (l.company || "").toLowerCase().includes(q)
      ));
      return `
        <div class="card" style="padding:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.03em; color:var(--text-secondary);">${stage}</span>
            <span class="badge badge-neutral">${items.length}</span>
          </div>
          ${items.length === 0 ? `<div class="text-muted" style="font-size:12px; padding:8px 0;">No leads</div>` : items.map((l) => `
            <div class="card row-link" data-lead="${l.id}" style="padding:10px; margin-bottom:8px; cursor:pointer;">
              <div style="font-weight:600; font-size:13px;">${escapeHtml(l.company || l.name)}</div>
              <div class="text-muted" style="font-size:12px;">${escapeHtml(l.name)}</div>
              <div style="font-size:12px; margin-top:6px; color:var(--text-secondary);">Rs ${Number(l.estValue).toLocaleString()}</div>
            </div>
          `).join("")}
        </div>`;
    }).join("");

    board.querySelectorAll("[data-lead]").forEach((el) => {
      el.addEventListener("click", () => navigateTo("crm", { lead: el.dataset.lead }));
    });
  }

  draw();
  container.querySelector("#lead-search").addEventListener("input", (e) => draw(e.target.value));
  container.querySelector("#new-lead-btn").addEventListener("click", () => openNewLeadModal());
}

function openNewLeadModal() {
  openModal({
    title: "New Lead",
    bodyHtml: `
      <div class="form-field"><label>Contact Name *</label><input id="f-name" required /></div>
      <div class="form-field"><label>Company</label><input id="f-company" /></div>
      <div class="form-field"><label>Phone</label><input id="f-phone" /></div>
      <div class="form-field"><label>Email</label><input id="f-email" type="email" /></div>
      <div class="form-field">
        <label>Source</label>
        <select id="f-source">
          <option>Referral</option><option>Website</option><option>Cold Call</option>
          <option>Walk-in</option><option>Trade Show</option><option>Other</option>
        </select>
      </div>
      <div class="form-field"><label>Estimated Value (Rs)</label><input id="f-value" type="number" min="0" value="0" /></div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="save-lead">Save Lead</button>
      </div>
    `,
    onMount: (root) => {
      root.querySelector("[data-close-modal]").addEventListener("click", closeModal);
      root.querySelector("#save-lead").addEventListener("click", () => {
        const name = root.querySelector("#f-name").value.trim();
        if (!name) { toast("Contact name is required.", "danger"); return; }
        addLead({
          name,
          company: root.querySelector("#f-company").value.trim(),
          phone: root.querySelector("#f-phone").value.trim(),
          email: root.querySelector("#f-email").value.trim(),
          source: root.querySelector("#f-source").value,
          estValue: Number(root.querySelector("#f-value").value) || 0,
        });
        closeModal();
        toast("Lead added.", "success");
        navigateTo("crm");
        render(document.getElementById("content"), {});
      });
    },
  });
}

function renderLeadDetail(container, leadId) {
  const lead = getLeadById(leadId);
  if (!lead) {
    container.innerHTML = emptyState("Lead not found.");
    return;
  }

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div style="margin-bottom:6px;"><a href="#/crm">&larr; Back to pipeline</a></div>
        <h1>${escapeHtml(lead.company || lead.name)}</h1>
        <div class="page-subtitle">${escapeHtml(lead.name)} · ${escapeHtml(lead.phone || "")} · ${escapeHtml(lead.email || "")}</div>
      </div>
      <div class="page-actions">
        ${badge(lead.stage, STAGE_TONE[lead.stage])}
        ${!["Won", "Lost"].includes(lead.stage) ? `<button class="btn btn-primary" id="convert-btn">Convert to Customer</button>` : ""}
      </div>
    </div>

    <div class="detail-grid">
      <div>
        <div class="card">
          <div class="card-title">Contact History</div>
          <div id="timeline-wrap">${renderTimeline(lead)}</div>
          <button class="btn btn-secondary btn-sm" id="add-contact-btn" style="margin-top:10px;">+ Log Contact</button>
        </div>
      </div>
      <div>
        <div class="card">
          <div class="card-title">Lead Details</div>
          <div class="info-row"><span class="label">Source</span><span class="value">${escapeHtml(lead.source || "—")}</span></div>
          <div class="info-row"><span class="label">Estimated Value</span><span class="value">Rs ${Number(lead.estValue).toLocaleString()}</span></div>
          <div class="info-row"><span class="label">Created</span><span class="value">${formatDate(lead.createdAt)}</span></div>
          <div class="info-row"><span class="label">Stage</span><span class="value">
            <select id="stage-select">
              ${STAGES.map((s) => `<option value="${s}" ${s === lead.stage ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </span></div>
        </div>

        <div class="card">
          <div class="card-title">Follow-Ups</div>
          ${lead.followUps.length === 0 ? emptyState("No follow-ups scheduled.") : `
            <ul>
              ${lead.followUps.map((f) => `
                <li class="info-row">
                  <span class="label">
                    <input type="checkbox" data-followup="${f.id}" ${f.done ? "checked" : ""} style="margin-right:6px;" />
                    <span style="${f.done ? "text-decoration:line-through;color:var(--text-muted);" : ""}">${escapeHtml(f.note)}</span>
                  </span>
                  <span class="value">${relativeDay(f.dueDate)}</span>
                </li>
              `).join("")}
            </ul>
          `}
          <button class="btn btn-secondary btn-sm" id="add-followup-btn" style="margin-top:10px;">+ Add Follow-Up</button>
        </div>
      </div>
    </div>
  `;

  container.querySelector("#stage-select").addEventListener("change", (e) => {
    updateLeadStage(lead.id, e.target.value);
    toast("Stage updated.", "success");
    renderLeadDetail(container, leadId);
  });

  container.querySelectorAll("[data-followup]").forEach((el) => {
    el.addEventListener("change", () => {
      toggleFollowUp(lead.id, el.dataset.followup);
      renderLeadDetail(container, leadId);
    });
  });

  container.querySelector("#add-contact-btn").addEventListener("click", () => {
    openModal({
      title: "Log Contact",
      bodyHtml: `
        <div class="form-field">
          <label>Type</label>
          <select id="c-type"><option>Call</option><option>Email</option><option>Meeting</option><option>Note</option></select>
        </div>
        <div class="form-field"><label>Notes</label><textarea id="c-note" rows="3"></textarea></div>
        <div class="form-actions">
          <button class="btn btn-secondary" data-close-modal>Cancel</button>
          <button class="btn btn-primary" id="save-contact">Save</button>
        </div>
      `,
      onMount: (root) => {
        root.querySelector("[data-close-modal]").addEventListener("click", closeModal);
        root.querySelector("#save-contact").addEventListener("click", () => {
          const note = root.querySelector("#c-note").value.trim();
          if (!note) { toast("Add a note first.", "danger"); return; }
          addLeadContact(lead.id, { type: root.querySelector("#c-type").value, note });
          closeModal();
          renderLeadDetail(container, leadId);
        });
      },
    });
  });

  container.querySelector("#add-followup-btn").addEventListener("click", () => {
    openModal({
      title: "Add Follow-Up",
      bodyHtml: `
        <div class="form-field"><label>Due Date</label><input type="date" id="f-due" value="${todayLocalISO()}" /></div>
        <div class="form-field"><label>Note</label><input id="f-note" placeholder="e.g. Call to confirm quote" /></div>
        <div class="form-actions">
          <button class="btn btn-secondary" data-close-modal>Cancel</button>
          <button class="btn btn-primary" id="save-followup">Save</button>
        </div>
      `,
      onMount: (root) => {
        root.querySelector("[data-close-modal]").addEventListener("click", closeModal);
        root.querySelector("#save-followup").addEventListener("click", () => {
          const note = root.querySelector("#f-note").value.trim();
          if (!note) { toast("Add a note first.", "danger"); return; }
          addFollowUp(lead.id, { note, dueDate: root.querySelector("#f-due").value });
          closeModal();
          renderLeadDetail(container, leadId);
        });
      },
    });
  });

  const convertBtn = container.querySelector("#convert-btn");
  if (convertBtn) {
    convertBtn.addEventListener("click", () => {
      confirmAction({
        title: "Convert Lead to Customer",
        message: `This creates a new customer record from "${escapeHtml(lead.company || lead.name)}" and marks this lead as Won.`,
        confirmLabel: "Convert",
        danger: false,
        onConfirm: () => {
          const customer = convertLeadToCustomer(lead.id);
          toast(`Converted to customer ${customer.name}.`, "success");
          navigateTo("customers", { customer: customer.id });
        },
      });
    });
  }
}

function renderTimeline(lead) {
  if (lead.contactHistory.length === 0) return emptyState("No contact logged yet.");
  const sorted = [...lead.contactHistory].sort((a, b) => b.ts.localeCompare(a.ts));
  return `<div class="timeline">
    ${sorted.map((c) => `
      <div class="timeline-item">
        <div class="ts">${formatDate(c.ts)} · ${escapeHtml(c.by)} · ${escapeHtml(c.type)}</div>
        <div class="body">${escapeHtml(c.note)}</div>
      </div>
    `).join("")}
  </div>`;
}
