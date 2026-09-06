import { loadAuditLog } from "../core/store.js";
import { formatDateTime, escapeHtml } from "../core/format.js";

export function render(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Audit Trail</h1>
        <div class="page-subtitle">Loaded on demand — not a live feed, so it doesn't cost a real-time listener on every login.</div>
      </div>
    </div>
    <div id="audit-content">
      <div class="card">
        <p class="text-secondary" style="font-size:13px; margin-bottom:14px;">
          This log records who did what, and when. In Phase 2 it will read from Firestore only when you open this
          page (never a live listener), and old entries will auto-expire after a set retention period.
        </p>
        <button class="btn btn-primary" id="load-audit-btn">Load Audit Trail</button>
      </div>
    </div>
  `;

  container.querySelector("#load-audit-btn").addEventListener("click", () => {
    const entries = loadAuditLog();
    container.querySelector("#audit-content").innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Timestamp</th><th>User</th><th>Module</th><th>Action</th><th>Details</th></tr></thead>
          <tbody>
            ${entries.map((e) => `
              <tr>
                <td>${formatDateTime(e.ts)}</td>
                <td>${escapeHtml(e.user)}</td>
                <td><span class="badge badge-neutral">${escapeHtml(e.module)}</span></td>
                <td>${escapeHtml(e.action)}</td>
                <td class="text-secondary">${escapeHtml(e.details)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  });
}
