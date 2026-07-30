/**
 * Alpha Workspace service worker, hand-rolled (Serwist-equivalent) so the
 * offline strategy stays legible and Turbopack-independent:
 *
 *  - static assets (fonts, brand, /_next/static): cache-first (immutable)
 *  - GET /api/*: network-first with cache fallback → offline reads
 *  - navigations to the signed-in app: stale-while-revalidate, so a repeat
 *    visit paints from cache instead of waiting out a 3G round trip
 *  - every other navigation: network-first, cached copy, then /offline
 *  - Background Sync "aw-outbox": replays the IndexedDB write queue when the
 *    app is closed; open tabs are asked to flush instead (idempotent either
 *    way, creates carry client UUIDs, updates are last-write-wins)
 *  - web push: notification + deep link
 *  - new-version handshake: this worker WAITS instead of claiming mid-session,
 *    and tells the page when the copy it painted has been superseded. The page
 *    offers a refresh (see components/app/update-prompt.tsx), we never force
 *    one.
 *
 * Bump VERSION to invalidate caches on deploy of breaking asset changes.
 */
// v4: shell-mode bootstrap field. Cached pre-shell HTML would re-show
// upgrade surfaces inside the store webview, so old caches must go.
const VERSION = "aw-v4";
const STATIC_CACHE = `static-${VERSION}`;
const DATA_CACHE = `data-${VERSION}`;
const PAGE_CACHE = `pages-${VERSION}`;

/**
 * Page HTML carries the whole server-rendered bootstrap, so these entries are
 * fat and every ?view= variant is its own key. Cache Storage evicts per origin
 * when the quota fills, and that would take the offline write queue with it.
 */
const PAGE_CACHE_LIMIT = 40;

const PRECACHE = [
  "/offline",
  "/brand/icon-white.svg",
  "/brand/logo-white.svg",
  "/icons/icon-192.png",
  "/fonts/instrument-sans-normal-latin.woff2",
  "/fonts/instrument-sans-normal-latin-ext.woff2",
];

/**
 * No skipWaiting here, deliberately. A worker that claims the moment it
 * installs starts its activate handler, which deletes every cache from the
 * previous VERSION, underneath tabs that are still running the previous
 * build and may be mid-recording or mid-upload. Instead a new worker sits in
 * `waiting` until a page asks it to take over (the message below), which is
 * the user pressing Refresh. Nobody is interrupted, and a user who never
 * accepts simply gets the new worker the next time every tab is closed.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "aw-activate-update") self.skipWaiting();
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
    if (isStorable(response)) {
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

/**
 * Signed-in surfaces: the daily-driver pages someone opens over and over, and
 * the only ones a stale-first paint can help. Marketing, /sign-in and /invite
 * stay network-first, partly because they are one-shot visits with nothing to
 * gain, partly because their content flips on session state.
 */
function isAppShellPath(pathname) {
  return (
    pathname === "/app" ||
    pathname === "/account" ||
    pathname === "/admin" ||
    pathname.startsWith("/w/") ||
    pathname.startsWith("/account/") ||
    pathname.startsWith("/admin/")
  );
}

/**
 * Only keep a response that IS the thing we asked for. A followed redirect
 * (an /api read that bounced to the sign-in page) arrives ok:true under a
 * different URL, and caching it files sign-in HTML under an app URL.
 * Navigations never reach this state, the browser fetches them with
 * redirect:"manual" so a 302 comes back opaque and !ok.
 */
function isStorable(response) {
  return response.ok && !response.redirected && response.type === "basic";
}

/** Pages additionally have to be pages: a navigation can land on a download. */
function isStorablePage(response) {
  return (
    isStorable(response) &&
    (response.headers.get("content-type") || "").includes("text/html")
  );
}

/**
 * A build fingerprint for a page response: the hashed asset URLs its <head>
 * pulls in, deduped and sorted. Two renders of the same page differ in their
 * body (that is the work data), so comparing documents is useless; the head's
 * script and stylesheet chunks are content-hashed at build time and change
 * only when the code does. Deriving it from the response we already hold
 * beats asking the network for a version number, which would cost every
 * navigation an extra round trip on a link that has none to spare.
 *
 * Deliberately blind to server-only changes: a false "there is a new version"
 * is a nag, a missed one just means the next navigation paints it (the fresh
 * copy lands in the cache either way). Bias to silence.
 */
