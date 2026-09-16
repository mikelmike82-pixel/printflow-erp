// Axe Printing Solutions — App Shell Service Worker
//
// Purpose: let the app still LOAD with no internet connection, by caching
// the small, known set of files needed to boot (HTML entry point, CSS,
// JS modules). This has nothing to do with the app's DATA being available
// offline — that's Firestore's own offline persistence + Firebase Auth's
// own persisted session (Phase 2, see README "Offline Support"). This
// service worker must stay completely out of the way of any Firebase
// Authentication / Firestore network traffic.
//
// Strategy:
//   - The HTML entry point: network-first, falling back to cache only when
//     there's truly no connection. This guarantees a deployed fix reaches
//     users immediately when they're online, instead of an old cached
//     copy sticking around indefinitely.
//   - Everything else in the shell (css/js): cache-first for instant load,
//     refreshed from the network in the background whenever possible.
//   - EXACT URL matching only — nothing fuzzy/glob. Any request not in the
//     explicit list below (this includes every Firebase/Firestore/Google
//     API call, and every third-party CDN request) is left completely
//     alone: this worker never calls respondWith() for it, so it goes
//     straight to the network exactly as if no service worker existed.
//
// Versioning: bump SW_VERSION on any deploy where you want every user's
// browser to drop its old cached shell and fetch a fresh one. Old
// version's cache is deleted automatically on activate.

const SW_VERSION = "v9";
const SHELL_CACHE = `axeprinting-shell-${SW_VERSION}`;

// Paths are relative to this file's own location (self.location), which
// is the site root wherever it's deployed — this keeps the same list
// working unchanged on localhost, on a GitHub Pages project subpath
// (https://user.github.io/repo-name/), or on a future Firebase Hosting
// custom domain, without hardcoding any of those.
const SHELL_RELATIVE_PATHS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/logo-full.png",
  "./assets/logo-full-transparent.png",
  "./assets/logo-icon.png",
  "./assets/login-bg.jpg",
  "./assets/icon-48.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./css/tokens.css",
  "./css/base.css",
  "./css/layout.css",
  "./css/components.css",
  "./js/main.js",
  "./js/core/auth.js",
  "./js/core/rbac.js",
  "./js/core/router.js",
  "./js/core/store.js",
  "./js/core/format.js",
  "./js/core/ui.js",
  "./js/core/loginFx.js",
  "./js/data/mock-data.js",
  "./js/modules/dashboard.js",
  "./js/modules/printing.js",
  "./js/modules/printCounter.js",
  "./js/modules/printers.js",
  "./js/modules/customers.js",
  "./js/modules/vendors.js",
  "./js/modules/inventory.js",
  "./js/modules/salesOrders.js",
  "./js/modules/purchaseOrders.js",
  "./js/modules/grn.js",
  "./js/modules/dispatch.js",
  "./js/modules/invoicing.js",
  "./js/modules/ledger.js",
  "./js/modules/pdc.js",
  "./js/modules/reports.js",
  "./js/modules/users.js",
  "./js/modules/auditTrail.js",
  "./js/modules/settings.js",
  // Phase 2 adds the pinned Firebase SDK CDN URLs (firebase-app,
  // firebase-auth, firebase-firestore — exact versioned URLs only) here,
  // with the same cache-first treatment as the rest of the shell.
];

function resolveShellUrls() {
  return SHELL_RELATIVE_PATHS.map((p) => new URL(p, self.location.href).href);
}

// The entry document gets network-first treatment. Both "the site root"
// and "index.html" resolve to the same deployed file, so both need to be
// recognized.
function networkFirstUrls() {
  return new Set([
    new URL("./", self.location.href).href,
    new URL("./index.html", self.location.href).href,
  ]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(resolveShellUrls())).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name.startsWith("axeprinting-shell-") && name !== SHELL_CACHE)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never touch anything but simple GETs, and never touch cross-origin
  // requests — that alone keeps this worker away from Firebase Auth,
  // Firestore, and any CDN traffic, without needing to know their URLs.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  const shellUrls = resolveShellUrls();
  const netFirst = networkFirstUrls();

  if (netFirst.has(request.url) || (request.mode === "navigate" && shellUrls.includes(request.url))) {
    event.respondWith(networkFirstThenCache(request));
    return;
  }

  if (shellUrls.includes(request.url)) {
    event.respondWith(cacheFirstWithBackgroundRefresh(request));
    return;
  }

  // Anything not explicitly listed (including every non-shell URL, same
  // origin or not) is left completely unhandled — falls through to the
  // network exactly as if this service worker weren't installed.
});

async function networkFirstThenCache(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirstWithBackgroundRefresh(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);

  const networkUpdate = fetch(request)
    .then((fresh) => {
      if (fresh && fresh.ok) cache.put(request, fresh.clone());
      return fresh;
    })
    .catch(() => null);

  // Instant response from cache when we have one; otherwise wait on the
  // network (covers the very first visit, before anything is cached).
  return cached || (await networkUpdate) || fetch(request);
}
