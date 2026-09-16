import { MOCK_USERS, getCurrentUser, addMockUser, updateMockUser, deleteMockUser } from "../core/auth.js";
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
              <td><span class="badge ${u.role === "ADMIN" ? "badge-success" : "badge-info"}">${ROLES[u.role]}</span></td>
              <td>
                <div class="row-actions" style="justify-content:flex-end;">
                  ${u.id === getCurrentUser()?.id ? `<span class="text-muted" style="font-size:12px;">You</span>` : `<button class="btn btn-ghost btn-sm" data-toggle-role="${u.id}">${u.role === "ADMIN" ? "Make Operator" : "Grant Admin Access"}</button>`}
                  <button class="btn btn-ghost btn-icon" data-edit="${u.id}" title="Edit" aria-label="Edit">✎</button>
                  <button class="btn btn-ghost btn-icon" data-delete="${u.id}" title="Delete" aria-label="Delete">🗑</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="card-title">About Roles</div>
      <div class="info-row"><span class="label">Admin</span><span class="value text-secondary">Full access to everything — Customers, Vendors, Purchasing, Stock, Bills, Reports, Printers, Users &amp; Settings. Only an Admin can grant Admin access to someone else.</span></div>
      <div class="info-row"><span class="label">Operator</span><span class="value text-secondary">Print Counter only. Signs in once and stays signed in — every print job sent from CorelDRAW, Word, or any other design software on this computer opens straight into the New Print Job screen from then on, no repeated login.</span></div>
    </div>
  `;

  container.querySelector("#new-user-btn").addEventListener("click", () => openUserModal(null, () => render(container)));

  container.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => openUserModal(MOCK_USERS.find((u) => u.id === btn.dataset.edit), () => render(container)));
  });

  container.querySelectorAll("[data-toggle-role]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const user = MOCK_USERS.find((u) => u.id === btn.dataset.toggleRole);
      const nextRole = user.role === "ADMIN" ? "OPERATOR" : "ADMIN";
      confirmAction({
        title: nextRole === "ADMIN" ? "Grant Admin Access" : "Remove Admin Access",
        message: nextRole === "ADMIN"
          ? `Give ${escapeHtml(user.name)} full Admin access to every module? This is a sensitive action — please confirm your password.`
          : `Restrict ${escapeHtml(user.name)} to Print Counter only? This is a sensitive action — please confirm your password.`,
        confirmLabel: nextRole === "ADMIN" ? "Grant Admin" : "Make Operator",
        requirePassword: true,
        onConfirm: () => {
          const result = updateMockUser(user.id, { name: user.name, email: user.email, role: nextRole });
          if (!result.ok) { toast(result.error, "danger"); return; }
          toast(`${user.name} is now ${ROLES[nextRole]}.`, "success");
          render(container);
        },
      });
    });
  });

  container.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const user = MOCK_USERS.find((u) => u.id === btn.dataset.delete);
      confirmAction({
        title: "Delete User",
        message: `This permanently removes ${escapeHtml(user.name)}'s account — they'll no longer be able to log in. This is a sensitive action — please confirm your password.`,
        confirmLabel: "Delete",
        requirePassword: true,
        onConfirm: () => {
          const result = deleteMockUser(user.id);
          if (!result.ok) { toast(result.error, "danger"); return; }
          toast(`${user.name} has been removed.`, "success");
          render(container);
        },
      });
    });
  });
}

function openUserModal(user, onSaved) {
  const isEdit = !!user;
  openModal({
    title: isEdit ? "Edit User" : "Add User",
    bodyHtml: `
      <div class="form-field"><label>Full Name *</label><input id="f-name" value="${escapeHtml(user?.name || "")}" /></div>
      <div class="form-field"><label>Email *</label><input id="f-email" type="email" value="${escapeHtml(user?.email || "")}" /></div>
      <div class="form-field">
        <label>Password ${isEdit ? "" : "*"}</label>
        <input id="f-password" type="password" autocomplete="new-password" placeholder="${isEdit ? "Leave blank to keep current password" : ""}" />
      </div>
      <div class="form-field">
        <label>Role</label>
        <select id="f-role">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${user?.role === k ? "selected" : ""}>${v}</option>`).join("")}</select>
        <div class="hint">Operator can only open the Print Counter. Admin has full access and can grant Admin to anyone else later from this page.</div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="save-user">${isEdit ? "Save Changes" : "Add User"}</button>
      </div>
    `,
    onMount: (root) => {
      root.querySelector("#save-user").addEventListener("click", () => {
        const name = root.querySelector("#f-name").value.trim();
        const email = root.querySelector("#f-email").value.trim();
        const password = root.querySelector("#f-password").value;
        const role = root.querySelector("#f-role").value;
        const result = isEdit
          ? updateMockUser(user.id, { name, email, password, role })
          : addMockUser({ name, email, password, role });
        if (!result.ok) { toast(result.error, "danger"); return; }
        closeModal();
        toast(isEdit ? "User updated." : "User added.", "success");
        onSaved();
      });
    },
  });
}
