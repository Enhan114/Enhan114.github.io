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

export const getPreloadableSongs = (queue: Song[]): Song[] =>
  queue.filter((s) => s.fileUrl && !s.fileUrl.startsWith("blob:") && s.source !== "local");

export interface PreloadProgress {
  done: number;
  total: number;
  current: string;
  currentType: "audio" | "lyrics";
}

export interface SongFileProgress {
  /** Bytes downloaded so far (audio only) */
  loaded: number;
  /** Total bytes (audio only), 0 if unknown */
  total: number;
}

export type SongProgressCallback = (
  id: string,
  type: "audio" | "lyrics",
  status: "loading" | "done" | "error",
  fileProgress?: SongFileProgress,
) => void;

/**
 * Fetch and cache an audio file, reporting download progress.
 */
async function fetchAudioWithProgress(
  url: string,
  cache: { set: (key: string, blob: Blob) => void },
  onFileProgress: (p: SongFileProgress) => void,
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const total = parseInt(response.headers.get("content-length") || "0", 10);
  const reader = response.body?.getReader();
  if (!reader || total <= 0) {
    // Fallback: no streaming support or unknown size
    onFileProgress({ loaded: 0, total });
    const blob = await response.blob();
    cache.set(url, blob);
    onFileProgress({ loaded: blob.size, total: blob.size });
    return;
  }

  // Stream with progress
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  onFileProgress({ loaded: 0, total });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onFileProgress({ loaded, total });
  }

  const blob = new Blob(chunks);
  cache.set(url, blob);
  onFileProgress({ loaded, total });
}

export const preloadAll = async (
  songs: Song[],
  onProgress: (p: PreloadProgress) => void,
  onSongProgress: SongProgressCallback,
): Promise<void> => {
  const { audioResourceCache } = await import("./cache");
  const { searchAndMatchLyrics } = await import("./lyricsService");

  let done = 0;
  const totalSteps = songs.length * 2;

  for (const song of songs) {
    // Step 1: Audio
    onProgress({ done, total: totalSteps, current: song.title, currentType: "audio" });
    onSongProgress(song.id, "audio", "loading");
    try {
      const cached = audioResourceCache.get(song.fileUrl);
      if (cached) {
        onSongProgress(song.id, "audio", "done", { loaded: cached.size, total: cached.size });
      } else {
        await fetchAudioWithProgress(
          song.fileUrl,
          audioResourceCache as { set: (k: string, b: Blob) => void },
          (p) => onSongProgress(song.id, "audio", "loading", p),
        );
        onSongProgress(song.id, "audio", "done");
      }
    } catch {
      onSongProgress(song.id, "audio", "error");
    }
    done++;

    // Step 2: Lyrics
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
