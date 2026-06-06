import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Song } from "../types";
import {
  isPreloadDone, markPreloadDone, getPreloadableSongs, preloadAll,
  type PreloadProgress,
} from "../services/preloadCache";

interface PreloadDialogProps {
  queue: Song[];
  onLyricsReady: (id: string, lyrics: import("../types").LyricLine[]) => void;
  /** Force the dialog to open even if preload has been done before */
  forceShow?: boolean;
  onClose?: () => void;
}

// ── Cover thumbnail (matching PlaylistPanel Art exactly) ──
const Art: React.FC<{ src?: string; alt: string }> = ({ src, alt }) => {
  if (!src) {
    return (
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-white/5 bg-gray-800 shadow-sm flex items-center justify-center">
        <span className="text-[10px] text-white/20">♪</span>
      </div>
    );
  }
  return (
    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-white/5 bg-gray-800 shadow-sm">
      <img src={src} alt={alt} loading="lazy" decoding="async"
        className="h-full w-full object-cover transition-opacity duration-500" />
    </div>
  );
};

// ── Main component ──
const PreloadDialog: React.FC<PreloadDialogProps> = ({ queue, onLyricsReady, forceShow, onClose }) => {
  const [show, setShow] = useState(false);
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<PreloadProgress | null>(null);
  const [songState, setSongState] = useState<Map<string, { audio: string; lyrics: string }>>(new Map());

  const songs = getPreloadableSongs(queue);

  // Open on first visit, or when forced from settings
  useEffect(() => {
    if (songs.length > 0 && (!isPreloadDone() || forceShow)) {
      setShow(true);
      setSelected(new Set(songs.map(s => s.id)));
      requestAnimationFrame(() => setVisible(true));
    }
  }, [queue.length, forceShow]);

  // Reset when forceShow changes to false
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

  const toggle = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAll = () => setSelected(new Set(songs.map(s => s.id)));
  const selectNone = () => setSelected(new Set());

  const startPreload = async () => {
    setLoading(true);
    const toLoad = songs.filter(s => selected.has(s.id));
    await preloadAll(
      toLoad,
      (p) => setProgress({ ...p }),
      (id, type, status) => {
        setSongState(prev => {
          const n = new Map(prev);
          const cur = n.get(id) || { audio: "", lyrics: "" };
          n.set(id, { ...cur, [type]: status });
          return n;
        });
        if (type === "lyrics" && status === "done") {
          // The lyrics were cached server-side; no need to update queue here
        }
      },
    );
    setLoading(false);
    setTimeout(() => close(), 1000);
  };

  if (!show) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center px-4 select-none font-sans">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-md transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={loading ? undefined : close}
      />

      {/* Panel */}
      <div
        className={`relative w-full max-w-md max-h-[80vh] flex flex-col bg-black/50 backdrop-blur-3xl saturate-150 border border-white/10 rounded-[28px] shadow-[0_30px_80px_rgba(0,0,0,0.5)] text-white transition-all duration-300 ${visible ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4"}`}
      >
        {/* Header */}
        <div className="shrink-0 p-6 pb-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-lg font-bold tracking-tight">预加载缓存</h2>
              <p className="text-white/40 text-xs mt-0.5">
                {loading ? "正在下载音频和歌词..." : "选择歌曲提前下载，离线也能秒开"}
              </p>
            </div>
            <button onClick={close} disabled={loading}
              className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center disabled:opacity-20">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1L11 11M1 11L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Progress bar */}
          {loading && progress && (
            <div className="mb-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-white/50 truncate mr-2">
                  {progress.currentType === "audio" ? "🎵" : "📝"} {progress.current}
                </span>
                <span className="text-white/30 shrink-0">{progress.done}/{progress.total}</span>
              </div>
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-white/50 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Song list — matching PlaylistPanel style */}
        <div className="flex-1 overflow-y-auto playlist-scrollbar px-2 py-2 min-h-0">
          <div className="space-y-1">
            {songs.map(song => {
              const isSel = selected.has(song.id);
              const st = songState.get(song.id);
              const audioDone = st?.audio === "done";
              const lyricsDone = st?.lyrics === "done";
              const isLoading = st?.audio === "loading" || st?.lyrics === "loading";

              return (
                <div
                  key={song.id}
                  onClick={() => !loading && toggle(song.id)}
                  className={`group flex items-center gap-3 p-2 mx-1 rounded-2xl cursor-pointer transition-all duration-200
                    ${isSel ? 'bg-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]' : 'hover:bg-white/5'}
                    ${loading && !isSel ? 'opacity-40' : ''}`}
                  style={{ height: '66px', touchAction: 'manipulation' }}
                >
                  {/* Checkbox */}
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ml-1
                    ${isSel ? 'border-transparent' : 'border-white/20 group-hover:border-white/40'}`}
                    style={{ backgroundColor: isSel ? '#fff' : 'transparent' }}>
                    {isSel && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5L4 7L8 3" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>

                  {/* Cover */}
                  <div className="relative">
                    <Art src={song.coverUrl} alt={song.title} />
                    {/* Loading equalizer overlay */}
                    {isLoading && (
                      <div className="absolute inset-0 flex items-center justify-center gap-[3px] bg-black/30 rounded-lg">
                        <div className="w-[2px] bg-white/80 rounded-full animate-[eq-bounce_1s_ease-in-out_infinite]"
                          style={{ height: '8px' }} />
                        <div className="w-[2px] bg-white/80 rounded-full animate-[eq-bounce_1s_ease-in-out_infinite_0.2s]"
                          style={{ height: '14px' }} />
                        <div className="w-[2px] bg-white/80 rounded-full animate-[eq-bounce_1s_ease-in-out_infinite_0.4s]"
                          style={{ height: '10px' }} />
                      </div>
                    )}
                    {/* Done check */}
                    {audioDone && lyricsDone && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <circle cx="8" cy="8" r="7" fill="rgba(255,255,255,0.15)"/>
                          <path d="M5 8L7 10L11 6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                    <div className="text-[15px] font-semibold truncate leading-tight"
                      style={{ color: isSel ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.7)' }}>
                      {song.title}
                    </div>
                    <div className="text-[13px] text-white/50 truncate font-medium">
                      {song.artist}
                    </div>
                  </div>

                  {/* Status indicator */}
                  <div className="shrink-0 flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${audioDone ? 'bg-green-400/60' : st?.audio === 'error' ? 'bg-red-400/40' : 'bg-white/10'}`} />
                    <span className={`w-1.5 h-1.5 rounded-full ${lyricsDone ? 'bg-green-400/60' : st?.lyrics === 'error' ? 'bg-red-400/40' : 'bg-white/10'}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 p-6 pt-3">
          {!loading && (
            <div className="flex items-center gap-2 mb-3">
              <button onClick={selectAll} className="text-xs text-white/40 hover:text-white/70 transition-colors">全选</button>
              <button onClick={selectNone} className="text-xs text-white/30 hover:text-white/50 transition-colors">取消</button>
              <span className="text-xs text-white/20 ml-auto">{selected.size}/{songs.length}</span>
            </div>
          )}
          <button onClick={startPreload} disabled={loading || selected.size === 0}
            className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-white/80 font-medium transition-all text-sm disabled:opacity-30 disabled:cursor-not-allowed">
            {loading ? "预加载中..." : `预加载选中 (${selected.size}) 首 · 音频 + 歌词`}
          </button>
          <button onClick={close} disabled={loading}
            className="w-full py-2 text-xs text-white/25 hover:text-white/40 transition-colors mt-1 disabled:opacity-10">
            跳过，稍后再说
          </button>
        </div>
      </div>

      {/* eq-bounce keyframe (same as PlaylistPanel) */}
      <style>{`
        @keyframes eq-bounce {
          0%, 100% { transform: scaleY(0.4); opacity: 0.8; }
          50% { transform: scaleY(1); opacity: 1; }
        }
        .playlist-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.15) transparent;
        }
        .playlist-scrollbar::-webkit-scrollbar { width: 4px; }
        .playlist-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.15);
          border-radius: 999px;
        }
      `}</style>
    </div>,
    document.body,
  );
};

export default PreloadDialog;
