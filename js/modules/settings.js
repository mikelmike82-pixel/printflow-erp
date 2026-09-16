import { getCompanyDetails, updateCompanyDetails } from "../core/store.js";
import { getCurrentUser } from "../core/auth.js";
import { toast } from "../core/ui.js";
import { todayLocalISO, escapeHtml } from "../core/format.js";

function renderCompanyDetailsCard(container, isSuperAdmin) {
  const c = getCompanyDetails();
  const disabledAttr = isSuperAdmin ? "" : "disabled";
  return `
    <div class="card">
      <div class="card-title">Company Details</div>
      ${!isSuperAdmin ? `<div class="hint" style="margin-bottom:12px;">Only Super Admin can edit these — everyone else sees them read-only. Invoice, letterhead and tax logic across the app pull from this record.</div>` : `
        <p class="text-secondary" style="font-size:13px; margin-bottom:14px;">
          Standard placeholder values are pre-filled for the demo — update these once the business owner shares the
          real legal/registration details. This record drives GST/Sales Tax display on invoices and purchase orders,
          and appears on printed documents.
        </p>`}
      <form id="company-details-form">
        <div class="form-grid">
          <div class="form-field"><label>Legal / Registered Name</label><input id="cd-legal" value="${escapeHtml(c.legalName)}" ${disabledAttr} /></div>
          <div class="form-field"><label>Trading / Brand Name</label><input id="cd-trading" value="${escapeHtml(c.tradingName)}" ${disabledAttr} /></div>
          <div class="form-field full"><label>Address</label><input id="cd-address" value="${escapeHtml(c.address)}" ${disabledAttr} /></div>
          <div class="form-field"><label>Phone</label><input id="cd-phone" value="${escapeHtml(c.phone)}" ${disabledAttr} /></div>
          <div class="form-field"><label>Email</label><input id="cd-email" type="email" value="${escapeHtml(c.email)}" ${disabledAttr} /></div>
          <div class="form-field"><label>Website</label><input id="cd-website" value="${escapeHtml(c.website || "")}" ${disabledAttr} /></div>
          <div class="form-field"><label>NTN</label><input id="cd-ntn" value="${escapeHtml(c.ntn)}" ${disabledAttr} /></div>
          <div class="form-field">
            <label>Company GST Registration</label>
            <select id="cd-gst-status" ${disabledAttr}>
              <option value="true" ${c.isGstRegistered ? "selected" : ""}>Registered</option>
              <option value="false" ${!c.isGstRegistered ? "selected" : ""}>Not Registered</option>
            </select>
          </div>
          <div class="form-field"><label>GST / Sales Tax Registration No.</label><input id="cd-gst-number" value="${escapeHtml(c.gstNumber || "")}" ${disabledAttr} /></div>
          <div class="form-field"><label>Default Sales Tax Rate (%)</label><input id="cd-tax-rate" type="number" min="0" max="100" step="0.5" value="${c.defaultTaxRate}" ${disabledAttr} /></div>
          <div class="form-field"><label>Currency</label><input value="PKR (Rs)" disabled /></div>
          <div class="form-field"><label>Timezone</label><input value="Asia/Karachi (PKT)" disabled /></div>
        </div>
        ${isSuperAdmin ? `
          <div class="form-actions" style="justify-content:flex-start; border-top:none; padding-top:0;">
            <button type="submit" class="btn btn-primary">Save Company Details</button>
          </div>` : ""}
      </form>
    </div>`;
}

export function render(container) {
  const user = getCurrentUser();
  const isSuperAdmin = user.role === "ADMIN";

  container.innerHTML = `
    <div class="page-header">
      <div><h1>Settings</h1><div class="page-subtitle">Company preferences</div></div>
    </div>

    <div class="detail-grid">
      <div>
        ${renderCompanyDetailsCard(container, isSuperAdmin)}
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

  if (isSuperAdmin) {
    container.querySelector("#company-details-form").addEventListener("submit", (e) => {
      e.preventDefault();
      updateCompanyDetails({
        legalName: container.querySelector("#cd-legal").value.trim(),
        tradingName: container.querySelector("#cd-trading").value.trim(),
        address: container.querySelector("#cd-address").value.trim(),
        phone: container.querySelector("#cd-phone").value.trim(),
        email: container.querySelector("#cd-email").value.trim(),
        website: container.querySelector("#cd-website").value.trim(),
        ntn: container.querySelector("#cd-ntn").value.trim(),
        isGstRegistered: container.querySelector("#cd-gst-status").value === "true",
        gstNumber: container.querySelector("#cd-gst-number").value.trim(),
        defaultTaxRate: Number(container.querySelector("#cd-tax-rate").value) || 0,
      });
      toast("Company details saved.", "success");
    });
  }

  container.querySelector("#whoami").innerHTML = `
    <div class="info-row"><span class="label">Name</span><span class="value">${user.name}</span></div>
    <div class="info-row"><span class="label">Email</span><span class="value">${user.email}</span></div>
    <div class="info-row"><span class="label">Role</span><span class="value">${user.title}</span></div>
  `;
}
