import { MOCK_USERS, getCurrentUser } from "../core/auth.js";
import { ROLES } from "../core/rbac.js";
import { initials, escapeHtml } from "../core/format.js";
import { openModal, closeModal, confirmAction, toast } from "../core/ui.js";

export function render(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Users &amp; Roles</h1>
        <div class="page-subtitle">${MOCK_USERS.length} accounts · Phase 1 demo accounts (Firebase Authentication wires up in Phase 2)</div>
      </div>
      <div class="page-actions"><button class="btn btn-primary" id="new-user-btn">+ Add User</button></div>
    </div>

    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th></th><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
        <tbody>
          ${MOCK_USERS.map((u) => `
            <tr>
              <td><div class="user-avatar">${initials(u.name)}</div></td>
              <td><strong>${escapeHtml(u.name)}</strong></td>
              <td>${escapeHtml(u.email)}</td>
              <td><span class="badge badge-info">${ROLES[u.role]}</span></td>
              <td>${u.id === getCurrentUser()?.id ? `<span class="text-muted" style="font-size:12px;">You</span>` : `<button class="btn btn-ghost btn-sm" data-remove="${u.id}">Deactivate</button>`}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="card-title">About Roles</div>
      <div class="info-row"><span class="label">Super Admin</span><span class="value text-secondary">Full access to every module, including Users, Audit Trail and Settings.</span></div>
      <div class="info-row"><span class="label">Sales &amp; CRM</span><span class="value text-secondary">Leads, Customers, Sales Orders, Dispatch.</span></div>
      <div class="info-row"><span class="label">Production / Printing</span><span class="value text-secondary">Print Jobs, Inventory, GRN, Dispatch.</span></div>
      <div class="info-row"><span class="label">Accounts</span><span class="value text-secondary">Customers, Vendors, Purchasing, Invoicing, Ledger, PDCs, Reports.</span></div>
    </div>
  `;

  container.querySelector("#new-user-btn").addEventListener("click", () => {
    openModal({
      title: "Add User",
      bodyHtml: `
        <div class="form-field"><label>Full Name</label><input id="f-name" /></div>
        <div class="form-field"><label>Email</label><input id="f-email" type="email" /></div>
        <div class="form-field">
          <label>Role</label>
          <select id="f-role">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
        </div>
        <div class="hint" style="margin-bottom:12px;">In this Phase 1 demo, new users are illustrative only. Once Firebase Authentication is wired up in Phase 2, this creates a real login with a role-based permission set.</div>
        <div class="form-actions">
          <button class="btn btn-secondary" data-close-modal>Cancel</button>
          <button class="btn btn-primary" id="save-user">Add User</button>
        </div>
      `,
      onMount: (root) => {
        root.querySelector("[data-close-modal]").addEventListener("click", closeModal);
        root.querySelector("#save-user").addEventListener("click", () => {
          const name = root.querySelector("#f-name").value.trim();
          if (!name) { toast("Name is required.", "danger"); return; }
          closeModal();
          toast(`${name} would be invited as ${ROLES[root.querySelector("#f-role").value]}.`, "success");
        });
      },
    });
  });

  container.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const user = MOCK_USERS.find((u) => u.id === btn.dataset.remove);
      confirmAction({
        title: "Deactivate User",
        message: `This revokes ${escapeHtml(user.name)}'s access to PrintFlow ERP. This is a sensitive action — please confirm your password.`,
        confirmLabel: "Deactivate",
        requirePassword: true,
        onConfirm: () => toast(`${user.name} would be deactivated.`, "success"),
      });
    });
  });
}
