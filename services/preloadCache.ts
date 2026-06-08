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
  /** Download speed in bytes/sec, 0 if not yet known */
  speed: number;
}

export type SongProgressCallback = (
  id: string,
  type: "audio" | "lyrics",
  status: "loading" | "done" | "error",
  fileProgress?: SongFileProgress,
  /** Parsed lyrics from cloud match (only when type="lyrics" && status="done") */
  lyricsData?: import("../types").LyricLine[],
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
    onFileProgress({ loaded: 0, total: 0, speed: 0 });
    const blob = await response.blob();
    cache.set(url, blob);
  try { const { saveAudioBlob } = await import("./audioCacheDB"); await saveAudioBlob(url, blob); } catch (e) { console.warn("[PreloadCache] IndexedDB save failed:", e); }
    onFileProgress({ loaded: blob.size, total: blob.size, speed: 0 });
    return;
  }

  // Stream with progress + speed tracking
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  let lastTime = performance.now();
  let lastLoaded = 0;
  let speed = 0;

  onFileProgress({ loaded: 0, total, speed: 0 });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;

    // Update speed every ~200ms to avoid jitter
    const now = performance.now();
    const elapsed = now - lastTime;
    if (elapsed >= 200) {
      speed = ((loaded - lastLoaded) / elapsed) * 1000; // bytes/sec
      lastTime = now;
      lastLoaded = loaded;
    }
    onFileProgress({ loaded, total, speed });
  }

  const blob = new Blob(chunks);
  cache.set(url, blob);
  try { const { saveAudioBlob } = await import("./audioCacheDB"); await saveAudioBlob(url, blob); } catch (e) { console.warn("[PreloadCache] IndexedDB save failed:", e); }
  onFileProgress({ loaded: total, total, speed: 0 });
}

export const preloadAll = async (
  songs: Song[],
  onProgress: (p: PreloadProgress) => void,
  onSongProgress: SongProgressCallback,
): Promise<void> => {
  const { audioResourceCache } = await import("./cache");
  const { searchAndMatchLyrics } = await import("./lyricsService");

  const totalSteps = songs.length * 2;
  let done = 0;
  const report = (title: string, type: "audio" | "lyrics") => {
    done++;
    onProgress({ done, total: totalSteps, current: title, currentType: type });
  };

  // Download 4 songs in parallel for much faster preload
  const PARALLEL = 4;

  // Process songs in batches
  for (let i = 0; i < songs.length; i += PARALLEL) {
    const batch = songs.slice(i, i + PARALLEL);
    await Promise.all(
      batch.map(async (song) => {
        // Audio
        onProgress({ done, total: totalSteps, current: song.title, currentType: "audio" });
        onSongProgress(song.id, "audio", "loading");
        try {
          const cached = audioResourceCache.get(song.fileUrl);
          if (cached) {
            onSongProgress(song.id, "audio", "done", { loaded: cached.size, total: cached.size, speed: 0 });
          } else {
            await fetchAudioWithProgress(
              song.fileUrl,
              audioResourceCache as { set: (k: string, b: Blob) => void },
              (p) => onSongProgress(song.id, "audio", "loading", p),
            );
            onSongProgress(song.id, "audio", "done");
          }
        } catch (e) {
          console.warn(`[PreloadCache] audio FAILED: ${song.title}`, e);
          onSongProgress(song.id, "audio", "error");
        }
        report(song.title, "audio");

        // Lyrics — skip cloud matching if local LRC was loaded at init
        onProgress({ done, total: totalSteps, current: song.title, currentType: "lyrics" });
        if ((song.lyrics?.length ?? 0) > 0 && song.needsLyricsMatch === false) {
          // Already have local lyrics from build-time download
          onSongProgress(song.id, "lyrics", "done", undefined, song.lyrics);
        } else {
          onSongProgress(song.id, "lyrics", "loading");
          try {
            const { searchAndMatchLyrics } = await import("../services/lyricsService");
            const matchResult = await searchAndMatchLyrics(song.title, song.artist);
            if (matchResult) {
              const { parseLyrics } = await import("../services/lyrics");
              const lines = matchResult.ttml ? parseLyrics(matchResult.ttml) : parseLyrics(matchResult.lrc ?? "", matchResult.tLrc, { yrcContent: matchResult.yrc });
              onSongProgress(song.id, "lyrics", "done", undefined, lines);
            } else {
              onSongProgress(song.id, "lyrics", "error");
            }
          } catch (e) {
            console.warn(`[PreloadCache] lyrics FAILED: ${song.title}`, e);
            onSongProgress(song.id, "lyrics", "error");
          }
        }
        report(song.title, "lyrics");
      }),
    );
  }

  onProgress({ done, total: totalSteps, current: "", currentType: "lyrics" });
  markPreloadDone();
};
