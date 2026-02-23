const STATIC_CACHE = "free-ifter-static-v2";
const RUNTIME_CACHE = "free-ifter-runtime-v2";
const DATA_CACHE = "free-ifter-data-v2";
const DATA_CACHE_TTL_MS = 3 * 60 * 1000;

const CORE_ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/manifest.json",
  "/icons/icon.svg",
  "/icons/icon-maskable.svg",
  "/sw.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, RUNTIME_CACHE, DATA_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const networkResponse = await fetch(request);
  if (networkResponse && networkResponse.ok) {
    cache.put(request, networkResponse.clone());
  }
  return networkResponse;
}

async function staleWhileRevalidateData(request) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    try {
      const payload = await cached.clone().json();
      const savedAt = Number(payload?.savedAt || 0);
      if (Date.now() - savedAt <= DATA_CACHE_TTL_MS) {
        fetch(request)
          .then((res) => {
            if (res && res.ok) cache.put(request, res.clone());
          })
          .catch(() => null);
        return cached;
      }
    } catch {
      // continue to network path
    }
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
  } catch {
    // fallback below
  }

  if (cached) return cached;
  return new Response(JSON.stringify({ spots: [], votes: [], savedAt: 0 }), {
    headers: { "Content-Type": "application/json" },
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (url.pathname === "/__spots_cache__") {
    event.respondWith(staleWhileRevalidateData(request));
    return;
  }

  const isStaticAsset =
    sameOrigin &&
    (url.pathname === "/" ||
      url.pathname.endsWith(".html") ||
      url.pathname.endsWith(".css") ||
      url.pathname.endsWith(".js") ||
      url.pathname.endsWith(".svg") ||
      url.pathname.endsWith(".png") ||
      url.pathname.endsWith(".json"));

  if (isStaticAsset) {
    event.respondWith(
      cacheFirst(request, STATIC_CACHE).catch(async () => {
        const cache = await caches.open(STATIC_CACHE);
        return cache.match("/index.html");
      })
    );
    return;
  }

  if (url.hostname.includes("openstreetmap.org") || url.hostname.includes("gstatic.com")) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
  }
});
