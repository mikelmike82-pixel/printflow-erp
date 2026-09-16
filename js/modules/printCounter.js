// Print Counter — the walk-up / operator-triggered printing + billing
// workflow: Customer -> Printer -> Material -> Payment -> Invoice, all in
// one guided step so none of those can happen without the others (see
// createCounterJob in core/store.js).
//
// Real physical printing: the Print Bridge agent (windows-print-bridge/)
// pauses the shop's real Windows printers, so a job sent to one from
// CorelDRAW/Illustrator/Photoshop/etc just sits held rather than printing.
// The agent opens this screen with ?realPrinter=<Windows printer name>
// &realJobId=<spooler job id>. Once the operator confirms the customer/
// billing details and clicks "Confirm & Print", we call the agent's local
// endpoint to release exactly that held job, so it prints for real using
// the printer's own driver — full fidelity, no re-rendering.
import {
  getCounterJobs, getCounterJobById, createCounterJob, updateCounterJobStatus, reprintCounterJob, cancelCounterJob,
  counterJobDependents, getCustomers, getCustomerById, getActivePrinters, getPrinterById, getWarehouses,
  getProducts, getProductById, getProductStock, checkMaterialStock, getInvoiceById, recordPayment,
  invoiceOutstanding, findPrinterByWindowsName, markRealPrintReleased, COUNTER_JOB_STATUSES, PAYMENT_METHODS,
} from "../core/store.js";
import { formatCurrency, formatDate, formatDateTime, escapeHtml } from "../core/format.js";
import { navigateTo } from "../core/router.js";
import { openModal, closeModal, toast, confirmAction, emptyState } from "../core/ui.js";
import { getCurrentUser } from "../core/auth.js";
import { printBill } from "../core/printBill.js";

const STATUS_TONE = { Pending: "neutral", "Sent to Printer": "info", Printing: "warning", Completed: "success", Failed: "danger", Cancelled: "neutral" };
const INVOICE_STATUS_TONE = { Paid: "success", Unpaid: "neutral", "Partially Paid": "warning", Overdue: "danger", "Overpaid — Credit": "success" };
const SOURCE_APPS = ["Manual", "CorelDRAW", "Adobe Illustrator", "Adobe Photoshop", "Microsoft Word", "Other"];

// The Print Bridge agent's local HTTP listener (see
// windows-print-bridge/print-agent.ps1). Only reachable from the same
// computer the agent is running on — this is expected to fail (and is
// handled as such, never silently ignored) on any other device, e.g. an
// admin checking the ERP from their phone.
const PRINT_AGENT_URL = "http://127.0.0.1:8899";

async function releaseRealPrintJob(realPrinterName, realJobId) {
  try {
    const res = await fetch(`${PRINT_AGENT_URL}/resume-job`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printer: realPrinterName, jobId: realJobId }),
    });
    if (!res.ok) return { ok: false, note: `Print Bridge agent responded with an error (HTTP ${res.status}).` };
    return { ok: true, note: "" };
  } catch (err) {
    return { ok: false, note: "Couldn't reach the Print Bridge agent on this computer — is it running?" };
  }
}

// For a held real job the operator does NOT want to bill/print (a test
// page, a duplicate, something sent by mistake) — tells the agent to
// actually remove it from the real Windows queue (Remove-PrintJob) rather
// than leaving it paused there forever. Without this, the only way to
// discard a held job was Cancel, which just closes this dialog and leaves
// the real print job stuck — exactly what piled up 10 "paused forever"
// documents in Windows' own queue.
async function discardRealPrintJob(realPrinterName, realJobId) {
  try {
    const res = await fetch(`${PRINT_AGENT_URL}/cancel-job`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printer: realPrinterName, jobId: realJobId }),
    });
    if (!res.ok) return { ok: false, note: `Print Bridge agent responded with an error (HTTP ${res.status}).` };
    return { ok: true, note: "" };
  } catch (err) {
    return { ok: false, note: "Couldn't reach the Print Bridge agent on this computer — is it running?" };
  }
}

// Best-effort tidy-up for the "no ERP tab was open yet" fallback path,
// where the agent had to ask Windows to open a brand new tab just for
// this one job (see print-agent.ps1's Open-NewPrintJob). Once that job is
// dealt with, that tab has served its entire purpose and closing it keeps
// them from piling up over a busy day. It must NEVER fire for the normal,
// steady-state tab an Operator leaves open all day (see main.js's
// pollForHeldPrintJob) — closing THAT one would kill the very tab that
// keeps picking up every job after this one. A tab opened fresh straight
// to a single URL has exactly one browser-history entry; the long-lived
// polling tab has already navigated around (login → its route → this
// job) and will always have more than one, which is what tells them apart
// here. Browsers only allow a script to close a tab it's confident has no
// user-meaningful history, so even this can silently no-op — that's fine,
// worst case the tab is just left open like before this existed.
function closeIfStandaloneTab() {
  try {
    if (window.history.length <= 1) window.close();
  } catch {}
}

