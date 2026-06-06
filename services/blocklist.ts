/**
 * Song blocklist — persisted in localStorage.
 *
 * Stores blocked song IDs along with minimal metadata (title, artist)
 * so the blocklist UI works even after the song is removed from the
 * queue.
 */

const STORAGE_KEY = "aura:blocked-songs";

export interface BlockedSongInfo {
  id: string;
  title: string;
  artist: string;
}

const load = (): BlockedSongInfo[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is BlockedSongInfo =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as any).id === "string",
    );
  } catch {
    return [];
  }
};

const save = (list: BlockedSongInfo[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch { /* quota */ }
};

let _cache: BlockedSongInfo[] | null = null;
const cache = (): BlockedSongInfo[] => {
  if (!_cache) _cache = load();
  return _cache;
};

export const isBlocked = (id: string): boolean =>
  cache().some((s) => s.id === id);

export const blockSong = (id: string, title = "", artist = "") => {
  const list = cache();
  if (!list.some((s) => s.id === id)) {
    list.push({ id, title, artist });
    save(list);
  }
};

export const unblockSong = (id: string) => {
  const idx = cache().findIndex((s) => s.id === id);
  if (idx >= 0) {
    cache().splice(idx, 1);
    save(cache());
  }
};

export const getBlockedSongs = (): BlockedSongInfo[] => [...cache()];

export const getBlockedIds = (): string[] => cache().map((s) => s.id);

/** Bulk unblock — returns the unblocked IDs so caller can re-add them */
export const unblockSongs = (ids: string[]): string[] => {
  const idSet = new Set(ids);
  const unblocked: string[] = [];
  const remaining = cache().filter((s) => {
    if (idSet.has(s.id)) {
      unblocked.push(s.id);
      return false;
    }
    return true;
  });
  if (unblocked.length > 0) {
    _cache = remaining;
    save(remaining);
  }
  return unblocked;
};

/** Invalidate cache (call after external changes) */
export const refreshBlocklist = () => {
  _cache = null;
};
