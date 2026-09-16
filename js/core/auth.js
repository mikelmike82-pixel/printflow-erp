// Mock authentication for the Phase 1 demo.
//
// IMPORTANT: this is a stand-in for Firebase Authentication. In Phase 2
// this whole module gets replaced with real Firebase Auth (email/password),
// while the rest of the app keeps calling getCurrentUser()/isLoggedIn()
// the same way — that's the seam we're deliberately building in now.

import { ROLES } from "./rbac.js";

const SESSION_KEY = "axeprinting_session_v1";

// Seeded demo users. Passwords are plaintext here ONLY because this is an
// in-memory/localStorage demo with fake data — never do this with real
// credentials. Real auth + hashed credentials arrive in Phase 2.
export const MOCK_USERS = [
  {
    id: "u-admin",
    name: "Ahmed Raza",
    email: "ahmed@axeprinting.demo",
    password: "demo123",
    role: "ADMIN",
    title: "Admin",
  },
  {
    id: "u-accounts",
    name: "Nida Farooq",
    email: "nida@axeprinting.demo",
    password: "demo123",
    role: "ADMIN",
    title: "Admin",
  },
  {
    id: "u-sales",
    name: "Sara Khan",
    email: "sara@axeprinting.demo",
    password: "demo123",
    role: "OPERATOR",
    title: "Operator",
  },
  {
    id: "u-production",
    name: "Bilal Ahmed",
    email: "bilal@axeprinting.demo",
    password: "demo123",
    role: "OPERATOR",
    title: "Operator",
  },
];

// Persisted the same way as the rest of the app's data (see store.js) —
// without this, a user added/edited/removed in one tab would revert to
// these seed accounts the moment a NEW tab opened (e.g. the Print Bridge
// agent opening the New Print Job screen), which would silently undo
// account changes and even let a "deleted" user's old password keep
// working there. MOCK_USERS stays the same array reference throughout
// (emptied and refilled in place) since other modules hold onto it.
const USERS_KEY = "axeprinting_users_v1";
try {
  const raw = localStorage.getItem(USERS_KEY);
  const persistedUsers = raw ? JSON.parse(raw) : null;
  if (Array.isArray(persistedUsers) && persistedUsers.length > 0) {
    MOCK_USERS.length = 0;
    MOCK_USERS.push(...persistedUsers);
  }
} catch {}

function persistUsers() {
  try { localStorage.setItem(USERS_KEY, JSON.stringify(MOCK_USERS)); } catch {}
}

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

function emailTaken(email, excludeId) {
  const norm = String(email).trim().toLowerCase();
  return MOCK_USERS.some((u) => u.id !== excludeId && u.email.toLowerCase() === norm);
}

// Real, working user-management functions backing the Users & Roles page.
// These mutate the live in-memory MOCK_USERS array directly (same pattern
// already used by the role-toggle feature) — there's no Firebase Auth yet
// in Phase 1, so this *is* the account store for now. Phase 2 swaps these
// for real Firebase Auth calls behind the same function signatures.
export function addMockUser({ name, email, password, role }) {
  name = String(name || "").trim();
  email = String(email || "").trim();
  password = String(password || "");
  if (!name || !email || !password) return { ok: false, error: "Name, email and password are all required." };
  if (!ROLES[role]) return { ok: false, error: "Please choose a role." };
  if (emailTaken(email)) return { ok: false, error: "A user with that email already exists." };
  const user = {
    id: "u-" + Math.random().toString(36).slice(2, 10),
    name,
    email,
    password,
    role,
    title: ROLES[role],
  };
  MOCK_USERS.push(user);
  persistUsers();
  return { ok: true, user };
}

export function updateMockUser(id, { name, email, password, role }) {
  const user = MOCK_USERS.find((u) => u.id === id);
  if (!user) return { ok: false, error: "User not found." };
  name = String(name || "").trim();
  email = String(email || "").trim();
  if (!name || !email) return { ok: false, error: "Name and email are required." };
  if (role && !ROLES[role]) return { ok: false, error: "Invalid role." };
  if (emailTaken(email, id)) return { ok: false, error: "A user with that email already exists." };
  user.name = name;
  user.email = email;
  if (password) user.password = password;
  if (role) {
    user.role = role;
    user.title = ROLES[role];
  }
  persistUsers();
  return { ok: true, user };
}

export function deleteMockUser(id) {
  const idx = MOCK_USERS.findIndex((u) => u.id === id);
  if (idx === -1) return { ok: false, error: "User not found." };
  const user = MOCK_USERS[idx];
  const current = getCurrentUser();
  if (current && current.id === id) return { ok: false, error: "You can't delete your own account while logged in." };
  if (user.role === "ADMIN" && MOCK_USERS.filter((u) => u.role === "ADMIN").length <= 1) {
    return { ok: false, error: "Can't delete the only remaining Admin." };
  }
  MOCK_USERS.splice(idx, 1);
  persistUsers();
  return { ok: true };
}
