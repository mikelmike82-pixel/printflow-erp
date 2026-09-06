// Minimal hash-based router. No build step / framework needed for an
// app this size — each module is a plain JS file exporting render().
import { getCurrentUser } from "./auth.js";
import { routeAllowed, firstAllowedRoute, allRoutes } from "./rbac.js";
import { toast } from "./ui.js";

const registry = new Map();
let contentEl = null;
let onNavigate = null;

export function registerModule(routeKey, moduleExports) {
  registry.set(routeKey, moduleExports);
}

export function initRouter(contentElement, navigateCallback) {
  contentEl = contentElement;
  onNavigate = navigateCallback;
  window.addEventListener("hashchange", handleRoute);
}

export function currentRoute() {
  return (location.hash.replace(/^#\/?/, "") || "").split("?")[0] || "dashboard";
}

export function currentParams() {
  const q = location.hash.split("?")[1];
  return Object.fromEntries(new URLSearchParams(q || ""));
}

export function navigateTo(routeKey, params = {}) {
  const qs = new URLSearchParams(params).toString();
  location.hash = `/${routeKey}${qs ? `?${qs}` : ""}`;
}

export function handleRoute() {
  const user = getCurrentUser();
  if (!user) return;

  let route = currentRoute();
  if (!routeAllowed(route, user.role)) {
    toast("You don't have access to that section.", "danger");
    route = firstAllowedRoute(user.role);
    location.hash = `/${route}`;
    return;
  }

  const mod = registry.get(route);
  if (!mod) {
    contentEl.innerHTML = `<div class="empty-state">Module "${route}" isn't wired up yet.</div>`;
    return;
  }

  contentEl.innerHTML = "";
  mod.render(contentEl, currentParams());

  const navItem = allRoutes().find((r) => r.route === route);
  if (onNavigate) onNavigate(route, navItem);
  window.scrollTo?.(0, 0);
  contentEl.scrollTop = 0;
}
