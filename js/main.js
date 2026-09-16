import { login, logout, getCurrentUser, isLoggedIn } from "./core/auth.js";
import { NAV_SECTIONS, ROLES, firstAllowedRoute } from "./core/rbac.js";
import { initRouter, registerModule, handleRoute, navigateTo, currentRoute } from "./core/router.js";
import { initials } from "./core/format.js";
import { toast, openModal } from "./core/ui.js";
import { renderLoginLines } from "./core/loginFx.js";

import * as dashboard from "./modules/dashboard.js";
import * as printCounter from "./modules/printCounter.js";
import * as printers from "./modules/printers.js";
import * as customers from "./modules/customers.js";
import * as vendors from "./modules/vendors.js";
import * as inventory from "./modules/inventory.js";
import * as purchaseOrders from "./modules/purchaseOrders.js";
import * as grn from "./modules/grn.js";
import * as invoicing from "./modules/invoicing.js";
import * as reports from "./modules/reports.js";
import * as users from "./modules/users.js";
import * as auditTrail from "./modules/auditTrail.js";
import * as settings from "./modules/settings.js";

registerModule("dashboard", dashboard);
registerModule("print-counter", printCounter);
registerModule("printers", printers);
registerModule("customers", customers);
registerModule("vendors", vendors);
registerModule("inventory", inventory);
registerModule("purchase-orders", purchaseOrders);
registerModule("grn", grn);
registerModule("invoicing", invoicing);
registerModule("reports", reports);
registerModule("users", users);
registerModule("audit-trail", auditTrail);
registerModule("settings", settings);

const loginScreen = document.getElementById("login-screen");
const appRoot = document.getElementById("app-root");
const contentEl = document.getElementById("content");
const sidebarNav = document.getElementById("sidebar-nav");
const topbarTitle = document.getElementById("topbar-title");

function renderSidebar() {
  const user = getCurrentUser();
  if (!user) return;
  sidebarNav.innerHTML = NAV_SECTIONS.map((section) => {
    const visibleItems = section.items.filter((i) => i.roles.includes(user.role));
    if (visibleItems.length === 0) return "";
    return `
      <div class="sidebar-group">
        <div class="sidebar-group-label">${section.label}</div>
        ${visibleItems.map((item) => `
          <div class="sidebar-link" data-route="${item.route}">${item.label}</div>
        `).join("")}
      </div>`;
  }).join("");

  sidebarNav.querySelectorAll(".sidebar-link").forEach((el) => {
    el.addEventListener("click", () => navigateTo(el.dataset.route));
  });
}

function updateActiveNav(route, navItem) {
  sidebarNav.querySelectorAll(".sidebar-link").forEach((el) => {
    el.classList.toggle("active", el.dataset.route === route);
  });
  topbarTitle.textContent = navItem ? navItem.label : "Dashboard";
  closeSidebar();
}

// Mobile sidebar toggle — the hamburger button in the topbar shows/hides
// the off-canvas sidebar on narrow screens (see the max-width:900px rules
// in css/layout.css). A backdrop click, a nav click, or Escape all close it.
function openSidebar() {
  document.getElementById("sidebar")?.classList.add("open");
  document.getElementById("sidebar-backdrop")?.classList.add("visible");
}
function closeSidebar() {
  document.getElementById("sidebar")?.classList.remove("open");
  document.getElementById("sidebar-backdrop")?.classList.remove("visible");
}
document.getElementById("sidebar-toggle").addEventListener("click", () => {
  const sidebar = document.getElementById("sidebar");
  if (sidebar?.classList.contains("open")) closeSidebar();
  else openSidebar();
});
document.getElementById("sidebar-backdrop").addEventListener("click", closeSidebar);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSidebar();
});

function showApp() {
  const user = getCurrentUser();
  loginScreen.style.display = "none";
  appRoot.classList.add("active");
  document.getElementById("user-name").textContent = user.name;
  document.getElementById("user-role").textContent = ROLES[user.role];
  document.getElementById("user-avatar").textContent = initials(user.name);
  renderSidebar();
  initRouter(contentEl, updateActiveNav);
  if (!currentRoute() || !location.hash) {
    navigateTo(firstAllowedRoute(user.role));
  } else {
    handleRoute();
  }
}

function showLogin() {
  appRoot.classList.remove("active");
  loginScreen.style.display = "flex";
}

// Decorative animated line background on the login screen's hero panel —
// rendered once, up front, since the panel exists in the DOM whether or
// not it's currently visible (it's just hidden below 860px).
renderLoginLines(document.getElementById("login-hero-lines"));

// Password show/hide toggle on the login form.
document.getElementById("login-password-toggle").addEventListener("click", () => {
  const input = document.getElementById("login-password");
  const btn = document.getElementById("login-password-toggle");
  const nowVisible = input.type === "password";
  input.type = nowVisible ? "text" : "password";
  btn.textContent = nowVisible ? "Hide" : "Show";
  btn.setAttribute("aria-label", nowVisible ? "Hide password" : "Show password");
});

