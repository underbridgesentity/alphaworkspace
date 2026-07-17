/**
 * Alpha Workspace service worker — hand-rolled (Serwist-equivalent) so the
 * offline strategy stays legible and Turbopack-independent:
 *
 *  - static assets (fonts, brand, /_next/static): cache-first (immutable)
 *  - GET /api/*: network-first with cache fallback → offline reads
 *  - navigations: network-first, cached copy, then /offline
 *  - Background Sync "aw-outbox": replays the IndexedDB write queue when the
 *    app is closed; open tabs are asked to flush instead (idempotent either
 *    way — creates carry client UUIDs, updates are last-write-wins)
 *  - web push: notification + deep link
 *
 * Bump VERSION to invalidate caches on deploy of breaking asset changes.
 */
const VERSION = "aw-v2";
const STATIC_CACHE = `static-${VERSION}`;
const DATA_CACHE = `data-${VERSION}`;
const PAGE_CACHE = `pages-${VERSION}`;

const PRECACHE = [
  "/offline",
  "/brand/icon-white.svg",
  "/brand/logo-white.svg",
  "/icons/icon-192.png",
  "/fonts/instrument-sans-normal-latin.woff2",
  "/fonts/instrument-sans-normal-latin-ext.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.endsWith(VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, cacheName, fallbackUrl) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // writes queue in the page's outbox
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (url.pathname.startsWith("/api/auth/")) return; // never cache auth

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, PAGE_CACHE, "/offline"));
  }
});

/* ------------------------------ outbox sync ------------------------------ */

const IDB_NAME = "aw";
const OUTBOX_STORE = "outbox";

function openOutboxDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(OUTBOX_STORE)) {
        req.result.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function outboxGetAll(db) {
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(OUTBOX_STORE, "readonly")
      .objectStore(OUTBOX_STORE)
      .getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function outboxDelete(db, id) {
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(OUTBOX_STORE, "readwrite")
      .objectStore(OUTBOX_STORE)
      .delete(id);
    req.onsuccess = () => resolve(undefined);
    req.onerror = () => reject(req.error);
  });
}

async function replayOutbox() {
  const windows = await self.clients.matchAll({ type: "window" });
  if (windows.length > 0) {
    // A live tab replays with full app context (and shows the toast).
    for (const client of windows) client.postMessage({ type: "flush-outbox" });
    return;
  }
  const db = await openOutboxDb();
  const ops = (await outboxGetAll(db)).sort((a, b) => a.createdAt - b.createdAt);
  for (const op of ops) {
    let response;
    try {
      response = await fetch(op.url, {
        method: op.method,
        headers: { "content-type": "application/json" },
        body: op.body === undefined ? undefined : JSON.stringify(op.body),
      });
    } catch {
      throw new Error("still offline"); // keep the sync registration alive
    }
    if (
      response.ok ||
      (op.method === "DELETE" && response.status === 404)
    ) {
      await outboxDelete(db, op.id);
    } else if (response.status === 401) {
      return; // needs sign-in; a tab will flush later
    } else {
      await outboxDelete(db, op.id); // permanent rejection
    }
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "aw-outbox") event.waitUntil(replayOutbox());
});

/* -------------------------------- push ----------------------------------- */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Alpha Workspace", body: event.data?.text() ?? "" };
  }
  const title = payload.title || "Alpha Workspace";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url || "/app" },
      tag: payload.type || "aw",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/app";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
