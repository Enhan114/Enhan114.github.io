/**
 * Service Worker — intercepts audio + TTML requests.
 * - Audio: uses Cache Storage (deletable) instead of browser HTTP cache.
 * - TTML: proxies through same-origin to bypass CORS restrictions.
 */

const AUDIO_CACHE = "aura-audio-http";

const isAudio = (url) => /\.(flac|mp3|ogg|wav|m4a|aac)(\?|$)/i.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // ── AMLL proxy: /api/amll/ncm/:id → amll-ttml-db.stevexmh.net/ncm/:id ──
  // This server returns both TTML and LRC; we just forward whatever it gives.
  const amllMatch = url.pathname.match(/^\/api\/amll\/ncm\/(\d+)$/);
  if (amllMatch) {
    const amllUrl = `https://amll-ttml-db.stevexmh.net/ncm/${amllMatch[1]}`;
    event.respondWith(
      fetch(amllUrl).then((res) => {
        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers: {
            "Content-Type": res.headers.get("Content-Type") || "application/octet-stream",
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
