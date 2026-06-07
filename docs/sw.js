/**
 * Service Worker — intercepts audio requests and uses Cache Storage
 * instead of the browser's HTTP disk cache. This gives us full control
 * over caching: we can delete individual entries via postMessage.
 */

const CACHE = "aura-audio-http";

// Check if the request is for an audio file
const isAudio = (url) => /\.(flac|mp3|ogg|wav|m4a|aac)(\?|$)/i.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!isAudio(url)) return; // only intercept audio

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(event.request).then((cached) => {
        if (cached) {
          // Found in Cache Storage — serve from there
          return cached;
        }
        // Not in our cache — fetch from network
        // Use cache: "reload" to bypass browser HTTP cache but still follow
        // standard HTTP caching semantics for Cache Storage.
        return fetch(event.request, { cache: "reload" }).then((response) => {
          // Only cache full responses (200). Range requests (206) are NOT
          // cacheable in Cache Storage and will throw if we try.
          if (response.status === 200) {
            try {
              cache.put(event.request, response.clone());
            } catch {
              // ignore cache-storage errors
            }
          }
          return response;
        }).catch(() => {
          // Network failed — fall through (browser will show error)
          return new Response(null, { status: 503 });
        });
      })
    )
  );
});

// Main thread can message us to delete specific URLs
self.addEventListener("message", (event) => {
  const { type, url } = event.data || {};
  if (type === "DELETE_AUDIO_CACHE") {
    caches.open(CACHE).then((cache) => cache.delete(url));
  }
  if (type === "DELETE_ALL_AUDIO_CACHE") {
    caches.delete(CACHE);
  }
});
