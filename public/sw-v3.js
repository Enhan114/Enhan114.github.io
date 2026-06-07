/**
 * Service Worker — intercepts audio + TTML requests.
 * - Audio: uses Cache Storage (deletable) instead of browser HTTP cache.
 * - TTML: proxies through same-origin to bypass CORS restrictions.
 */

const AUDIO_CACHE = "aura-audio-http";

const isAudio = (url) => /\.(flac|mp3|ogg|wav|m4a|aac)(\?|$)/i.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // ── NetEase search proxy: /api/netease/search?q=... → music.163.com/api/search/pc ──
  if (url.pathname === "/api/netease/search") {
    const q = url.searchParams.get("q") || "";
    const limit = url.searchParams.get("limit") || "10";
    const offset = url.searchParams.get("offset") || "0";
    const target = `https://music.163.com/api/search/pc?s=${encodeURIComponent(q)}&type=1&limit=${limit}&offset=${offset}`;
    event.respondWith(
      fetch(target).then((res) => {
        return new Response(res.body, {
          status: res.status,
          headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
        });
      }).catch(() => new Response(null, { status: 502 }))
    );
    return;
  }

  // ── NetEase lyrics proxy: /api/netease/lyric?id=... → music.163.com/api/song/lyric ──
  if (url.pathname === "/api/netease/lyric") {
    const id = url.searchParams.get("id") || "";
    const target = `https://music.163.com/api/song/lyric?id=${encodeURIComponent(id)}`;
    event.respondWith(
      fetch(target).then((res) => {
        return new Response(res.body, {
          status: res.status,
          headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
        });
      }).catch(() => new Response(null, { status: 502 }))
    );
    return;
  }

  // ── NetEase playlist proxy: /api/netease/playlist?id=... → music.163.com/api/playlist/track/all ──
  if (url.pathname === "/api/netease/playlist") {
    const id = url.searchParams.get("id") || "";
    const limit = url.searchParams.get("limit") || "50";
    const offset = url.searchParams.get("offset") || "0";
    const target = `https://music.163.com/api/playlist/track/all?id=${encodeURIComponent(id)}&limit=${limit}&offset=${offset}`;
    event.respondWith(
      fetch(target).then((res) => {
        return new Response(res.body, {
          status: res.status,
          headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
        });
      }).catch(() => new Response(null, { status: 502 }))
    );
    return;
  }

  // ── NetEase song detail proxy: /api/netease/song?id=... → music.163.com/api/song/detail ──
  if (url.pathname === "/api/netease/song") {
    const id = url.searchParams.get("id") || "";
    const target = `https://music.163.com/api/song/detail?ids=${encodeURIComponent(id)}`;
    event.respondWith(
      fetch(target).then((res) => {
        return new Response(res.body, {
          status: res.status,
          headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
        });
      }).catch(() => new Response(null, { status: 502 }))
    );
    return;
  }

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
