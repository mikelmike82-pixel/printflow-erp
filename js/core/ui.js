// Small UI helpers: toasts, modals, confirm dialogs (with an optional
// password re-entry step for destructive/sensitive actions).
import { getCurrentUser } from "./auth.js";

export function toast(message, type = "info") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function modalRoot() {
  let root = document.getElementById("modal-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "modal-root";
    document.body.appendChild(root);
  }
  return root;
}

export function closeModal() {
  const root = modalRoot();
  root.innerHTML = "";
}

export function openModal({ title, bodyHtml, onMount, size = "" }) {
  const root = modalRoot();
  root.innerHTML = `
    <div class="modal-overlay" data-close-overlay>
      <div class="modal" style="${size === 'lg' ? 'max-width:760px' : ''}">
        <div class="modal-header">
          <h2>${title}</h2>
          <button class="modal-close" data-close-modal aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
      </div>
    </div>`;
  root.querySelector("[data-close-overlay]").addEventListener("click", (e) => {
    if (e.target.hasAttribute("data-close-overlay")) closeModal();
  });
  // IMPORTANT: querySelectorAll, not querySelector — every modal has at
  // least two elements sharing this attribute (the header × button, and
  // a "Cancel" button in the body). A plain querySelector only ever binds
  // the first one, which silently left every Cancel button in the app
  // non-functional. Bind all of them, every time.
  root.querySelectorAll("[data-close-modal]").forEach((el) => el.addEventListener("click", closeModal));
  if (onMount) onMount(root);
}

// Standard confirmation for destructive/sensitive actions. If
// `requirePassword` is set, the current user must re-type their password
// (checked against the mock auth store) before onConfirm runs.
export function confirmAction({ title = "Are you sure?", message, confirmLabel = "Confirm", danger = true, requirePassword = false, onConfirm }) {
  openModal({
    title,
    bodyHtml: `
      <p style="font-size:14px;color:var(--text-secondary);line-height:1.5;margin-bottom:${requirePassword ? "16px" : "0"}">${message}</p>
      ${requirePassword ? `
        <div class="form-field">
          <label>Re-enter your password to confirm</label>
          <input type="password" id="confirm-password-input" autocomplete="current-password" />
          <div class="hint" id="confirm-password-error" style="color:var(--danger-fg);display:none;">Incorrect password.</div>
        </div>` : ""}
      <div class="form-actions">
        <button class="btn btn-secondary" data-close-modal>Cancel</button>
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" id="confirm-action-btn">${confirmLabel}</button>
      </div>
    `,
    onMount: (root) => {
      root.querySelector("[data-close-modal]").addEventListener("click", closeModal);
      root.querySelector("#confirm-action-btn").addEventListener("click", () => {
        if (requirePassword) {
          const input = root.querySelector("#confirm-password-input");
          const user = getCurrentUser();
          if (!user || input.value !== user.password) {
            root.querySelector("#confirm-password-error").style.display = "block";
            return;
          }
        }
        closeModal();
        onConfirm();
      });
    }
  });
}

export function badge(label, tone = "neutral") {
  return `<span class="badge badge-${tone}">${label}</span>`;
}

export function emptyState(message, icon = "—") {
  return `<div class="empty-state"><div class="icon">${icon}</div><div>${message}</div></div>`;
}
