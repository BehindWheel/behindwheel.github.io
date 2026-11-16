/* The site's offline shell. Strategies per request kind:
   - navigations: network first — a deploy must always win; the cached page
     is only the offline fallback (and "/" stands in for any miss);
   - the CDN data: network first with the last good snapshot kept — offline
     the map opens with the previous picture instead of nothing;
   - same-origin static assets: cache first — every name under _next/static
     is content-hashed, the rest (icons, styles, audio, the worker) change
     only with a deploy, and the shell cache is versioned with the file.
   Map tiles are deliberately not cached: terabytes of temptation, and the
   browser's own HTTP cache already softens repeat visits. */

const VERSION = "v1";
const SHELL_CACHE = `shell-${VERSION}`;
const DATA_CACHE = `data-${VERSION}`;
const DATA_ORIGIN = "https://cdn-data.behindwheel.workers.dev";
const STATIC_PREFIXES = ["/_next/static/", "/icons/", "/styles/", "/audio/"];
const STATIC_FILES = ["/maplibre-gl-worker.mjs", "/apple-touch-icon.png", "/og.png"];

self.addEventListener("install", () => {
  // Nothing to precache: the shell's chunk names are content-hashed and
  // discovered at runtime, "/" is cached on the first visit below.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function cachePut(cacheName, request, response) {
  const copy = response.clone();
  return caches.open(cacheName).then((cache) => cache.put(request, copy));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          event.waitUntil(cachePut(SHELL_CACHE, request, response));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached ?? caches.match("/")),
        ),
    );
    return;
  }

  if (url.origin === DATA_ORIGIN) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          event.waitUntil(cachePut(DATA_CACHE, request, response));
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  const isStatic =
    url.origin === self.location.origin &&
    (STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)) ||
      STATIC_FILES.includes(url.pathname));
  if (isStatic) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            event.waitUntil(cachePut(SHELL_CACHE, request, response));
            return response;
          }),
      ),
    );
  }
});
