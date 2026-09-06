// Mock authentication for the Phase 1 demo.
//
// IMPORTANT: this is a stand-in for Firebase Authentication. In Phase 2
// this whole module gets replaced with real Firebase Auth (email/password),
// while the rest of the app keeps calling getCurrentUser()/isLoggedIn()
// the same way — that's the seam we're deliberately building in now.

const SESSION_KEY = "printflow_session_v1";

// Seeded demo users. Passwords are plaintext here ONLY because this is an
// in-memory/localStorage demo with fake data — never do this with real
// credentials. Real auth + hashed credentials arrive in Phase 2.
export const MOCK_USERS = [
  {
    id: "u-admin",
    name: "Ahmed Raza",
    email: "ahmed@printflow.demo",
    password: "demo123",
    role: "SUPER_ADMIN",
    title: "Super Admin",
  },
  {
    id: "u-sales",
    name: "Sara Khan",
    email: "sara@printflow.demo",
    password: "demo123",
    role: "SALES_CRM",
    title: "Sales & CRM",
  },
  {
    id: "u-production",
    name: "Bilal Ahmed",
    email: "bilal@printflow.demo",
    password: "demo123",
    role: "PRODUCTION",
    title: "Production / Printing",
  },
  {
    id: "u-accounts",
    name: "Nida Farooq",
    email: "nida@printflow.demo",
    password: "demo123",
    role: "ACCOUNTS",
    title: "Accounts",
  },
];

export function login(email, password) {
  const user = MOCK_USERS.find(
    (u) => u.email.toLowerCase() === String(email).trim().toLowerCase() && u.password === password
  );
  if (!user) return { ok: false, error: "Invalid email or password." };
  localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, loginAt: new Date().toISOString() }));
  return { ok: true, user };
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}

export function isLoggedIn() {
  return !!getCurrentUser();
}

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    return MOCK_USERS.find((u) => u.id === session.userId) || null;
  } catch {
    return null;
  }
}
