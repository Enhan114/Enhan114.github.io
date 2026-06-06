/**
 * Preloading service for audio + lyrics cache.
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

/** Return songs that may benefit from preloading */
export const getPreloadableSongs = (queue: Song[]): Song[] => {
  return queue.filter((s) =>
    s.fileUrl && !s.fileUrl.startsWith("blob:") && s.source !== "local",
  );
};

export interface PreloadProgress {
  done: number;
  total: number;
  current: string;
  currentType: "audio" | "lyrics";
}

export type SongProgressCallback = (id: string, type: "audio" | "lyrics", status: "loading" | "done" | "error") => void;

export const preloadAll = async (
  songs: Song[],
  onProgress: (p: PreloadProgress) => void,
  onSongProgress: SongProgressCallback,
): Promise<void> => {
  const { audioResourceCache } = await import("./cache");
  const { searchAndMatchLyrics } = await import("./lyricsService");

  let done = 0;
  const totalSteps = songs.length * 2; // audio + lyrics per song

  for (const song of songs) {
    // Step 1: Preload audio
    onProgress({ done, total: totalSteps, current: song.title, currentType: "audio" });
    onSongProgress(song.id, "audio", "loading");
    try {
      const cachedAudio = audioResourceCache.get(song.fileUrl);
      if (!cachedAudio) {
        const response = await fetch(song.fileUrl);
        if (response.ok) {
          const blob = await response.blob();
          audioResourceCache.set(song.fileUrl, blob);
        }
      }
      onSongProgress(song.id, "audio", "done");
    } catch {
      onSongProgress(song.id, "audio", "error");
    }
    done++;

    // Step 2: Preload lyrics
    onProgress({ done, total: totalSteps, current: song.title, currentType: "lyrics" });
    onSongProgress(song.id, "lyrics", "loading");
    try {
      await searchAndMatchLyrics(song.title, song.artist);
      onSongProgress(song.id, "lyrics", "done");
    } catch {
      onSongProgress(song.id, "lyrics", "error");
    }
    done++;
  }

  onProgress({ done, total: totalSteps, current: "", currentType: "lyrics" });
  markPreloadDone();
};
