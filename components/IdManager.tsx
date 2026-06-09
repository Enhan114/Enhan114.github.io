import React, { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import type { Song } from "../types";
import { KNOWN_IDS } from "../services/knownIds";

interface IdManagerProps {
  isOpen: boolean;
  onClose: () => void;
  queue: Song[];
  onIdChanged: (songId: string, newNeteaseId: string, newLyrics: import("../types").LyricLine[]) => void;
}

const STORAGE_KEY = "aura:custom-netease-ids";
const SOURCE_KEY = "aura:lyrics-source"; // "api" | "amll"

const loadOverrides = (): Record<string, string> => {
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
};
const saveOverrides = (map: Record<string, string>) => {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch {}
};
const loadSources = (): Record<string, string> => {
  try { return JSON.parse(window.localStorage.getItem(SOURCE_KEY) || "{}"); }
  catch { return {}; }
};
const saveSources = (map: Record<string, string>) => {
  try { window.localStorage.setItem(SOURCE_KEY, JSON.stringify(map)); } catch {}
};

// Fetch from NetEase API — same parsing as staticMusic.ts (keeps metadata)
const fetchFromApi = async (id: string): Promise<import("../types").LyricLine[]> => {
  try {
    const res = await fetch(`https://music-api.cc.cd/lyric/new?id=${id}`);
    if (!res.ok) return [];
    const data = await res.json();
    const lrcRaw = data?.lrc?.lyric || "";
    const tlyricRaw = data?.tlyric?.lyric || "";
    if (!lrcRaw) return [];

    // Same logic as staticMusic.ts: convert JSON metadata + parseLrc + mergeTranslations
    const { parseLrc } = await import("../services/lyrics/lrc");
    const { mergeTranslations } = await import("../services/lyrics/translation");

    const metaLines: import("../types").LyricLine[] = [];
    for (const line of lrcRaw.split("\n")) {
      const t = line.trim();
      if (!t.startsWith('{"t":')) continue;
      try {
        const m = JSON.parse(t);
        const ms = m.t || 0;
        const tx = (m.c || []).map((c: any) => c.tx || "").join("").trim();
        if (tx) metaLines.push({ time: ms / 1000, text: tx, isMetadata: false });
      } catch {}
    }

    let lyrics = parseLrc(lrcRaw);
    if (tlyricRaw) lyrics = mergeTranslations(lyrics, tlyricRaw);
    return [...metaLines, ...lyrics];
  } catch { return []; }
};

// AMLL — same-origin (production) or absolute (dev fallback)
const AMLL_PATHS = [
  "/amll-ttml-db/ncm-lyrics",                           // production: same-origin
  "https://webmusic.cc.cd/amll-ttml-db/ncm-lyrics",     // dev fallback
];

const fetchFromAmll = async (id: string): Promise<import("../types").LyricLine[]> => {
  for (const base of AMLL_PATHS) {
    for (const ext of [".ttml", ".yrc"]) {
      try {
        const res = await fetch(`${base}/${id}${ext}`);
        if (!res.ok) continue;
        const text = await res.text();
        // Skip HTML responses (Vite dev server returns index.html for unknown paths)
        if (text.startsWith("<!") || text.length < 200) continue;
        const { parseLyrics } = await import("../services/lyrics");
        return parseLyrics(text);
      } catch {}
    }
  }
  return [];
};

const IdManager: React.FC<IdManagerProps> = ({ isOpen, onClose, queue, onIdChanged }) => {
  const [overrides, setOverrides] = useState(loadOverrides);
  const [sources, setSourcesState] = useState(loadSources);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, string>>({});

  const songs = queue
    .filter((s) => s.fileUrl && (s.source === "remote" || s.source === "local"))
    .sort((a, b) => a.title.localeCompare(b.title));

  const getEffectiveId = (song: Song) => overrides[song.id] || song.neteaseId || KNOWN_IDS[song.title] || "";
  const getSource = (song: Song) => sources[song.id] || "api";

  const toggleSource = (song: Song) => {
    const updated = { ...sources, [song.id]: getSource(song) === "api" ? "amll" : "api" };
    setSourcesState(updated);
    saveSources(updated);
  };

  const startEdit = (song: Song) => {
    setEditingId(song.id);
    setEditValue(getEffectiveId(song));
  };
  const cancelEdit = () => { setEditingId(null); setEditValue(""); };

  const saveId = useCallback(async (song: Song) => {
    const newId = editValue.trim();
    if (!newId) {
      // Empty → keep original, revert to manifest ID
      const updated = { ...overrides };
      delete updated[song.id];
      setOverrides(updated);
      saveOverrides(updated);
      cancelEdit();
      return;
    }

    setSaving(song.id);
    const src = getSource(song);
    setStatus((p) => ({ ...p, [song.id]: `${src === "amll" ? "AMLL" : "API"} 获取中...` }));

    const lyrics = src === "amll" ? await fetchFromAmll(newId) : await fetchFromApi(newId);

    if (lyrics.length > 0) {
      const updated = { ...overrides, [song.id]: newId };
      setOverrides(updated);
      saveOverrides(updated);
      onIdChanged(song.id, newId, lyrics);
      setStatus((p) => ({ ...p, [song.id]: `✅ ${src.toUpperCase()} ${lyrics.length} 行` }));
    } else {
      setStatus((p) => ({ ...p, [song.id]: `❌ ${src.toUpperCase()} 无歌词` }));
    }
    setSaving(null);
    setEditingId(null);
  }, [editValue, onIdChanged, overrides, sources]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center px-4 select-none font-sans">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[85vh] overflow-y-auto no-scrollbar bg-black/50 backdrop-blur-3xl saturate-150 border border-white/10 rounded-[28px] shadow-[0_30px_80px_rgba(0,0,0,0.5)] text-white animate-in">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">音乐ID管理</h2>
              <p className="text-white/40 text-sm mt-0.5">修改ID / 选择歌词源 → 自动获取</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1L11 11M1 11L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
          </div>

          <div className="space-y-1">
            {songs.map((song) => {
              const effectiveId = getEffectiveId(song);
              const isEditing = editingId === song.id;
              const isOverridden = overrides[song.id] && overrides[song.id] !== song.neteaseId;
              const src = getSource(song);

              return (
                <div key={song.id} className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/[0.04] transition-colors">
                  {song.coverUrl ? (
                    <img src={song.coverUrl} className="h-8 w-8 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="h-8 w-8 shrink-0 rounded-lg bg-white/5 flex items-center justify-center"><span className="text-[10px] text-white/20">♪</span></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate text-white/70">{song.title}</div>
                    <div className="text-[11px] text-white/30 truncate">{song.artist}</div>
                  </div>

                  {/* Source toggle */}
                  <button
                    onClick={() => toggleSource(song)}
                    className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-full transition-colors ${
                      src === "amll" ? "text-purple-400/60 bg-purple-400/10 hover:text-purple-400" : "text-blue-400/60 bg-blue-400/10 hover:text-blue-400"
                    }`}
                    title={src === "amll" ? "AMLL TTML" : "NetEase API"}
                  >
                    {src === "amll" ? "AMLL" : "API"}
                  </button>

                  {/* ID field */}
                  <div className="shrink-0">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveId(song); if (e.key === "Escape") cancelEdit(); }}
                          placeholder="网易云ID"
                          autoFocus
                          className="w-24 bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-white/40 transition-colors"
                        />
                        <button onClick={() => saveId(song)} disabled={saving === song.id} className="text-[10px] text-green-400/70 hover:text-green-400 px-1">
                          {saving === song.id ? "..." : "保存"}
                        </button>
                        <button onClick={cancelEdit} className="text-[10px] text-white/20 hover:text-white/40 px-1">取消</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(song)}
                        className={`text-[11px] px-2 py-1 rounded-lg transition-colors ${
                          isOverridden ? "text-amber-400/70 hover:text-amber-400 bg-amber-400/5"
                          : effectiveId ? "text-white/30 hover:text-white/60 hover:bg-white/5"
                          : "text-white/15 hover:text-white/40 hover:bg-white/5"
                        }`}
                        title={effectiveId || "未设置 — 点击编辑"}
                      >
                        {effectiveId || "—"}
                      </button>
                    )}
                  </div>

                  {status[song.id] && !isEditing && (
                    <span className="text-[10px] text-white/30 shrink-0">{status[song.id]}</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-4 mt-2 border-t border-white/5">
            <span className="text-xs text-white/20">共 {songs.length} 首 · 修改后自动获取歌词</span>
            <button onClick={onClose} className="text-xs text-white/30 hover:text-white/60 transition-colors">关闭</button>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes shortcut-in { 0% { opacity: 0; transform: scale(0.96) translateY(8px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
        .animate-in { animation: shortcut-in 0.2s cubic-bezier(0.32, 0.72, 0, 1) forwards; }
        .no-scrollbar { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent; }
        .no-scrollbar::-webkit-scrollbar { width: 3px; }
        .no-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 999px; }
      `}</style>
    </div>, document.body);
};

export default IdManager;
