import { exportAllData } from "../core/store.js";
import { getCurrentUser } from "../core/auth.js";
import { toast, confirmAction } from "../core/ui.js";
import { todayLocalISO } from "../core/format.js";

export function render(container) {
  container.innerHTML = `
    <div class="page-header">
      <div><h1>Settings &amp; Backup</h1><div class="page-subtitle">Company preferences and data backup</div></div>
    </div>

    <div class="detail-grid">
      <div>
        <div class="card">
          <div class="card-title">Company Information</div>
          <div class="form-grid">
            <div class="form-field"><label>Company Name</label><input value="PrintFlow ERP" disabled /></div>
            <div class="form-field"><label>Currency</label><input value="PKR (Rs)" disabled /></div>
            <div class="form-field"><label>Timezone</label><input value="Asia/Karachi (PKT)" disabled /></div>
            <div class="form-field"><label>Fiscal Year Start</label><input value="July" disabled /></div>
          </div>
          <div class="hint">Editable once real business details are confirmed — this section is read-only in the Phase 1 demo.</div>
        </div>

        <div class="card">
          <div class="card-title">Data Backup &amp; Export</div>
          <p class="text-secondary" style="font-size:13px; margin-bottom:14px;">
            Export a full snapshot of the current data as a JSON file. In production, this sits alongside a scheduled
            server-side Firestore export (Cloud Scheduler) for automated daily backups — this button is the
            on-demand option for a quick manual copy.
          </p>
          <button class="btn btn-primary" id="export-btn">Export Data (JSON)</button>
        </div>

        <div class="card">
          <div class="card-title">Danger Zone</div>
          <p class="text-secondary" style="font-size:13px; margin-bottom:14px;">Restoring a backup overwrites current data. This always requires confirmation and your password.</p>
          <button class="btn btn-danger btn-sm" id="restore-btn">Import / Restore Backup...</button>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-title">Signed In As</div>
          <div id="whoami"></div>
        </div>
        <div class="card">
          <div class="card-title">Build Info</div>
          <div class="info-row"><span class="label">Phase</span><span class="value">1 — Structure &amp; UI Demo</span></div>
          <div class="info-row"><span class="label">Backend</span><span class="value">Mock / In-Memory</span></div>
          <div class="info-row"><span class="label">Data Snapshot</span><span class="value">${todayLocalISO()}</span></div>
        </div>
      </div>
    </div>
  `;

  const user = getCurrentUser();
  container.querySelector("#whoami").innerHTML = `
    <div class="info-row"><span class="label">Name</span><span class="value">${user.name}</span></div>
    <div class="info-row"><span class="label">Email</span><span class="value">${user.email}</span></div>
    <div class="info-row"><span class="label">Role</span><span class="value">${user.title}</span></div>
  `;

  container.querySelector("#export-btn").addEventListener("click", () => {
    const data = exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `printflow-backup-${todayLocalISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Backup exported.", "success");
  });

  container.querySelector("#restore-btn").addEventListener("click", () => {
    confirmAction({
      title: "Restore Backup",
      message: "This will overwrite all current data with the contents of the backup file. This cannot be undone.",
      confirmLabel: "I understand, continue",
      requirePassword: true,
      onConfirm: () => toast("Restore flow will be wired up against real data in Phase 2.", "info"),
    });
  });
}