async function buildTag(response) {
  const text = await response.text();
  const end = text.indexOf("</head>");
  const head = end > 0 ? text.slice(0, end) : text.slice(0, 4096);
  return [...new Set(head.match(/\/_next\/static\/[^"']+/g) || [])].sort().join("|");
}

/**
 * Tell the tab that was just handed a stale page, and only that tab. Other
 * windows get told when they navigate, so a tab already running the new build
 * can never be nagged about it.
 */
async function announceUpdate(event) {
  const id = event.resultingClientId || event.clientId;
  const client = id ? await self.clients.get(id) : null;
  if (client) client.postMessage({ type: "aw-update" });
}

/** Insertion-ordered, so the oldest writes fall off the front. */
async function trimCache(cache, limit) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, keys.length - limit)) {
    await cache.delete(key);
  }
}

/**
 * We painted a cached app page and the server has since answered that URL
 * with a redirect: the session expired, or this workspace is no longer
 * theirs. The page on screen is a lie either way, so drop everything
 * personal (the mirror of purgeLocalData, outbox excluded, those writes are
 * still the signed-in user's) and reload the tab. With no cached copy left
 * the reload is a plain network navigation and lands wherever the server
 * actually points, so this cannot loop.
 */
async function revoked(event, url) {
  await Promise.all([caches.delete(PAGE_CACHE), caches.delete(DATA_CACHE)]);
  try {
    const id = event.resultingClientId || event.clientId;
    const client = id ? await self.clients.get(id) : null;
    if (client && "navigate" in client) await client.navigate(url);
  } catch {
    // Client gone, or navigate refused. The caches are cleared regardless, so
    // the next navigation resolves correctly on its own.
  }
}

/**
 * Paint from cache, refresh behind it. Network-first meant every navigation
 * on a patchy SA mobile link waited out a round trip (or the whole fetch
 * timeout on a degraded one) before showing anything, even holding a good
 * copy. Stale page DATA is self-healing here: the bootstrap the HTML carries
 * is only react-query's initialData, and the query refetches on mount.
 */
async function staleWhileRevalidate(event, request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  // Fingerprint the copy we are about to paint, now, while its body is still
  // ours to read: once a response is handed to respondWith its stream is
  // locked and clone() throws. The catch is load-bearing too, on a failed
  // revalidate nothing ever awaits this promise, and an unhandled rejection
  // in a service worker kills the worker.
  const paintedTag = cached ? buildTag(cached.clone()).catch(() => null) : null;

  const revalidate = fetch(request).then(async (response) => {
    if (isStorablePage(response)) {
      await cache.put(request, response.clone());
      await trimCache(cache, PAGE_CACHE_LIMIT);
    }
    return response;
  });

  if (!cached) {
    try {
      return await revalidate;
    } catch (err) {
      if (fallbackUrl) {
        const fallback = await caches.match(fallbackUrl);
        if (fallback) return fallback;
      }
      throw err;
    }
  }

  event.waitUntil(
    revalidate
      .then(async (response) => {
        // Opaque because navigations fetch with redirect:"manual", so we know
        // this URL redirects now but not to where. Enough to act on.
        if (response.type === "opaqueredirect") return revoked(event, request.url);
        if (!isStorablePage(response)) return;
        // The server has since answered this URL with a different build, so
        // the page on screen is the previous version of the app. Say so.
        const [painted, fresh] = await Promise.all([
          paintedTag,
          buildTag(response.clone()),
        ]);
        if (painted && fresh && painted !== fresh) await announceUpdate(event);
      })
      .catch(() => undefined),
  );
  return cached;
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
    event.respondWith(
      isAppShellPath(url.pathname)
        ? staleWhileRevalidate(event, request, PAGE_CACHE, "/offline")
        : networkFirst(request, PAGE_CACHE, "/offline"),
    );
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
