import React, { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import type { Song } from "../types";

interface IdManagerProps {
  isOpen: boolean;
  onClose: () => void;
  queue: Song[];
  onIdChanged: (songId: string, newNeteaseId: string, newLyrics: import("../types").LyricLine[]) => void;
}

const STORAGE_KEY = "aura:custom-netease-ids";

const loadOverrides = (): Record<string, string> => {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
  } catch { return {}; }
};

const saveOverrides = (map: Record<string, string>) => {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch {}
};

// Fetch LRC from Vercel NetEase API
const fetchLrcById = async (neteaseId: string): Promise<import("../types").LyricLine[]> => {
  try {
    const url = `https://api-enhanced-ten-delta.vercel.app/lyric?id=${neteaseId}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const lrc = data?.lrc?.lyric;
    if (!lrc || lrc.trim().length < 10) return [];
    const { parseLyrics } = await import("../services/lyrics");
    return parseLyrics(lrc);
  } catch {
    return [];
  }
};

const IdManager: React.FC<IdManagerProps> = ({ isOpen, onClose, queue, onIdChanged }) => {
  const overrides = loadOverrides();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, string>>({});

  const songs = queue
    .filter((s) => s.source === "remote" && s.fileUrl && !s.fileUrl.startsWith("blob:"))
    .sort((a, b) => a.title.localeCompare(b.title));

  const getEffectiveId = (song: Song) => {
    if (overrides[song.id]) return overrides[song.id];
    return song.neteaseId || "";
  };

  const startEdit = (song: Song) => {
    setEditingId(song.id);
    setEditValue(getEffectiveId(song));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  const saveId = useCallback(async (song: Song) => {
    const newId = editValue.trim();
    if (!newId || newId === song.neteaseId) {
      cancelEdit();
      return;
    }

    setSaving(song.id);
    setStatus((p) => ({ ...p, [song.id]: "获取歌词中..." }));

    const lyrics = await fetchLrcById(newId);
    if (lyrics.length > 0) {
      overrides[song.id] = newId;
      saveOverrides(overrides);
      onIdChanged(song.id, newId, lyrics);
      setStatus((p) => ({ ...p, [song.id]: `✅ ${lyrics.length} 行` }));
    } else {
      setStatus((p) => ({ ...p, [song.id]: "❌ 无歌词" }));
    }

    setSaving(null);
    setEditingId(null);
  }, [editValue, onIdChanged, overrides]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center px-4 select-none font-sans">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-md"
        onClick={onClose}
      />
      <div className="
        relative w-full max-w-lg max-h-[85vh] overflow-y-auto no-scrollbar
        bg-black/50 backdrop-blur-3xl saturate-150
        border border-white/10
        rounded-[28px]
        shadow-[0_30px_80px_rgba(0,0,0,0.5)]
        text-white
        animate-in
      ">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">音乐ID管理</h2>
              <p className="text-white/40 text-sm mt-0.5">
                修改网易云ID → 自动获取歌词
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1L11 11M1 11L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Song list */}
          <div className="space-y-1">
            {songs.map((song) => {
              const effectiveId = getEffectiveId(song);
              const isEditing = editingId === song.id;
              const isOverridden = overrides[song.id] && overrides[song.id] !== song.neteaseId;

              return (
                <div
                  key={song.id}
                  className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/[0.04] transition-colors"
                >
                  {/* Cover */}
                  {song.coverUrl ? (
                    <img src={song.coverUrl} className="h-8 w-8 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="h-8 w-8 shrink-0 rounded-lg bg-white/5 flex items-center justify-center">
                      <span className="text-[10px] text-white/20">♪</span>
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate text-white/70">{song.title}</div>
                    <div className="text-[11px] text-white/30 truncate">{song.artist}</div>
                  </div>

                  {/* ID field */}
                  <div className="shrink-0">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveId(song);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          placeholder="网易云ID"
                          autoFocus
                          className="w-24 bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-white/40 transition-colors"
                        />
                        <button
                          onClick={() => saveId(song)}
                          disabled={saving === song.id}
                          className="text-[10px] text-green-400/70 hover:text-green-400 px-1"
                        >
                          {saving === song.id ? "..." : "保存"}
                        </button>
                        <button onClick={cancelEdit} className="text-[10px] text-white/20 hover:text-white/40 px-1">
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(song)}
                        className={`text-[11px] px-2 py-1 rounded-lg transition-colors ${
                          isOverridden
                            ? "text-amber-400/70 hover:text-amber-400 bg-amber-400/5"
                            : effectiveId
                              ? "text-white/30 hover:text-white/60 hover:bg-white/5"
                              : "text-white/15 hover:text-white/40 hover:bg-white/5"
                        }`}
                        title={effectiveId || "未设置 — 点击编辑"}
                      >
                        {effectiveId || "—"}
                      </button>
                    )}
                  </div>

                  {/* Status */}
                  {status[song.id] && !isEditing && (
                    <span className="text-[10px] text-white/30 shrink-0">{status[song.id]}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 mt-2 border-t border-white/5">
            <span className="text-xs text-white/20">
              共 {songs.length} 首 · 修改后自动获取歌词
            </span>
            <button onClick={onClose} className="text-xs text-white/30 hover:text-white/60 transition-colors">
              关闭
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shortcut-in {
          0% { opacity: 0; transform: scale(0.96) translateY(8px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-in { animation: shortcut-in 0.2s cubic-bezier(0.32, 0.72, 0, 1) forwards; }
        .no-scrollbar { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent; }
        .no-scrollbar::-webkit-scrollbar { width: 3px; }
        .no-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 999px; }
      `}</style>
    </div>,
    document.body,
  );
};

export default IdManager;
