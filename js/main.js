import { login, logout, getCurrentUser, isLoggedIn } from "./core/auth.js";
import { NAV_SECTIONS, ROLES, firstAllowedRoute } from "./core/rbac.js";
import { initRouter, registerModule, handleRoute, navigateTo, currentRoute } from "./core/router.js";
import { initials } from "./core/format.js";
import { toast } from "./core/ui.js";

import * as dashboard from "./modules/dashboard.js";
import * as crm from "./modules/crm.js";
import * as printing from "./modules/printing.js";
import * as customers from "./modules/customers.js";
import * as vendors from "./modules/vendors.js";
import * as inventory from "./modules/inventory.js";
import * as salesOrders from "./modules/salesOrders.js";
import * as purchaseOrders from "./modules/purchaseOrders.js";
import * as grn from "./modules/grn.js";
import * as dispatch from "./modules/dispatch.js";
import * as invoicing from "./modules/invoicing.js";
import * as ledger from "./modules/ledger.js";
import * as pdc from "./modules/pdc.js";
import * as reports from "./modules/reports.js";
import * as users from "./modules/users.js";
import * as auditTrail from "./modules/auditTrail.js";
import * as settings from "./modules/settings.js";

registerModule("dashboard", dashboard);
registerModule("crm", crm);
registerModule("printing", printing);
registerModule("customers", customers);
registerModule("vendors", vendors);
registerModule("inventory", inventory);
registerModule("sales-orders", salesOrders);
registerModule("purchase-orders", purchaseOrders);
registerModule("grn", grn);
registerModule("dispatch", dispatch);
registerModule("invoicing", invoicing);
registerModule("ledger", ledger);
registerModule("pdc", pdc);
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
  document.getElementById("sidebar")?.classList.remove("open");
}

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
