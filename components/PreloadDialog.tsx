import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Song } from "../types";
import { deleteAudioBlob } from "../services/audioCacheDB";
import { audioResourceCache } from "../services/cache";
import { bumpCacheVersion } from "../services/cacheVersion";
import { deleteFromSWCache, deleteAllFromSWCache } from "../services/swCache";
import {
  isPreloadDone, markPreloadDone, getPreloadableSongs, preloadAll,
  type PreloadProgress,
} from "../services/preloadCache";

interface PreloadDialogProps {
  queue: Song[];
  onLyricsReady: (id: string, lyrics: import("../types").LyricLine[]) => void;
  forceShow?: boolean;
  onClose?: () => void;
}

// ── Helpers ────────────────────────────────

const formatSize = (bytes: number) => {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
};

const formatSpeed = (bytesPerSec: number) => {
  if (bytesPerSec <= 0) return "";
  if (bytesPerSec >= 1048576) return `${(bytesPerSec / 1048576).toFixed(1)} MB/s`;
  return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
};

// ── Cover thumbnail ────────────────────────

const Art: React.FC<{ src?: string }> = ({ src }) => {
  if (!src) return (
    <div className="h-9 w-9 shrink-0 rounded-lg border border-white/5 bg-gray-800 flex items-center justify-center">
      <span className="text-[9px] text-white/20">♪</span>
    </div>
  );
  return (
    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-white/5 bg-gray-800 shadow-sm">
      <img src={src} loading="lazy" className="h-full w-full object-cover" />
    </div>
  );
};

// ── Song item for list ─────────────────────

interface SongItemProps {
  song: Song;
  side: "cached" | "uncached";
  onAction: (id: string) => void;
  loading?: boolean;
  state?: { audio: string; lyrics: string; audioLoaded: number; audioTotal: number; audioSpeed: number };
  accent?: string;
}