function canOperate() {
  const role = getCurrentUser()?.role;
  return role === "ADMIN" || role === "OPERATOR";
}
function canRecordPayment() {
  return getCurrentUser()?.role === "ADMIN";
}

export function render(container, params) {
  if (params.job) { renderDetail(container, params.job); return; }
  renderList(container);

  // Auto-open triggered by the local Print Bridge agent: a real print job
  // arrived (and is being held) on a real Windows printer from CorelDRAW/
  // Illustrator/Photoshop/etc, and the agent opened this page as
  // #/print-counter?new=1&source=CorelDRAW&realPrinter=<name>&realJobId=<id>
  // so the operator lands straight in the New Print Job wizard instead of
  // having to find the button.
  if (params.new) {
    // Strip the trigger params from the URL immediately so a manual
    // refresh (or the back button) doesn't reopen the modal on its own.
    history.replaceState(null, "", `${location.pathname}${location.search}#/print-counter`);
    if (canOperate()) {
      const realJobInfo = params.realPrinter
        ? { realPrinterName: params.realPrinter, realJobId: params.realJobId, matchedPrinter: findPrinterByWindowsName(params.realPrinter) }
        : null;
      openNewJobModal(() => { location.hash = "#/print-counter"; render(container, {}); }, params.source || "Other", realJobInfo);
    } else {
      toast("A print job came in from the desktop, but your role can't create Print Counter jobs — ask an operator to complete it.", "danger");
    }
  }
}

function jobPartyName(job) {
  if (job.customerType === "Walk-in") return job.walkInName || "Walk-in Customer";
  return getCustomerById(job.customerId)?.name || "—";
}

