// Printable bill / receipt — a self-contained HTML document opened in its
// own window and sent straight to the browser's print dialog. Built as a
// separate window (rather than an in-page @media print block) so it never
// fights the app's own layout/CSS, and so "Print Bill" always produces the
// same clean receipt whether it's triggered by hand from the Bills page or
// automatically the instant a Print Counter job is confirmed.
import {
  getInvoiceById, getCustomerById, getCounterJobById, getPrinterById,
  getProductById, getCompanyDetails, invoiceOutstanding,
} from "./store.js";
import { formatCurrency, formatDate, formatDateTime, escapeHtml } from "./format.js";

export function printBill(invoiceId) {
  const invoice = getInvoiceById(invoiceId);
  if (!invoice) return;
  const company = getCompanyDetails();
  const customerName = invoice.customerId ? getCustomerById(invoice.customerId)?.name : invoice.walkInName;
  const job = invoice.printJobId ? getCounterJobById(invoice.printJobId) : null;
  const printer = job ? getPrinterById(job.printerId) : null;
  const outstanding = invoiceOutstanding(invoice);

  // Prefer the itemized billing lines from the Print Counter job (what the
  // customer actually bought); fall back to a single summary line for any
  // older bill that doesn't carry that detail.
  const items = job
    ? job.billingItems.map((i) => ({ description: i.description, qty: i.qty, rate: i.rate, amount: i.qty * i.rate }))
    : [{ description: "Services / goods", qty: 1, rate: invoice.total, amount: invoice.total }];

  const materialsLine = job && job.materials.length
    ? job.materials.map((m) => `${getProductById(m.productId)?.name || m.productId} x${m.qty}`).join(", ")
    : null;

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(invoice.invoiceNo)}</title>
<style>
  @page { size: auto; margin: 10mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Arial, sans-serif;
    color: #1a1a1a;
    max-width: 480px;
    margin: 0 auto;
    padding: 16px;
    font-size: 13px;
  }
  .header { text-align: center; margin-bottom: 14px; }
  .header .name { font-size: 19px; font-weight: 800; letter-spacing: 0.3px; }
  .header .meta { font-size: 11.5px; color: #555; margin-top: 3px; line-height: 1.5; }
  .divider { border: none; border-top: 1.5px dashed #999; margin: 12px 0; }
  .bill-meta { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
  .bill-meta .label { color: #666; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: #666; border-bottom: 1.5px solid #333; padding: 4px 2px; }
  td { padding: 5px 2px; font-size: 12.5px; border-bottom: 1px solid #eee; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .totals { margin-top: 8px; }
  .totals .row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 13px; }
  .totals .grand { font-size: 16px; font-weight: 800; border-top: 2px solid #1a1a1a; margin-top: 4px; padding-top: 6px; }
  .totals .paid { color: #1a7a3a; }
  .totals .due { color: #b3261e; font-weight: 700; }
  .materials { font-size: 11px; color: #666; margin-top: 10px; }
  .footer { text-align: center; margin-top: 20px; font-size: 11.5px; color: #666; }
  .footer .thanks { font-weight: 700; font-size: 13px; color: #1a1a1a; margin-bottom: 4px; }
  @media print {
    body { padding: 0; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="name">${escapeHtml(company.tradingName)}</div>
    <div class="meta">
      ${escapeHtml(company.address)}<br />
      ${escapeHtml(company.phone)}${company.email ? ` · ${escapeHtml(company.email)}` : ""}
    </div>
  </div>
  <hr class="divider" />
  <div class="bill-meta"><span class="label">Bill #</span><strong>${escapeHtml(invoice.invoiceNo)}</strong></div>
  <div class="bill-meta"><span class="label">Date</span><span>${formatDate(invoice.date)}</span></div>
  <div class="bill-meta"><span class="label">Customer</span><span>${escapeHtml(customerName || "Walk-in Customer")}</span></div>
  ${printer ? `<div class="bill-meta"><span class="label">Printer</span><span>${escapeHtml(printer.name)}</span></div>` : ""}
  ${job?.sourceApplication ? `<div class="bill-meta"><span class="label">Source</span><span>${escapeHtml(job.sourceApplication)}</span></div>` : ""}
  <hr class="divider" />
  <table>
    <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
    <tbody>
      ${items.map((i) => `
        <tr>
          <td>${escapeHtml(i.description)}</td>
          <td class="num">${i.qty}</td>
          <td class="num">${formatCurrency(i.rate)}</td>
          <td class="num">${formatCurrency(i.amount)}</td>
        </tr>`).join("")}
    </tbody>
  </table>
  ${materialsLine ? `<div class="materials">Material used: ${escapeHtml(materialsLine)}</div>` : ""}
  <div class="totals">
    <div class="row grand"><span>Total</span><span>${formatCurrency(invoice.total)}</span></div>
    <div class="row paid"><span>Paid</span><span>${formatCurrency(invoice.paid)}</span></div>
    ${outstanding !== 0 ? `<div class="row ${outstanding > 0 ? "due" : ""}"><span>${outstanding > 0 ? "Balance Due" : "Credit"}</span><span>${formatCurrency(Math.abs(outstanding))}</span></div>` : ""}
  </div>
  <hr class="divider" />
  <div class="footer">
    <div class="thanks">Thank you for your business!</div>
    Printed ${formatDateTime(new Date().toISOString())}
  </div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=520,height=720");
  if (!win) return; // popup blocked — the caller's toast covers this case
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    win.focus();
    win.print();
  };
}