const SongItem: React.FC<SongItemProps> = ({ song, side, onAction, loading, state, accent }) => {
  const pct = state && state.audioTotal > 0 ? Math.round((state.audioLoaded / state.audioTotal) * 100) : 0;
  const downloading = state?.audio === "loading";
  const audioSize = state && state.audioTotal > 0
    ? `${formatSize(state.audioLoaded)} / ${formatSize(state.audioTotal)}`
    : "";
  const speedStr = state && state.audioSpeed > 0 ? formatSpeed(state.audioSpeed) : "";

  return (
    <div className={`group flex items-center gap-2 p-1.5 rounded-xl transition-all duration-200 ${loading ? 'opacity-70' : ''}`}>
      {/* Cover */}
      <Art src={song.coverUrl} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold truncate leading-tight text-white/80">{song.title}</div>
        <div className="text-[11px] text-white/40 truncate">{song.artist}</div>
        {downloading && state.audioTotal > 0 && (
          <div className="mt-0.5">
            <div className="h-[2px] bg-white/10 rounded-full overflow-hidden w-full max-w-[140px]">
              <div className="h-full bg-white/50 rounded-full transition-all duration-200" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-[9px] text-white/25 mt-0.5">
              {pct}% · {audioSize}{speedStr ? ` · ${speedStr}` : ""}
            </div>
          </div>
        )}
      </div>

      {/* Action button */}
      <button
        onClick={() => onAction(song.id)}
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all
          ${side === "cached"
            ? "text-white/20 hover:text-red-400 hover:bg-red-400/10"
            : downloading
              ? "text-white/20 cursor-default"
              : "text-white/30 hover:text-white hover:bg-white/10"}`}
        title={side === "cached" ? "删除缓存" : "下载"}
      >
        {side === "cached" ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2L10 10M2 10L10 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        ) : downloading ? (
          <div className="w-3 h-3 border border-white/30 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2v6M3 6l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        )}
      </button>
    </div>
  );
};

// ── Main component ─────────────────────────

const PreloadDialog: React.FC<PreloadDialogProps> = ({ queue, onLyricsReady, forceShow, onClose }) => {
  const [show, setShow] = useState(false);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const loadingRef = React.useRef(false);
  const [progress, setProgress] = useState<PreloadProgress | null>(null);
  const [songState, setSongState] = useState<Map<string, {
    audio: string; lyrics: string;
    audioLoaded: number; audioTotal: number; audioSpeed: number;
  }>>(new Map());
  const [checkingCache, setCheckingCache] = useState(true);

  // Split songs into cached / uncached
  // KEY FIX: audio cache and lyrics cache are independent.
  // A song is "cached" once its audio is cached — lyrics are a bonus.
  const allSongs = getPreloadableSongs(queue);
  const cachedIds = new Set<string>();
  const uncachedIds = new Set<string>();

  for (const s of allSongs) {
    const st = songState.get(s.id);
    const audioDone = st?.audio === "done";
    if (audioDone) cachedIds.add(s.id);
    else uncachedIds.add(s.id);
  }

  // Verify actual cache state from IndexedDB in a single DB connection.
  useEffect(() => {
    if (allSongs.length === 0) { setCheckingCache(false); return; }
    setCheckingCache(true);
    const urls = allSongs.map(s => s.fileUrl);
    import("../services/audioCacheDB").then(({ batchHasAudioBlobs }) =>
      batchHasAudioBlobs(urls).then((found) => {
        // KEY FIX: restore audio cache state regardless of lyrics status
        // Previously required needsLyricsMatch===false, which caused cached
        // audio to be "lost" on refresh if lyrics weren't also cached.
        allSongs.forEach((s) => {
          if (found.has(s.fileUrl)) {
            setSongState(prev => {
              if (prev.get(s.id)?.audio === "done") return prev;
              const n = new Map(prev);
              const cur = n.get(s.id) || { audio: "", lyrics: "", audioLoaded: 0, audioTotal: 0, audioSpeed: 0 };
              n.set(s.id, { ...cur, audio: "done" });
              return n;
            });
          }
        });
      }).catch(() => {})
    ).catch(() => {}).finally(() => setCheckingCache(false));
  }, [queue.length]);

  // Open logic
  useEffect(() => {
    if (allSongs.length > 0 && (!isPreloadDone() || forceShow)) {
      setShow(true);
      requestAnimationFrame(() => setVisible(true));
    }
  }, [queue.length, forceShow]);

  useEffect(() => {
    if (!forceShow) {
      setVisible(false);
      const t = setTimeout(() => setShow(false), 300);
      return () => clearTimeout(t);
    }
  }, [forceShow]);

  const close = useCallback(() => {
    markPreloadDone();
    setVisible(false);
    setTimeout(() => {
      setShow(false);
      if (forceShow && onClose) onClose();
    }, 300);
  }, [forceShow, onClose]);

  // ── Actions ─────────────────────────────────

  const downloadBatch = async (ids: string[]) => {
    setLoading(true);
    loadingRef.current = true;
    const toLoad = allSongs.filter(s => ids.includes(s.id));
    await preloadAll(
      toLoad,
      (p) => { setProgress({ ...p }); },
      (id, type, status, fp, lyricsData) => {
        setSongState(prev => {
          const n = new Map(prev);
          const cur = n.get(id) || { audio: "", lyrics: "", audioLoaded: 0, audioTotal: 0, audioSpeed: 0 };
          const entry = { ...cur, [type]: status };
          if (fp) { entry.audioLoaded = fp.loaded; entry.audioTotal = fp.total; entry.audioSpeed = fp.speed; }
          n.set(id, entry);
          return n;
        });
        if (lyricsData && lyricsData.length > 0) {
          onLyricsReady(id, lyricsData);
        }
      },
    );
    setLoading(false);
    loadingRef.current = false;
  };

  const deleteCached = (id: string) => {
    setSongState(prev => {
      const n = new Map(prev);
      n.delete(id);
      return n;
    });
    const song = allSongs.find(s => s.id === id);
    if (song) {
      onLyricsReady(id, []); // reset lyrics flag
      audioResourceCache.delete(song.fileUrl); // in-memory LRU
      deleteAudioBlob(song.fileUrl).catch((e) => {
        console.warn(`[CacheDB] delete failed for ${song.title}:`, e);
      });
      deleteFromSWCache(song.fileUrl); // Service Worker Cache Storage
      bumpCacheVersion(); // bust browser HTTP cache too
    }
  };

  const deleteAllCached = async () => {
    // Collect all songs to delete first (before state changes cause re-render)
    const toDelete = allSongs.filter(s => cachedIds.has(s.id));
    // Update state once — remove all
    setSongState(prev => {
      const n = new Map(prev);
      for (const id of cachedIds) n.delete(id);
      return n;
    });
    // Delete from all backends in parallel
    for (const song of toDelete) {
      onLyricsReady(song.id, []);
      audioResourceCache.delete(song.fileUrl);
      deleteAudioBlob(song.fileUrl).catch((e) => {
        console.warn(`[CacheDB] delete failed for ${song.title}:`, e);
      });
    }
    if (toDelete.length > 0) {
      deleteAllFromSWCache(); // Service Worker Cache Storage
      bumpCacheVersion(); // bust browser HTTP cache too
    }
  };

  if (!show) return null;

  const cachedList = allSongs.filter(s => cachedIds.has(s.id));
  const uncachedList = allSongs.filter(s => uncachedIds.has(s.id));

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center px-4 select-none font-sans">
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-md transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={close}
      />
      <div
        className={`relative w-full max-w-2xl max-h-[80vh] flex flex-col bg-black/50 backdrop-blur-3xl saturate-150 border border-white/10 rounded-[28px] shadow-[0_30px_80px_rgba(0,0,0,0.5)] text-white transition-all duration-300 ${visible ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4"}`}
      >
        {/* Header */}
        <div className="shrink-0 p-5 pb-2">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-lg font-bold tracking-tight">缓存管理</h2>
              <p className="text-white/40 text-xs mt-0.5">
                {loading ? "下载中..." : "左侧已缓存 · 右侧待下载 · 实时同步"}
              </p>
            </div>
            <button onClick={close}
              className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1L11 11M1 11L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          {loading && progress && (
            <div className="mb-1">
              <div className="flex items-center justify-between text-[10px] mb-0.5">
                <span className="text-white/40">{progress.currentType === "audio" ? "🎵" : "📝"} {progress.current}</span>
                <span className="text-white/25">{progress.done}/{progress.total}</span>
              </div>
              <div className="h-[2px] bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-white/50 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Two-column layout */}
        <div className="flex-1 flex min-h-0 gap-1 px-3 pb-3">
          {/* Left: Cached */}
          <div className="flex-1 flex flex-col min-w-0 rounded-2xl bg-white/[0.03] border border-white/5 overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/5">
              <span className="text-xs font-semibold text-white/50">
                已缓存 ({checkingCache ? "..." : cachedList.length})
              </span>
              {cachedList.length > 0 && (
                <button onClick={deleteAllCached} disabled={loading}
                  className="text-[10px] text-red-400/50 hover:text-red-400 transition-colors">
                  全部删除
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto playlist-scrollbar px-2 py-1">
              {cachedList.length === 0 ? (
                <div className="flex items-center justify-center h-full text-[11px] text-white/15 italic">
                  {checkingCache ? "检查中..." : "暂无缓存"}
                </div>
              ) : (
                cachedList.map(s => (
                  <SongItem key={s.id} song={s} side="cached"
                    onAction={deleteCached} loading={loading} state={songState.get(s.id)} />
                ))
              )}
            </div>
          </div>

          {/* Right: Uncached */}
          <div className="flex-1 flex flex-col min-w-0 rounded-2xl bg-white/[0.03] border border-white/5 overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/5">
              <span className="text-xs font-semibold text-white/50">未缓存 ({uncachedList.length})</span>
              {uncachedList.length > 0 && (
                <button onClick={() => downloadBatch(uncachedList.map(s => s.id))} disabled={loading}
                  className={`text-[10px] transition-colors ${loading ? 'text-white/20' : 'text-white/40 hover:text-white'}`}>
                  {loading ? "下载中..." : "全部下载"}
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto playlist-scrollbar px-2 py-1">
              {uncachedList.length === 0 ? (
                <div className="flex items-center justify-center h-full text-[11px] text-white/15 italic">
                  全部已缓存 ✅
                </div>
              ) : (
                uncachedList.map(s => (
                  <SongItem key={s.id} song={s} side="uncached"
                    onAction={(id) => downloadBatch([id])} loading={loading} state={songState.get(s.id)} />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 p-4 pt-1 flex items-center justify-center">
          <button onClick={close}
            className="py-2 px-6 text-xs text-white/25 hover:text-white/40 transition-colors">
            关闭
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .playlist-scrollbar { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent; }
        .playlist-scrollbar::-webkit-scrollbar { width: 3px; }
        .playlist-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 999px; }
      `}</style>
    </div>,
    document.body,
  );
};

export default PreloadDialog;
