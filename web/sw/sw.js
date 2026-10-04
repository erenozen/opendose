// OpenDose offline cache (service worker). Template: vite.config.ts fills
// in the build id and the file lists and emits it as dist/sw.js.
//
// Nothing here talks to a server of ours (there is none): it only keeps
// copies of the files the app already downloads, so the second visit
// starts from disk and the app works offline.
//
// - App files (hashed, immutable) and the engine's Python bundle (URL
//   versioned by a hash of its content): cache first, one cache per build;
//   older builds' caches are deleted when this one activates.
// - The Python runtime and its packages (Pyodide on the CDN, versioned
//   URLs; openpyxl from PyPI once used): cache first, kept across builds.
// - The page itself: network first (a new release shows up at once),
//   the cached copy when offline.
/* global self, caches, fetch, URL, Response */
const BUILD = "__BUILD__";
const APP_CACHE = `opendose-app-${BUILD}`;
const RUNTIME_CACHE = "opendose-runtime";
const APP_FILES = __APP_FILES__;
const RUNTIME_FILES = __RUNTIME_FILES__;
const PYODIDE_PREFIX = "__PYODIDE_PREFIX__";
const SCOPE = new URL(self.registration.scope);
const INDEX = new URL("index.html", SCOPE).href;
const appSet = new Set(APP_FILES.map((f) => new URL(f, SCOPE).href));

async function fill(cacheName, urls) {
  const cache = await caches.open(cacheName);
  await Promise.all(urls.map(async (u) => {
    try {
      if (await cache.match(u)) return;
      const resp = await fetch(u);
      if (resp.ok) await cache.put(u, resp);
    } catch { /* fetched again on first use */ }
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await fill(APP_CACHE, [...appSet]);
    await fill(RUNTIME_CACHE, RUNTIME_FILES);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith("opendose-app-") && name !== APP_CACHE) await caches.delete(name);
    }
    // Runtime files of other Pyodide versions are no longer used.
    const rt = await caches.open(RUNTIME_CACHE);
    for (const req of await rt.keys()) {
      if (req.url.includes("/pyodide/v") && !req.url.startsWith(PYODIDE_PREFIX)) await rt.delete(req);
    }
    await self.clients.claim();
  })());
});

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const resp = await fetch(request);
  if (resp.ok && (resp.type === "basic" || resp.type === "cors")) {
    cache.put(request, resp.clone()).catch(() => {});
  }
  return resp;
}

async function page(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const resp = await fetch(request);
    if (resp.ok && (resp.headers.get("content-type") ?? "").includes("text/html")) {
      cache.put(INDEX, resp.clone()).catch(() => {});
    }
    return resp;
  } catch (e) {
    const hit = await cache.match(INDEX);
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (request.mode === "navigate" && url.href.startsWith(SCOPE.href)) {
    event.respondWith(page(request));
    return;
  }
  if (url.origin === SCOPE.origin) {
    const inBuild = appSet.has(url.href)
      || (url.pathname.startsWith(`${SCOPE.pathname}assets/`))
      || (url.pathname.endsWith("/py/opendose/bundle.json") && url.searchParams.has("v"));
    if (inBuild) event.respondWith(cacheFirst(APP_CACHE, request));
    return;
  }
  if (url.href.startsWith(PYODIDE_PREFIX) || url.hostname === "files.pythonhosted.org") {
    event.respondWith(cacheFirst(RUNTIME_CACHE, request));
    return;
  }
  if (url.hostname === "pypi.org") {
    // The package index: fresh when online, the last copy when offline.
    event.respondWith(fetch(request).then((resp) => {
      if (resp.ok) {
        const copy = resp.clone();
        caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy)).catch(() => {});
      }
      return resp;
    }, () => caches.open(RUNTIME_CACHE).then((c) => c.match(request))
      .then((hit) => hit ?? Response.error())));
  }
});
