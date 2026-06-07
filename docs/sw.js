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
        // Not in our cache — fetch from network, bypass browser HTTP cache
        return fetch(event.request, { cache: "no-store" }).then((response) => {
          if (response.ok) {
            // Store a clone in Cache Storage for future use
            cache.put(event.request, response.clone());
          }
          return response;
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
