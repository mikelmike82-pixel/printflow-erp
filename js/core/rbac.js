// Role-based access control: one place that defines which roles can see
// which modules. The sidebar and the router both read from this list, so
// a route can never be reachable-but-hidden or visible-but-blocked.

export const ROLES = {
  SUPER_ADMIN: "Super Admin",
  SALES_CRM: "Sales & CRM",
  PRODUCTION: "Production / Printing",
  ACCOUNTS: "Accounts",
};

const ALL = Object.keys(ROLES);

// Each entry: route key (matches js/modules/<key>.js export), nav label,
// which roles may access it, and which sidebar group it falls under.
export const NAV_SECTIONS = [
  {
    label: "Overview",
    items: [
      { route: "dashboard", label: "Dashboard", roles: ALL },
    ],
  },
  {
    label: "CRM",
    items: [
      { route: "crm", label: "Leads & Pipeline", roles: ["SUPER_ADMIN", "SALES_CRM"] },
    ],
  },
  {
    label: "Production",
    items: [
      { route: "printing", label: "Print Jobs", roles: ["SUPER_ADMIN", "PRODUCTION", "SALES_CRM"] },
    ],
  },
  {
    label: "Sales",
    items: [
      { route: "customers", label: "Customers", roles: ["SUPER_ADMIN", "SALES_CRM", "ACCOUNTS"] },
      { route: "sales-orders", label: "Sales Orders", roles: ["SUPER_ADMIN", "SALES_CRM", "ACCOUNTS"] },
      { route: "dispatch", label: "Dispatch / Delivery", roles: ["SUPER_ADMIN", "SALES_CRM", "PRODUCTION"] },
      { route: "invoicing", label: "Invoicing", roles: ["SUPER_ADMIN", "ACCOUNTS"] },
    ],
  },
  {
    label: "Purchasing & Stock",
    items: [
      { route: "vendors", label: "Vendors", roles: ["SUPER_ADMIN", "ACCOUNTS"] },
      { route: "purchase-orders", label: "Purchase Orders", roles: ["SUPER_ADMIN", "ACCOUNTS"] },
      { route: "grn", label: "Goods Receiving (GRN)", roles: ["SUPER_ADMIN", "ACCOUNTS", "PRODUCTION"] },
      { route: "inventory", label: "Inventory / Warehouses", roles: ["SUPER_ADMIN", "PRODUCTION", "ACCOUNTS"] },
    ],
  },
  {
    label: "Finance",
    items: [
      { route: "ledger", label: "Accounting Ledger", roles: ["SUPER_ADMIN", "ACCOUNTS"] },
      { route: "pdc", label: "Post-Dated Cheques", roles: ["SUPER_ADMIN", "ACCOUNTS"] },
      { route: "reports", label: "Reports", roles: ["SUPER_ADMIN", "ACCOUNTS"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { route: "users", label: "Users & Roles", roles: ["SUPER_ADMIN"] },
      { route: "audit-trail", label: "Audit Trail", roles: ["SUPER_ADMIN"] },
      { route: "settings", label: "Settings & Backup", roles: ["SUPER_ADMIN"] },
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
