/**
 * Service Worker — intercepts audio + TTML requests.
 * - Audio: uses Cache Storage (deletable) instead of browser HTTP cache.
 * - TTML: proxies through same-origin to bypass CORS restrictions.
 */

const AUDIO_CACHE = "aura-audio-http";

const isAudio = (url) => /\.(flac|mp3|ogg|wav|m4a|aac)(\?|$)/i.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // ── TTML proxy: /api/ttml/:id → amll-ttml-db.stevexmh.net/ncm/:id ──
  const ttmlMatch = url.pathname.match(/^\/api\/ttml\/(\d+)$/);
  if (ttmlMatch) {
    const ttmlUrl = `https://amll-ttml-db.stevexmh.net/ncm/${ttmlMatch[1]}`;
    event.respondWith(
      fetch(ttmlUrl).then((res) => {
        // Re-wrap so we can add CORS headers — the SW can do this
        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }).catch(() => new Response(null, { status: 502 }))
    );
    return;
  }

  // ── Audio cache ──
  if (!isAudio(url)) return;

  event.respondWith(
    caches.open(AUDIO_CACHE).then((cache) =>
      cache.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request, { cache: "reload" }).then((response) => {
          if (response.status === 200) {
            try { cache.put(event.request, response.clone()); } catch {}
          }
          return response;
        }).catch(() => new Response(null, { status: 503 }));
      })
    )
  );
});

self.addEventListener("message", (event) => {
  const { type, url } = event.data || {};
  if (type === "DELETE_AUDIO_CACHE") {
    caches.open(AUDIO_CACHE).then((cache) => cache.delete(url));
  }
  if (type === "DELETE_ALL_AUDIO_CACHE") {
    caches.delete(AUDIO_CACHE);
  }
});
