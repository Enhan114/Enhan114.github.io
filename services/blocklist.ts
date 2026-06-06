/**
 * Song blocklist — persisted in localStorage.
 *
 * Blocked songs stay visible in the playlist but are greyed out and
 * unplayable.  Unblocking adds them back to the end of the queue.
 */

const STORAGE_KEY = "aura:blocked-songs";

const load = (): Set<string> => {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const ids: string[] = JSON.parse(raw);
    return new Set(ids.filter((id) => typeof id === "string"));
  } catch {
    return new Set();
  }
};

const save = (set: Set<string>) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch { /* quota */ }
};

let _cache: Set<string> | null = null;
const cache = (): Set<string> => {
  if (!_cache) _cache = load();
  return _cache;
};

export const isBlocked = (id: string): boolean => cache().has(id);

export const blockSong = (id: string) => {
  cache().add(id);
  save(cache());
};

export const unblockSong = (id: string) => {
  cache().delete(id);
  save(cache());
};

export const getBlockedIds = (): string[] => [...cache()];

/** Bulk unblock — returns the unblocked IDs so caller can re-add them */
export const unblockSongs = (ids: string[]): string[] => {
  const unblocked: string[] = [];
  for (const id of ids) {
    if (cache().has(id)) {
      cache().delete(id);
      unblocked.push(id);
    }
  }
  if (unblocked.length > 0) save(cache());
  return unblocked;
};

/** Invalidate cache (call after external changes) */
export const refreshBlocklist = () => {
  _cache = null;
};
