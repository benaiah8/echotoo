// public/sw.js
// Echotoo PWA: Service worker for caching static assets and reducing bandwidth
const APP_VERSION = "v13"; // Update this version number when deploying new features
const STATIC_CACHE = `static-${APP_VERSION}`;
const IMAGE_CACHE = `images-${APP_VERSION}`;
const API_CACHE = `api-${APP_VERSION}`;

// Static assets to cache immediately (adjust to your files)
const STATIC_ASSETS = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

// Cache configuration
const CACHE_CONFIG = {
  STATIC_MAX_AGE: 30 * 24 * 60 * 60 * 1000, // 30 days
  IMAGE_MAX_AGE: 7 * 24 * 60 * 60 * 1000, // 7 days
  API_MAX_AGE: 5 * 60 * 1000, // 5 minutes
};

// --- Helpers ---------------------------------------------------------
const isHttp = (url) => /^https?:/i.test(url);

// Simple cache first strategy
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const res = await fetch(request);
  const sameOrigin = new URL(request.url).origin === self.location.origin;

  if (
    res &&
    res.ok &&
    res.type === "basic" &&
    sameOrigin &&
    isHttp(request.url)
  ) {
    cache.put(request, res.clone());
  }
  return res;
}

// Simple network first strategy
async function networkFirst(request, cacheName = STATIC_CACHE) {
  try {
    const res = await fetch(request);
    const sameOrigin = new URL(request.url).origin === self.location.origin;

    if (
      res &&
      res.ok &&
      res.type === "basic" &&
      sameOrigin &&
      isHttp(request.url)
    ) {
      const cache = await caches.open(cacheName);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    // Try to get from cache as fallback
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    throw new Error("Network failed and no cache.");
  }
}

// Simple stale while revalidate strategy
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Return cached version immediately if available
  if (cached) {
    // Fetch fresh data in background (don't await)
    fetch(request)
      .then((freshRes) => {
        if (freshRes && freshRes.ok) {
          cache.put(request, freshRes.clone());
        }
      })
      .catch(() => {
        // Ignore background fetch errors
      });

    return cached;
  }

  // No cache, fetch normally
  return networkFirst(request, cacheName);
}

// --- Lifecycle -------------------------------------------------------
self.addEventListener("install", (event) => {
  console.log(`[SW] Installing version ${APP_VERSION}`);
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log(`[SW] Activating version ${APP_VERSION}`);
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        const validCaches = [STATIC_CACHE, IMAGE_CACHE, API_CACHE];

        return Promise.all(
          cacheNames.map((cacheName) => {
            // Keep only current version caches, delete old versions
            if (!validCaches.includes(cacheName)) {
              console.log(`[SW] Deleting old cache: ${cacheName}`);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        // Notify all clients about the update
        return self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: "SW_UPDATE",
              version: APP_VERSION,
            });
          });
        });
      })
  );
  self.clients.claim();
});

// --- Fetch -----------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET http(s)
  if (request.method !== "GET" || !isHttp(request.url)) return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    // Not a normal URL (blob:, data:, chrome-extension:, etc.)
    return;
  }

  // Never handle development assets or critical files
  const isDevFile =
    url.pathname.startsWith("/@vite/") ||
    url.pathname.startsWith("/src/") ||
    url.pathname.includes("?t=") || // Vite timestamped files
    url.pathname.endsWith(".tsx") ||
    url.pathname.endsWith(".ts") ||
    url.pathname.endsWith(".jsx") ||
    url.pathname.endsWith(".js") ||
    url.pathname === "/vite.svg"; // Vite logo

  // Check for Supabase and Auth patterns
  const isSupabaseHost = url.hostname.endsWith("supabase.co");
  const isAuthPath = url.pathname.startsWith("/auth/v1/") || url.pathname.includes("/auth/");
  const hasAuthParams =
    url.search.includes("access_token") ||
    url.search.includes("code") ||
    url.search.includes("error") ||
    url.search.includes("error_code") ||
    url.search.includes("error_description") ||
    url.hash.includes("access_token") ||
    url.hash.includes("code") ||
    url.hash.includes("error");
  const isAuthCallback = url.pathname.startsWith("/auth/callback") || url.pathname === "/auth/callback";
  const isOAuthCallback = url.search.includes("code=") || url.hash.includes("code=") || url.search.includes("state=");

  // Never handle development assets, auth-related requests, or Supabase requests
  if (
    isDevFile ||
    isAuthPath ||
    hasAuthParams ||
    isAuthCallback ||
    isOAuthCallback ||
    isSupabaseHost
  ) {
    return; // Let browser handle these requests normally
  }

  // Static assets → cache first
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Images → cache first (but exclude vite.svg which is handled above)
  if (/\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // Everything else → network first
  event.respondWith(networkFirst(request, API_CACHE));
});
