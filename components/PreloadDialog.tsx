import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Song } from "../types";
import { isPreloadDone, markPreloadDone, getUncachedSongs, preloadLyrics, type PreloadProgress } from "../services/preloadCache";

interface PreloadDialogProps {
  queue: Song[];
  onLyricsReady: (id: string, lyrics: import("../types").LyricLine[]) => void;
}

const PreloadDialog: React.FC<PreloadDialogProps> = ({ queue, onLyricsReady }) => {
  const [show, setShow] = useState(false);
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<PreloadProgress | null>(null);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  const uncached = getUncachedSongs(queue);

  useEffect(() => {
    if (uncached.length > 0 && !isPreloadDone()) {
      setShow(true);
      setSelected(new Set(uncached.map(s => s.id)));
      requestAnimationFrame(() => setVisible(true));
    }
  }, [queue.length]);

  const close = useCallback(() => {
    markPreloadDone();
    setVisible(false);
    setTimeout(() => setShow(false), 300);
  }, []);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startPreload = async () => {
    setLoading(true);
    const toLoad = uncached.filter(s => selected.has(s.id));
    await preloadLyrics(
      toLoad,
      (p) => setProgress(p),
      async (id, result) => {
        setDoneIds(prev => new Set(prev).add(id));
        if (result) {
          const { parseLyrics } = await import("../services/lyrics");
          const lyrics = result.ttml
            ? parseLyrics(result.ttml!)
            : parseLyrics(result.lrc ?? "", result.tLrc, { yrcContent: result.yrc });
          onLyricsReady(id, lyrics);
        }
      },
    );
    setLoading(false);
    setTimeout(() => close(), 800);
  };

  const selectAll = () => setSelected(new Set(uncached.map(s => s.id)));
  const selectNone = () => setSelected(new Set());

  if (!show) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center px-4 select-none font-sans">
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-md transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={loading ? undefined : close}
      />
      <div
        className={`relative w-full max-w-md max-h-[80vh] overflow-y-auto no-scrollbar bg-black/50 backdrop-blur-3xl saturate-150 border border-white/10 rounded-[28px] shadow-[0_30px_80px_rgba(0,0,0,0.5)] text-white p-6 transition-all duration-300 ${visible ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4"}`}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight">预加载歌词缓存</h2>
            <p className="text-white/40 text-xs mt-0.5">
              选择歌曲提前下载云端歌词，之后秒开
            </p>
          </div>
          <button onClick={close} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1L11 11M1 11L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {loading && progress ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/60">{progress.current}</span>
              <span className="text-white/30">{progress.done}/{progress.total}</span>
            </div>
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-white/60 rounded-full transition-all duration-300" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              <button onClick={selectAll} className="text-xs text-white/40 hover:text-white/70 transition-colors">全选</button>
              <button onClick={selectNone} className="text-xs text-white/30 hover:text-white/50 transition-colors">取消全选</button>
              <span className="text-xs text-white/20 ml-auto">{selected.size}/{uncached.length}</span>
            </div>
            <div className="space-y-1 max-h-[300px] overflow-y-auto no-scrollbar mb-4">
              {uncached.map(song => (
                <div
                  key={song.id}
                  onClick={() => toggle(song.id)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-all ${selected.has(song.id) ? 'bg-white/10 ring-1 ring-white/20' : 'hover:bg-white/5'}`}
                >
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${selected.has(song.id) ? 'border-transparent' : 'border-white/20'}`}
                    style={{ backgroundColor: selected.has(song.id) ? '#fff' : 'transparent' }}
                  >
                    {selected.has(song.id) && (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4L3.5 6L6.5 2" stroke="#000" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white/70 truncate">{song.title}</div>
                    <div className="text-xs text-white/35 truncate">{song.artist}</div>
                  </div>
                  {doneIds.has(song.id) && <span className="text-xs text-green-400/60 shrink-0">✓</span>}
                </div>
              ))}
            </div>
            <button
              onClick={startPreload}
              disabled={selected.size === 0}
              className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-white/80 font-medium transition-all text-sm disabled:opacity-30 disabled:cursor-not-allowed"
            >
              预加载选中 ({selected.size}) 首
            </button>
            <button onClick={close} className="w-full py-2 text-xs text-white/25 hover:text-white/40 transition-colors mt-1">
              跳过，稍后再说
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default PreloadDialog;