function renderList(container) {
  const jobs = [...getCounterJobs()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const operate = canOperate();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Print Counter</h1>
        <div class="page-subtitle">${jobs.length} jobs · Customer &rarr; Printer &rarr; Material &rarr; Payment, in one step</div>
      </div>
      <div class="page-actions">${operate ? `<button class="btn btn-primary" id="new-job-btn">+ New Print Job</button>` : ""}</div>
    </div>
    <div class="filter-bar">
      <input type="search" id="pc-search" placeholder="Search job #, customer, printer..." />
      <select id="pc-status-filter">
        <option value="">All Statuses</option>
        ${COUNTER_JOB_STATUSES.map((s) => `<option value="${s}">${s}</option>`).join("")}
      </select>
    </div>
    <div id="pc-table-wrap"></div>
  `;

  const wrap = container.querySelector("#pc-table-wrap");
  function draw() {
    const q = container.querySelector("#pc-search").value.trim().toLowerCase();
    const statusFilter = container.querySelector("#pc-status-filter").value;
    const filtered = jobs.filter((j) => {
      const printer = getPrinterById(j.printerId);
      const matchesText = !q || j.jobNo.toLowerCase().includes(q) || jobPartyName(j).toLowerCase().includes(q) || (printer?.name || "").toLowerCase().includes(q) ||
        j.billingItems.some((i) => i.description.toLowerCase().includes(q));
      const matchesStatus = !statusFilter || j.status === statusFilter;
      return matchesText && matchesStatus;
    });

    wrap.innerHTML = filtered.length === 0 ? emptyState("No print counter jobs match.") : `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Job #</th><th>Customer</th><th>Printer</th><th>Item</th><th class="num">Total</th><th>Payment</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            ${filtered.map((j) => {
              const invoice = getInvoiceById(j.invoiceId);
              const printer = getPrinterById(j.printerId);
              return `
              <tr class="row-link" data-job="${j.id}">
                <td class="mono">${j.jobNo}</td>
                <td>${escapeHtml(jobPartyName(j))} ${j.customerType === "Walk-in" ? `<span class="badge badge-neutral" style="margin-left:4px;">Walk-in</span>` : ""}</td>
                <td>${escapeHtml(printer?.name || "—")}</td>
                <td>${escapeHtml(j.billingItems.map((i) => i.description).join(", "))}</td>
                <td class="num">${formatCurrency(j.total)}</td>
                <td>${invoice ? `<span class="badge badge-${INVOICE_STATUS_TONE[invoice.status] || "neutral"}">${invoice.status}</span>` : "—"}</td>
                <td><span class="badge badge-${STATUS_TONE[j.status] || "neutral"}">${j.status}</span></td>
                <td>${formatDate(j.createdAt)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;
    wrap.querySelectorAll("[data-job]").forEach((el) => {
      el.addEventListener("click", () => navigateTo("print-counter", { job: el.dataset.job }));
    });
  }
  draw();
  container.querySelector("#pc-search").addEventListener("input", draw);
  container.querySelector("#pc-status-filter").addEventListener("change", draw);
  if (operate) container.querySelector("#new-job-btn").addEventListener("click", () => openNewJobModal(() => { location.hash = "#/print-counter"; render(container, {}); }));
}

const STATUS_FLOW = ["Pending", "Sent to Printer", "Printing", "Completed"];

function renderDetail(container, jobId) {
  const job = getCounterJobById(jobId);
  if (!job) { container.innerHTML = emptyState("Print counter job not found."); return; }
  const printer = getPrinterById(job.printerId);
  const invoice = getInvoiceById(job.invoiceId);
  const outstanding = invoice ? invoiceOutstanding(invoice) : 0;
  const operate = canOperate();
  const managePayment = canRecordPayment();
  const currentIdx = STATUS_FLOW.indexOf(job.status);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div style="margin-bottom:6px;"><a href="#/print-counter">&larr; Back to Print Counter</a></div>
        <h1>${job.jobNo}</h1>
        <div class="page-subtitle">${escapeHtml(jobPartyName(job))} · ${escapeHtml(printer?.name || "—")} · ${formatDateTime(`${job.createdAt}T00:00:00`)}</div>
      </div>
      <div class="page-actions">
        <span class="badge badge-${STATUS_TONE[job.status] || "neutral"}">${job.status}</span>
        ${job.reprintCount > 0 ? `<span class="badge badge-neutral">Reprinted &times;${job.reprintCount}</span>` : ""}
      </div>
    </div>

    ${job.status !== "Cancelled" && job.status !== "Failed" ? `
      <div class="stepper">
        ${STATUS_FLOW.map((s, i) => `
          <div class="step ${i < currentIdx ? "done" : i === currentIdx ? "current" : ""}">
            <div class="step-dot">${i < currentIdx ? "✓" : i + 1}</div>
            <div class="step-label">${s}</div>
          </div>
          ${i < STATUS_FLOW.length - 1 ? `<div class="step-line ${i < currentIdx ? "done" : ""}"></div>` : ""}
        `).join("")}
      </div>` : `<div class="hint" style="margin:var(--space-4) 0;">This job was ${job.status.toLowerCase()} — no further status progression.</div>`}

    <div class="detail-grid">
      <div class="card">
        <div class="card-title">Items Billed — what the customer is buying</div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
            <tbody>
              ${job.billingItems.map((i) => `<tr><td>${escapeHtml(i.description)}</td><td class="num">${i.qty}</td><td class="num">${formatCurrency(i.rate)}</td><td class="num">${formatCurrency(i.qty * i.rate)}</td></tr>`).join("")}
              <tr><td colspan="3" class="num"><strong>Total</strong></td><td class="num"><strong>${formatCurrency(job.total)}</strong></td></tr>
            </tbody>
          </table>
        </div>
        <div class="card-title" style="margin-top:16px;">Materials Used — deducted from stock</div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Material</th><th class="num">Qty</th></tr></thead>
            <tbody>
              ${job.materials.map((m) => `<tr><td>${escapeHtml(getProductById(m.productId)?.name || "—")}</td><td class="num">${m.qty} ${escapeHtml(getProductById(m.productId)?.unit || "")}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
        <div class="info-row"><span class="label">Source Application</span><span class="value">${escapeHtml(job.sourceApplication || "Manual")}</span></div>
        <div class="info-row"><span class="label">Warehouse</span><span class="value">${escapeHtml(getWarehouses().find((w) => w.id === job.warehouseId)?.name || job.warehouseId)}</span></div>
        <div class="info-row"><span class="label">Operator</span><span class="value">${escapeHtml(job.createdBy)}</span></div>
      </div>
      <div>
        <div class="card">
          <div class="card-title">Billing</div>
          <div class="info-row"><span class="label">Bill</span><span class="value">${invoice ? `<a href="#/invoicing?invoice=${invoice.id}">${invoice.invoiceNo}</a>` : "—"}</span></div>
          <div class="info-row"><span class="label">Payment Choice</span><span class="value">${job.paymentChoice}${job.paymentMethod ? ` (${job.paymentMethod})` : ""}</span></div>
          ${invoice ? `
            <div class="info-row"><span class="label">Status</span><span class="value"><span class="badge badge-${INVOICE_STATUS_TONE[invoice.status] || "neutral"}">${invoice.status}</span></span></div>
            <div class="info-row"><span class="label">Paid</span><span class="value">${formatCurrency(invoice.paid)}</span></div>
            <div class="info-row"><span class="label">Outstanding</span><span class="value">${outstanding > 0 ? formatCurrency(outstanding) : outstanding < 0 ? `<span class="badge badge-success">Credit ${formatCurrency(-outstanding)}</span>` : "Settled"}</span></div>
          ` : ""}
          <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
            ${invoice ? `<button class="btn btn-secondary btn-sm" id="print-bill-btn">🖨 Print Bill</button>` : ""}
            ${managePayment && invoice && outstanding > 0 ? `<button class="btn btn-secondary btn-sm" id="record-payment-btn">Record Payment</button>` : ""}
          </div>
        </div>
        ${job.realJobId ? `
        <div class="card">
          <div class="card-title">Physical Print</div>
          <div class="info-row"><span class="label">Printer</span><span class="value">${escapeHtml(job.realPrinterName)}</span></div>
          <div class="info-row"><span class="label">Released to print</span><span class="value">${job.realPrintReleased ? `<span class="badge badge-success">Yes</span>` : `<span class="badge badge-danger">No</span>`}</span></div>
          ${!job.realPrintReleased && job.realPrintNote ? `<div class="hint" style="color:var(--danger-fg);">${escapeHtml(job.realPrintNote)}</div>` : ""}
        </div>` : ""}
        <div class="card">
          <div class="card-title">Actions</div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${operate && ["Pending", "Sent to Printer", "Printing"].includes(job.status) ? STATUS_FLOW.filter((_, i) => i === currentIdx + 1).map((next) => `<button class="btn btn-secondary btn-sm" data-advance="${next}">Mark "${next}"</button>`).join("") : ""}
            ${operate && ["Pending", "Sent to Printer", "Printing"].includes(job.status) ? `<button class="btn btn-danger btn-sm" id="mark-failed-btn">Mark Failed</button>` : ""}
            ${operate && (job.status === "Completed" || job.status === "Failed") ? `<button class="btn btn-secondary btn-sm" id="reprint-btn">Reprint Job</button>` : ""}
            ${operate && job.status === "Pending" ? `<button class="btn btn-ghost btn-sm" id="cancel-job-btn">Cancel Job</button>` : ""}
            ${!operate && !managePayment ? `<div class="hint">No actions available for your role.</div>` : ""}
          </div>
          <div class="hint" style="margin-top:10px;">Reprinting sends the job again without creating a new invoice or consuming inventory again.</div>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll("[data-advance]").forEach((el) => {
    el.addEventListener("click", () => {
      updateCounterJobStatus(job.id, el.dataset.advance);
      toast(`Marked "${el.dataset.advance}".`, "success");
      renderDetail(container, jobId);
    });
  });
  const failedBtn = container.querySelector("#mark-failed-btn");
  if (failedBtn) failedBtn.addEventListener("click", () => {
    confirmAction({
      title: "Mark Print Job Failed",
      message: `Mark ${job.jobNo} as Failed? Material already consumed is not restored — use Reprint once the issue is fixed.`,
      confirmLabel: "Mark Failed",
      onConfirm: () => { updateCounterJobStatus(job.id, "Failed"); toast("Job marked Failed.", "danger"); renderDetail(container, jobId); },
    });
  });
  const reprintBtn = container.querySelector("#reprint-btn");
  if (reprintBtn) reprintBtn.addEventListener("click", () => {
    confirmAction({
      title: "Reprint Job",
      danger: false,
      message: job.realJobId
        ? `This updates ${job.jobNo}'s record only — no new invoice or inventory deduction. It does NOT physically print again: the original held print job is gone once released, so ask the operator to print from ${escapeHtml(job.sourceApplication || "the design software")} again to actually produce another copy.`
        : `Mark ${job.jobNo} as sent again? No new invoice or inventory deduction will be made.`,
      confirmLabel: "Reprint",
      onConfirm: () => { reprintCounterJob(job.id); toast("Job sent for reprint.", "success"); renderDetail(container, jobId); },
    });
  });
  const cancelBtn = container.querySelector("#cancel-job-btn");
  if (cancelBtn) cancelBtn.addEventListener("click", () => {
    confirmAction({
      title: "Cancel Print Job",
      message: `Cancel ${job.jobNo}? Consumed material will be restored to stock.`,
      confirmLabel: "Cancel Job",
      onConfirm: () => {
        const result = cancelCounterJob(job.id);
        if (result.ok) { toast("Job cancelled, stock restored.", "success"); renderDetail(container, jobId); }
        else toast(result.error, "danger");
      },
    });
  });
  const paymentBtn = container.querySelector("#record-payment-btn");
  if (paymentBtn) paymentBtn.addEventListener("click", () => openRecordPaymentModal(invoice, () => renderDetail(container, jobId)));
  const printBillBtn = container.querySelector("#print-bill-btn");
  if (printBillBtn) printBillBtn.addEventListener("click", () => printBill(invoice.id));
}

function openRecordPaymentModal(invoice, onSaved) {
  const outstanding = invoiceOutstanding(invoice);
  openModal({
    title: `Record Payment — ${invoice.invoiceNo}`,
    bodyHtml: `
      <div class="info-row"><span class="label">Outstanding</span><span class="value"><strong>${formatCurrency(outstanding)}</strong></span></div>
      <div class="form-grid">
        <div class="form-field"><label>Amount Received (Rs) *</label><input type="number" id="f-amount" min="0.01" step="0.01" value="${outstanding}" /></div>
        <div class="form-field">
          <label>Payment Method</label>
          <select id="f-method">${PAYMENT_METHODS.map((m) => `<option value="${m}">${m}</option>`).join("")}</select>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="save-payment">Record Payment</button>
      </div>
    `,
    onMount: (root) => {
      root.querySelector("#save-payment").addEventListener("click", () => {
        const amount = Number(root.querySelector("#f-amount").value);
        const method = root.querySelector("#f-method").value;
        if (!(amount > 0)) { toast("Enter an amount greater than zero.", "danger"); return; }
        const result = recordPayment(invoice.id, amount, method);
        if (result.ok) { closeModal(); toast("Payment recorded.", "success"); onSaved(); }
        else toast(result.error, "danger");
      });
    },
  });
}

// --- New Print Job wizard ------------------------------------------------

function materialOptionsHtml(printer) {
  const products = getProducts();
  const filtered = printer && printer.supportedCategories?.length
    ? products.filter((p) => printer.supportedCategories.includes(p.category))
    : products;
  return filtered.map((p) => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.unit)})</option>`).join("");
}

function materialRowHtml(printer, index) {
  return `
    <div class="material-row" data-row="${index}" style="display:grid; grid-template-columns: 1fr 100px 32px; gap:8px; align-items:end; margin-bottom:8px;">
      <div class="form-field" style="margin:0;">
        ${index === 0 ? `<label>Raw Material</label>` : ""}
        <select class="f-material">${materialOptionsHtml(printer)}</select>
      </div>
      <div class="form-field" style="margin:0;">
        ${index === 0 ? `<label>Qty (e.g. sheets)</label>` : ""}
        <input type="number" class="f-qty" min="0.01" step="0.01" value="1" />
      </div>
      <button type="button" class="btn btn-ghost btn-icon remove-row" title="Remove" aria-label="Remove" style="${index === 0 ? "margin-bottom:1px;" : ""}">&times;</button>
    </div>`;
}

// A billing line is a plain description of what the customer is actually
// buying (e.g. "Business Cards - 500 pcs", "Shop Banner 6x3ft") - it has
// nothing to do with any Inventory product and never touches stock. It
// exists purely to make up the invoice total, entered by the operator.
function billingRowHtml(index) {
  return `
    <div class="billing-row" data-row="${index}" style="display:grid; grid-template-columns: 2fr 70px 100px 32px; gap:8px; align-items:end; margin-bottom:8px;">
      <div class="form-field" style="margin:0;">
        ${index === 0 ? `<label>What the customer is buying</label>` : ""}
        <input type="text" class="f-bill-desc" placeholder="e.g. Business Cards (500 pcs)" />
      </div>
      <div class="form-field" style="margin:0;">
        ${index === 0 ? `<label>Qty</label>` : ""}
        <input type="number" class="f-bill-qty" min="0.01" step="0.01" value="1" />
      </div>
      <div class="form-field" style="margin:0;">
        ${index === 0 ? `<label>Rate (Rs)</label>` : ""}
        <input type="number" class="f-bill-rate" min="0" step="0.01" value="0" />
      </div>
      <button type="button" class="btn btn-ghost btn-icon remove-bill-row" title="Remove" aria-label="Remove" style="${index === 0 ? "margin-bottom:1px;" : ""}">&times;</button>
    </div>`;
}

function openNewJobModal(onSaved, presetSource, realJobInfo) {
  const printers = getActivePrinters();
  if (printers.length === 0) { toast("Add a printer first, in Printers / Plotters.", "danger"); return; }
  if (getProducts().length === 0) { toast("Add a raw material first, in the Stock section.", "danger"); return; }
  const customers = getCustomers();
  const defaultWarehouseId = getWarehouses()[0]?.id;
  const viaBridge = presetSource !== undefined;
  const initialSource = SOURCE_APPS.includes(presetSource) ? presetSource : "Manual";
  const matchedPrinter = realJobInfo?.matchedPrinter || null;
  const lockPrinter = !!matchedPrinter;

  openModal({
    title: "New Print Job",
    size: "lg",
    bodyHtml: `
      ${viaBridge ? `<div class="hint" style="background:var(--bg-subtle,#eef4ff); padding:10px 12px; border-radius:6px; margin-bottom:14px;">
        Detected automatically from a real print job sent to <strong>${escapeHtml(realJobInfo?.realPrinterName || "a printer")}</strong> on this computer${initialSource !== "Other" ? ` (${escapeHtml(initialSource)})` : ""}.
        ${matchedPrinter ? `That's linked to <strong>${escapeHtml(matchedPrinter.name)}</strong> below — confirm the details and it'll print for real once you hit Confirm &amp; Print.` : `This printer isn't linked to an ERP printer record yet, so pick the right one below manually — you can link it permanently in Printers / Plotters so this matches automatically next time.`}
      </div>` : ""}
      <div class="form-field">
        <label>Customer Type</label>
        <div style="display:flex; gap:16px;">
          <label style="display:flex; align-items:center; gap:6px; font-weight:400;"><input type="radio" name="f-customer-type" value="Regular" checked /> Regular Customer</label>
          <label style="display:flex; align-items:center; gap:6px; font-weight:400;"><input type="radio" name="f-customer-type" value="Walk-in" /> Walk-in Customer</label>
        </div>
      </div>
      <div class="form-field" id="regular-customer-wrap">
        <label>Customer *</label>
        <select id="f-customer">
          <option value="">Select customer...</option>
          ${customers.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}
        </select>
      </div>
      <div class="form-field" id="walkin-name-wrap" style="display:none;">
        <label>Walk-in Name (optional)</label>
        <input id="f-walkin-name" placeholder="Walk-in Customer" />
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label>Printer / Plotter *</label>
          <select id="f-printer" ${lockPrinter ? "disabled" : ""}>
            ${printers.map((p) => `<option value="${p.id}" ${matchedPrinter && p.id === matchedPrinter.id ? "selected" : ""}>${escapeHtml(p.name)} — ${escapeHtml(p.type)}</option>`).join("")}
          </select>
          ${lockPrinter ? `<div class="hint">Locked to match the real printer this job actually came from.</div>` : ""}
        </div>
        <div class="form-field">
          <label>Source Application</label>
          <select id="f-source">${SOURCE_APPS.map((s) => `<option value="${s}" ${s === initialSource ? "selected" : ""}>${s}</option>`).join("")}</select>
        </div>
      </div>
      <div class="form-field">
        <label>Items Billed — what the customer is buying</label>
        <div id="billing-rows">${billingRowHtml(0)}</div>
        <button type="button" class="btn btn-ghost btn-sm" id="add-billing-row">+ Add Item</button>
      </div>

      <div class="info-row" style="border-top:1px solid var(--border-default); padding-top:10px; margin-top:4px;">
        <span class="label" style="font-size:15px;">Job Total</span>
        <span class="value" id="job-total-display" style="font-size:18px; font-weight:800;">Rs 0</span>
      </div>

      <div class="form-field" style="margin-top:var(--space-4);">
        <label>Materials Used — deducted from stock (not billed directly)</label>
        <div id="material-rows">${materialRowHtml(matchedPrinter || printers[0], 0)}</div>
        <button type="button" class="btn btn-ghost btn-sm" id="add-material-row">+ Add Material</button>
      </div>

      <div class="form-field" style="margin-top:var(--space-4);">
        <label>Payment</label>
        <div style="display:flex; gap:16px;">
          <label style="display:flex; align-items:center; gap:6px; font-weight:400;"><input type="radio" name="f-payment-choice" value="Pay Now" checked /> Pay Now</label>
          <label id="credit-option-label" style="display:flex; align-items:center; gap:6px; font-weight:400;"><input type="radio" name="f-payment-choice" value="Credit" /> Add to Credit</label>
        </div>
      </div>
      <div class="form-field" id="payment-method-wrap">
        <label>Payment Method</label>
        <select id="f-payment-method">${PAYMENT_METHODS.map((m) => `<option value="${m}">${m}</option>`).join("")}</select>
      </div>
      <div id="stock-warning" class="hint" style="color:var(--danger-fg); display:none;"></div>

      <div class="form-actions">
        ${realJobInfo?.realJobId ? `<button type="button" class="btn btn-ghost" id="discard-real-job" style="margin-right:auto; color:var(--danger-fg);">Discard — Don't Print</button>` : ""}
        <button class="btn btn-secondary" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="save-job">Confirm &amp; Print</button>
      </div>
    `,
    onMount: (root) => {
      let matRowCount = 1;
      let billRowCount = 1;

      function selectedPrinter() {
        return getPrinterById(root.querySelector("#f-printer").value);
      }

      // The bill total comes ONLY from the billing rows (what the
      // customer is buying) - material rows never factor into it, since
      // raw stock consumed isn't what's being charged for.
      function recalcTotal() {
        let total = 0;
        root.querySelectorAll(".billing-row").forEach((row) => {
          const qty = Number(row.querySelector(".f-bill-qty").value) || 0;
          const rate = Number(row.querySelector(".f-bill-rate").value) || 0;
          total += qty * rate;
        });
        root.querySelector("#job-total-display").textContent = formatCurrency(total);
      }

      function bindBillRow(row) {
        row.querySelector(".f-bill-qty").addEventListener("input", recalcTotal);
        row.querySelector(".f-bill-rate").addEventListener("input", recalcTotal);
        row.querySelector(".remove-bill-row").addEventListener("click", () => {
          if (root.querySelectorAll(".billing-row").length <= 1) { toast("At least one billed item is required.", "danger"); return; }
          row.remove();
          recalcTotal();
        });
      }

      function bindMaterialRow(row) {
        row.querySelector(".remove-row").addEventListener("click", () => {
          if (root.querySelectorAll(".material-row").length <= 1) { toast("At least one material line is required.", "danger"); return; }
          row.remove();
        });
      }

      root.querySelectorAll(".billing-row").forEach(bindBillRow);
      root.querySelectorAll(".material-row").forEach(bindMaterialRow);
      recalcTotal();

      root.querySelector("#add-billing-row").addEventListener("click", () => {
        const wrap = root.querySelector("#billing-rows");
        const div = document.createElement("div");
        div.innerHTML = billingRowHtml(billRowCount++);
        const row = div.firstElementChild;
        wrap.appendChild(row);
        bindBillRow(row);
      });

      root.querySelector("#add-material-row").addEventListener("click", () => {
        const wrap = root.querySelector("#material-rows");
        const div = document.createElement("div");
        div.innerHTML = materialRowHtml(selectedPrinter(), matRowCount++);
        const row = div.firstElementChild;
        wrap.appendChild(row);
        bindMaterialRow(row);
      });

      root.querySelector("#f-printer").addEventListener("change", () => {
        // Re-populate every material dropdown's options for the newly
        // selected printer's supported categories, keeping each row's
        // qty/rate as-is.
        const printer = selectedPrinter();
        root.querySelectorAll(".material-row").forEach((row) => {
          const select = row.querySelector(".f-material");
          select.innerHTML = materialOptionsHtml(printer);
        });
      });

      // Customer type toggle
      root.querySelectorAll('input[name="f-customer-type"]').forEach((el) => {
        el.addEventListener("change", () => {
          const isWalkIn = root.querySelector('input[name="f-customer-type"]:checked').value === "Walk-in";
          root.querySelector("#regular-customer-wrap").style.display = isWalkIn ? "none" : "";
          root.querySelector("#walkin-name-wrap").style.display = isWalkIn ? "" : "none";
          root.querySelector("#credit-option-label").style.opacity = isWalkIn ? "0.4" : "1";
          const creditRadio = root.querySelector('input[name="f-payment-choice"][value="Credit"]');
          creditRadio.disabled = isWalkIn;
          if (isWalkIn && creditRadio.checked) {
            root.querySelector('input[name="f-payment-choice"][value="Pay Now"]').checked = true;
            root.querySelector("#payment-method-wrap").style.display = "";
          }
        });
      });

      // Payment choice toggle
      root.querySelectorAll('input[name="f-payment-choice"]').forEach((el) => {
        el.addEventListener("change", () => {
          const isCredit = root.querySelector('input[name="f-payment-choice"]:checked').value === "Credit";
          root.querySelector("#payment-method-wrap").style.display = isCredit ? "none" : "";
        });
      });

      const discardBtn = root.querySelector("#discard-real-job");
      if (discardBtn) {
        discardBtn.addEventListener("click", () => {
          confirmAction({
            title: "Discard Held Print Job",
            message: `This permanently removes the held job on "${escapeHtml(realJobInfo.realPrinterName)}" from the Windows print queue without printing it — not just this ERP screen. Use this for a test page, a duplicate, or anything sent by mistake. This can't be undone.`,
            confirmLabel: "Discard",
            onConfirm: async () => {
              closeModal();
              const result = await discardRealPrintJob(realJobInfo.realPrinterName, realJobInfo.realJobId);
              if (result.ok) toast("Held print job discarded — it will not print.", "success");
              else toast(`Couldn't discard it: ${result.note} You may need to cancel it manually from Printers & Scanners.`, "danger");
              onSaved();
              if (realJobInfo?.realJobId) closeIfStandaloneTab();
            },
          });
        });
      }

      root.querySelector("#save-job").addEventListener("click", async () => {
        const customerType = root.querySelector('input[name="f-customer-type"]:checked').value;
        const customerId = root.querySelector("#f-customer").value;
        const walkInName = root.querySelector("#f-walkin-name").value.trim();
        const printerId = root.querySelector("#f-printer").value;
        const sourceApplication = root.querySelector("#f-source").value;
        const warehouseId = defaultWarehouseId;
        const paymentChoice = root.querySelector('input[name="f-payment-choice"]:checked').value;
        const paymentMethod = root.querySelector("#f-payment-method").value;

        if (customerType === "Regular" && !customerId) { toast("Select a customer.", "danger"); return; }
        if (!printerId) { toast("Select a printer.", "danger"); return; }

        const billingItems = [...root.querySelectorAll(".billing-row")].map((row) => ({
          description: row.querySelector(".f-bill-desc").value.trim(),
          qty: Number(row.querySelector(".f-bill-qty").value) || 0,
          rate: Number(row.querySelector(".f-bill-rate").value) || 0,
        }));
        if (billingItems.some((i) => !i.description || i.qty <= 0)) { toast("Every billed item needs a description and a quantity greater than zero.", "danger"); return; }

        const materials = [...root.querySelectorAll(".material-row")].map((row) => ({
          productId: row.querySelector(".f-material").value,
          qty: Number(row.querySelector(".f-qty").value) || 0,
        }));
        if (materials.some((m) => !m.productId || m.qty <= 0)) { toast("Every material line needs a material and a quantity greater than zero.", "danger"); return; }

        const stockProblems = checkMaterialStock(materials, warehouseId);
        const warningEl = root.querySelector("#stock-warning");
        if (stockProblems.length > 0) {
          warningEl.textContent = "Insufficient stock — " + stockProblems.join(" ");
          warningEl.style.display = "block";
          return;
        }
        warningEl.style.display = "none";

        const total = billingItems.reduce((s, i) => s + i.qty * i.rate, 0);
        const result = createCounterJob({
          customerType, customerId, walkInName, printerId, sourceApplication, warehouseId,
          billingItems, materials, paymentChoice, paymentMethod, amountPaid: paymentChoice === "Pay Now" ? total : 0,
          realPrinterName: realJobInfo?.realPrinterName, realJobId: realJobInfo?.realJobId,
        });
        if (!result.ok) { toast(result.error, "danger"); return; }
        closeModal();
        toast(`${result.job.jobNo} created — ${result.invoice.invoiceNo} (${formatCurrency(total)}).`, "success");

        // The whole point of this workflow is speed at the counter — the
        // bill prints itself the moment the job is confirmed, so the
        // operator never has to go find it and print it by hand before
        // handing it to the customer. (If the browser blocks the popup,
        // it's still sitting on the Bills page ready to print manually.)
        printBill(result.invoice.id);

        // Only a job that actually came from a real held print job has
        // anything to release — a manually-created job (no source printer)
        // has nothing physically waiting, so there's nothing to call.
        if (realJobInfo?.realJobId) {
          const release = await releaseRealPrintJob(realJobInfo.realPrinterName, realJobInfo.realJobId);
          markRealPrintReleased(result.job.id, release.ok, release.note);
          if (release.ok) toast(`Sent to "${realJobInfo.realPrinterName}" — it should print now.`, "success");
          else toast(`Billed and saved, but couldn't release the real print job: ${release.note} You may need to release it manually from Printers & Scanners.`, "danger");
        }
        onSaved();
        if (realJobInfo?.realJobId) closeIfStandaloneTab();
      });
    },
  });
}
