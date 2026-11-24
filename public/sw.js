/* The site's offline shell. Strategies per request kind:
   - navigations: network first — a deploy must always win; the cached page
     is only the offline fallback (and "/" stands in for any miss);
   - the CDN data: network first with the last good snapshot kept — offline
     the map opens with the previous picture instead of nothing;
   - same-origin static assets: cache first — every name under _next/static
     is content-hashed, the rest (icons, styles, audio, the worker) change
     only with a deploy, and the shell cache is versioned with the file
     (VERSION below — bump it when such a file changes); the audio is
     precached on install and range requests are answered from the whole
     cached file.
   Map tiles are deliberately not cached: terabytes of temptation, and the
   browser's own HTTP cache already softens repeat visits. */

// Bump on every deploy that changes a file served cache first (the audio,
// the icons...): the cache names carry it, activate drops the old ones.
const VERSION = "v2";
const SHELL_CACHE = `shell-${VERSION}`;
const DATA_CACHE = `data-${VERSION}`;
const DATA_ORIGIN = "https://cdn-data.behindwheel.workers.dev";
const STATIC_PREFIXES = ["/_next/static/", "/icons/", "/styles/", "/audio/"];
const STATIC_FILES = ["/maplibre-gl-worker.mjs", "/apple-touch-icon.png", "/og.png"];
// The drive mode's voice prompts (public/audio/): precached on install,
// because a phrase fetched only on first use would be missing exactly when
// the drive starts offline. Keep in step with lib/alerts/sounds.ts.
const AUDIO_FILES = [
  "/audio/sound_over_speed.mp3",
  "/audio/stationary_camera.mp3",
  "/audio/mobile_camera.mp3",
  "/audio/medium_speed_camera.mp3",
  ...[40, 50, 60, 70, 80, 90, 100, 110, 120].map((limit) => `/audio/limit_${limit}.mp3`),
];

self.addEventListener("install", (event) => {
  // The shell's chunk names are content-hashed and discovered at runtime,
  // "/" is cached on the first visit below — only the audio is known up
  // front. cache.add fetches without a Range header and keeps whole 200
  // responses; one failed file must not block the worker from installing.
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => Promise.allSettled(AUDIO_FILES.map((file) => cache.add(file)))),
  );
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

// Only whole responses are cached: cache.put rejects a 206, and a media
// element's range request is answered with one.
function cachePut(cacheName, request, response) {
  if (response.status !== 200) {
    return Promise.resolve();
  }
  const copy = response.clone();
  return caches.open(cacheName).then((cache) => cache.put(request, copy));
}

// A media element asks for audio with `Range: bytes=...`, and Safari insists
// on a 206 answer; the cache holds the whole file, so the slice is cut here.
async function rangeResponse(request, cached) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (!match || (match[1] === "" && match[2] === "")) {
    return cached;
  }
  const buffer = await cached.arrayBuffer();
  const size = buffer.byteLength;
  let start;
  let end;
  if (match[1] === "") {
    start = Math.max(size - Number(match[2]), 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  return new Response(buffer.slice(start, end + 1), {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": cached.headers.get("Content-Type") ?? "audio/mpeg",
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${size}`,
    },
  });
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
      caches.match(request).then((cached) => {
        if (cached) {
          return request.headers.has("range") ? rangeResponse(request, cached) : cached;
        }
        return fetch(request).then((response) => {
          event.waitUntil(cachePut(SHELL_CACHE, request, response));
          return response;
        });
      }),
    );
  }
});
