// Formatting helpers. Kept in one place so currency/date rules are
// consistent everywhere, and so timezone handling is deliberate
// (this business runs on Pakistan Standard Time — we always work with
// LOCAL calendar dates, never convert through UTC for "which day is this").

export const CURRENCY = "PKR";

export function formatCurrency(amount, { showSign = false } = {}) {
  const n = Number(amount) || 0;
  const sign = n < 0 ? "-" : showSign && n > 0 ? "+" : "";
  const abs = Math.abs(n);
  return `${sign}Rs ${abs.toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;
}

// Returns today as a local YYYY-MM-DD string (never UTC-shifted).
export function todayLocalISO() {
  const d = new Date();
  return localDateToISO(d);
}

export function localDateToISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Parse a "YYYY-MM-DD" string as a LOCAL date (not UTC midnight, which
// is the classic bug: new Date("2026-09-06") is parsed as UTC and can
// display as the previous day in PKT evenings).
export function parseLocalDate(isoDateStr) {
  if (!isoDateStr) return null;
  const [y, m, d] = isoDateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(isoDateStr) {
  const d = parseLocalDate(isoDateStr);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(isoDateTimeStr) {
  if (!isoDateTimeStr) return "—";
  const d = new Date(isoDateTimeStr);
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

export function daysBetween(isoDateStrA, isoDateStrB = todayLocalISO()) {
  const a = parseLocalDate(isoDateStrA);
  const b = parseLocalDate(isoDateStrB);
  return Math.round((a - b) / 86400000);
}

export function relativeDay(isoDateStr) {
  const diff = daysBetween(isoDateStr);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1) return `In ${diff} days`;
  return `${Math.abs(diff)} days overdue`;
}

export function initials(name) {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
