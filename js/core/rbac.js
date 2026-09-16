// Role-based access control: one place that defines which roles can see
// which modules. The sidebar and the router both read from this list, so
// a route can never be reachable-but-hidden or visible-but-blocked.
//
// Just two roles, matching how this shop actually works:
//   - OPERATOR: staff who only run the Print Counter (customers dropping
//     off a job and printing it, e.g. from CorelDRAW/Word). They sign in
//     once and stay signed in — every subsequent print job auto-opens the
//     New Print Job screen without asking for a login again.
//   - ADMIN: everything — customers, vendors, purchasing/stock, bills,
//     reports, printers, users, settings. Admin decides who else gets
//     Admin access (Users & Roles).

export const ROLES = {
  ADMIN: "Admin",
  OPERATOR: "Operator",
};

const ALL = Object.keys(ROLES);

// Each entry: route key (matches js/modules/<key>.js export), nav label,
// which roles may access it, and which sidebar group it falls under.
export const NAV_SECTIONS = [
  {
    label: "Overview",
    items: [
      { route: "dashboard", label: "Dashboard", roles: ["ADMIN"] },
    ],
  },
  {
    label: "Printing",
    items: [
      { route: "print-counter", label: "Print Counter", roles: ALL },
      { route: "printers", label: "Printers / Plotters", roles: ["ADMIN"] },
    ],
  },
  {
    label: "Sales & Billing",
    items: [
      { route: "customers", label: "Customers", roles: ["ADMIN"] },
      { route: "invoicing", label: "Bills", roles: ["ADMIN"] },
    ],
  },
  {
    label: "Purchasing & Stock",
    items: [
      { route: "vendors", label: "Vendors", roles: ["ADMIN"] },
      { route: "purchase-orders", label: "Purchase Orders", roles: ["ADMIN"] },
      { route: "grn", label: "Goods Receiving (GRN)", roles: ["ADMIN"] },
      { route: "inventory", label: "Stock", roles: ["ADMIN"] },
    ],
  },
  {
    label: "Finance",
    items: [
      { route: "reports", label: "Reports", roles: ["ADMIN"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { route: "users", label: "Users & Roles", roles: ["ADMIN"] },
      { route: "audit-trail", label: "Audit Trail", roles: ["ADMIN"] },
      { route: "settings", label: "Settings", roles: ["ADMIN"] },
    ],
  },
];

export function allRoutes() {
  return NAV_SECTIONS.flatMap((s) => s.items);
}

export function routeAllowed(routeKey, role) {
  const item = allRoutes().find((r) => r.route === routeKey);
  if (!item) return false;
  return item.roles.includes(role);
}

export function firstAllowedRoute(role) {
  const item = allRoutes().find((r) => r.roles.includes(role));
  return item ? item.route : "dashboard";
}
