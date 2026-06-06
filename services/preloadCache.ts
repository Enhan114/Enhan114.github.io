/**
 * Cloud lyrics preloading service.
 *
 * After the first visit dialog, the user can choose to preload cloud
 * lyrics (TTML/YRC) for songs that don't have them cached yet.
 */

import type { Song } from "../types";

const PRELOAD_DONE_KEY = "aura:preload-done";

export const isPreloadDone = (): boolean => {
  try { return !!window.localStorage.getItem(PRELOAD_DONE_KEY); }
  catch { return false; }
};

export const markPreloadDone = () => {
  try { window.localStorage.setItem(PRELOAD_DONE_KEY, "1"); }
  catch {}
};

/** Return songs that still need cloud lyrics matching */
export const getUncachedSongs = (queue: Song[]): Song[] => {
  return queue.filter((s) => s.needsLyricsMatch !== false && !s.isNetease);
};

import type { MatchedLyricsResult } from "./lyricsService";

export interface PreloadProgress {
  done: number;
  total: number;
  current: string;
}

export const preloadLyrics = async (
  songs: Song[],
  onProgress: (p: PreloadProgress) => void,
  onSongDone: (id: string, result: MatchedLyricsResult | null) => void,
): Promise<void> => {
  // Dynamic import to avoid circular deps at module load time
  const { searchAndMatchLyrics } = await import("./lyricsService");

  let done = 0;
  for (const song of songs) {
    onProgress({ done, total: songs.length, current: song.title });
    try {
      const result = await searchAndMatchLyrics(song.title, song.artist);
      onSongDone(song.id, result);
    } catch {
      onSongDone(song.id, null);
    }
    done++;
  }
  onProgress({ done, total: songs.length, current: "" });
  markPreloadDone();
};
