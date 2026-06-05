const MOBILE_BREAKPOINT = 1024;

const isMobileViewport = () => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
};

const createSizeLimitedLRU = (limitBytes: number, revokeBlobUrls = false) => {
  const map = new Map<string, { blob: Blob; size: number; url?: string }>();
  let totalSize = 0;

  const evictIfNeeded = () => {
    while (totalSize > limitBytes && map.size > 0) {
      const oldestKey = map.keys().next().value;
      if (!oldestKey) break;
      const entry = map.get(oldestKey);
      map.delete(oldestKey);
      if (entry) {
        totalSize -= entry.size;
        if (revokeBlobUrls && entry.url) {
          URL.revokeObjectURL(entry.url);
        }
      }
    }
  };

  return {
    get(key: string): Blob | null {
      const entry = map.get(key);
      if (!entry) return null;
      map.delete(key);
      map.set(key, entry);
      return entry.blob;
    },
    /** Returns { blob, url } — the url is stable and reused across lookups. */
    getWithUrl(key: string): { blob: Blob; url: string } | null {
      const entry = map.get(key);
      if (!entry) return null;
      map.delete(key);
      if (!entry.url) {
        entry.url = URL.createObjectURL(entry.blob);
      }
      map.set(key, entry);
      return { blob: entry.blob, url: entry.url };
    },
    set(key: string, blob: Blob) {
      const size = blob.size || 0;
      if (size <= 0 || size > limitBytes) {
        return;
      }
      // Evict previous entry for this key (and revoke its URL)
      if (map.has(key)) {
        const existing = map.get(key);
        if (existing) {
          totalSize -= existing.size;
          if (revokeBlobUrls && existing.url) {
            URL.revokeObjectURL(existing.url);
          }
        }
        map.delete(key);
      }
      map.set(key, { blob, size });
      totalSize += size;
      evictIfNeeded();
    },
    delete(key: string) {
      const entry = map.get(key);
      if (!entry) return;
      totalSize -= entry.size;
      if (revokeBlobUrls && entry.url) {
        URL.revokeObjectURL(entry.url);
      }
      map.delete(key);
    },
    clear() {
      if (revokeBlobUrls) {
        for (const entry of map.values()) {
          if (entry.url) URL.revokeObjectURL(entry.url);
        }
      }
      map.clear();
      totalSize = 0;
    },
    getLimit() {
      return limitBytes;
    },
  };
};

const IMAGE_CACHE_LIMIT = isMobileViewport() ? 50 * 1024 * 1024 : 100 * 1024 * 1024;
const AUDIO_CACHE_LIMIT = isMobileViewport() ? 100 * 1024 * 1024 : 200 * 1024 * 1024;
const RAW_IMAGE_CACHE_LIMIT = 50 * 1024 * 1024;

const rawImageCache = createSizeLimitedLRU(RAW_IMAGE_CACHE_LIMIT);

// --- Concurrent-request deduplication ---
// Without this, the same cover URL can trigger 6-8 identical fetch()
// calls before the first response populates the cache.  We keep a
// Map of in-flight promises so every concurrent caller for the same
// URL shares a single network request — like a promise-based lock
// that resolves to the same Blob.
const rawImageInFlight = new Map<string, Promise<Blob>>();
const lyricsInFlight = new Map<string, Promise<string>>();

export const imageResourceCache = createSizeLimitedLRU(IMAGE_CACHE_LIMIT, true);
export const audioResourceCache = createSizeLimitedLRU(AUDIO_CACHE_LIMIT);

export const fetchImageBlobWithCache = async (url: string): Promise<Blob> => {
  // Cache hit — no in-flight tracking needed
  const cached = rawImageCache.get(url);
  if (cached) return cached;

  // Deduplicate concurrent requests
  const inFlight = rawImageInFlight.get(url);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      const blob = await response.blob();
      rawImageCache.set(url, blob);
      return blob;
    } finally {
      rawImageInFlight.delete(url);
    }
  })();

  rawImageInFlight.set(url, promise);
  return promise;
};

/**
 * Fetch a lyrics file with concurrent-request deduplication.
 */
export const fetchLyricsWithCache = async (url: string): Promise<string> => {
  const inFlight = lyricsInFlight.get(url);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch lyrics: ${response.status}`);
      }
      const text = await response.text();
      return text;
    } finally {
      lyricsInFlight.delete(url);
    }
  })();

  lyricsInFlight.set(url, promise);
  return promise;
};

export const loadImageElementWithCache = async (
  url: string,
): Promise<HTMLImageElement> => {
  const blob = await fetchImageBlobWithCache(url);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const objectUrl = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = (error) => {
      URL.revokeObjectURL(objectUrl);
      reject(error);
    };
    img.src = objectUrl;
  });
};
