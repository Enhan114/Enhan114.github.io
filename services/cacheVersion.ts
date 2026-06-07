/**
 * Cache-busting version for browser HTTP cache.
 *
 * The browser's HTTP disk cache is independent of our IndexedDB/in-memory
 * caches. When the user deletes a song from our caches, we bump this
 * version so audio URLs change and the browser must fetch fresh.
 */

const KEY = "aura:cache-version";

export const getCacheVersion = (): number => {
  try {
    return parseInt(window.localStorage.getItem(KEY) || "0", 10) || 0;
  } catch {
    return 0;
  }
};

export const bumpCacheVersion = (): number => {
  const next = getCacheVersion() + 1;
  try {
    window.localStorage.setItem(KEY, String(next));
  } catch {}
  return next;
};

/** Append cache version to URL so browser treats it as a fresh resource */
export const getCacheBustedUrl = (url: string): string => {
  if (!url || url.startsWith("blob:")) return url;
  const v = getCacheVersion();
  if (v === 0) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_cv=${v}`;
};