document.getElementById("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  const result = login(email, password);
  const errorEl = document.getElementById("login-error");
  if (!result.ok) {
    errorEl.textContent = result.error;
    errorEl.style.display = "block";
    return;
  }
  errorEl.style.display = "none";
  location.hash = "";
  showApp();
});

// Phase 1 has no backend to actually reset a password against — this is
// an honest placeholder rather than a dead-end link, and it doubles as
// a second way to find the demo credentials.
document.getElementById("forgot-password-link").addEventListener("click", (e) => {
  e.preventDefault();
  openModal({
    title: "Forgot Password",
    bodyHtml: `
      <p style="font-size:14px; color:var(--text-secondary); line-height:1.5;">
        Password resets aren't self-service in this Phase 1 demo. Please contact your Super Admin to reset your
        password, or sign in with one of the demo accounts below.
      </p>
      <div class="login-hint" style="margin-top:14px;">
        <strong>Demo accounts</strong> · Password for all: <span class="mono">demo123</span><br />
        Admin: ahmed@axeprinting.demo<br />
        Admin: nida@axeprinting.demo<br />
        Operator (Print Counter only): sara@axeprinting.demo<br />
        Operator (Print Counter only): bilal@axeprinting.demo
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" data-close-modal>Close</button>
      </div>
    `,
  });
});

document.getElementById("logout-btn").addEventListener("click", () => {
  logout();
  toast("Signed out.");
  location.hash = "";
  showLogin();
});

// Quick-fill helper for the demo login hint (click a role email to fill it in)
document.getElementById("login-screen").addEventListener("click", (e) => {
  // no-op placeholder for future quick-login buttons
});

if (isLoggedIn()) {
  showApp();
} else {
  showLogin();
}

// The app-shell service worker (offline caching) has been retired — this
// is a single shop-counter tool that's always run against its own
// localhost server, so offline support wasn't worth what it cost: a
// service worker left over from earlier testing could keep serving an
// OLD cached copy of index.html/main.js after a real update, which is
// exactly what caused the "log in, and it just shows the login screen
// again until I hard-refresh" bug — the page was still running yesterday's
// JS against today's login flow. Rather than trying to make the update
// dance airtight, we remove the whole mechanism and actively clean up any
// service worker + cache a browser registered during earlier testing, so
// every machine self-heals on its next load without needing a manual
// DevTools "Unregister" or a hard refresh.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister());
  }).catch(() => {});
}
if ("caches" in window) {
  caches.keys().then((names) => {
    names.filter((n) => n.startsWith("axeprinting-shell-")).forEach((n) => caches.delete(n));
  }).catch(() => {});
}

// --- Print Bridge: pick up held real print jobs without opening a new tab --
// Without this, the only way the agent (windows-print-bridge/print-agent.ps1)
// can hand a held job to the browser is to ask Windows to open a URL, which
// always creates a brand new tab — fine for the very first job of the day,
// but tabs pile up fast once a counter is handling many jobs. Instead, an
// already-open Operator tab polls the agent every couple of seconds; the
// agent treats a recent poll as "a tab is watching" and queues the job for
// it instead of launching a new one (see print-agent.ps1's Test-TabIsWatching).
//
// Deliberately Operator-only: an Operator's only screen ever is Print
// Counter (see rbac.js), so jumping there mid-poll never interrupts
// anything. An Admin might be mid-edit somewhere else in the app on this
// same computer, and hijacking that tab out from under them would lose
// unsaved work — so an Admin session simply doesn't poll, and the agent's
// own "nothing is watching" fallback (a new tab) covers that case exactly
// as it always has.
const PRINT_AGENT_URL = "http://127.0.0.1:8899";
async function pollForHeldPrintJob() {
  const user = getCurrentUser();
  if (!user || user.role !== "OPERATOR") return;
  // Don't even ask for the next job while a modal is open (mid-way through
  // confirming the current one, or any other dialog) — the agent's
  // /pending-jobs removes a job from its queue the moment it hands it
  // over, so fetching one now, then dropping it because we can't safely
  // open another modal on top of this one, would lose it for good. Skip
  // this tick instead; it stays queued server-side for the very next poll,
  // moments after the operator finishes and this modal closes.
  if (document.getElementById("modal-root")?.children.length > 0) return;
  try {
    const res = await fetch(`${PRINT_AGENT_URL}/pending-jobs`);
    if (!res.ok) return;
    const job = await res.json();
    if (job && job.jobId) {
      const qs = new URLSearchParams({
        new: "1",
        source: job.source || "Other",
        realPrinter: job.printer,
        realJobId: job.jobId,
      }).toString();
      location.hash = `/print-counter?${qs}`;
    }
  } catch {
    // No Print Bridge agent running on this computer, or nothing gated —
    // completely normal most of the time. Silent by design: this polls
    // every 2 seconds, so surfacing every miss would spam toasts nonstop.
  }
}
setInterval(pollForHeldPrintJob, 2000);
