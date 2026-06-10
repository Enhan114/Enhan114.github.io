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

const IDS_KEY = "aura:custom-netease-ids";
const SOURCE_KEY = "aura:lyrics-source";
const AUDIO_KEY = "aura:custom-audio-urls";

const loadMap = (k: string): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch { return {}; }
};
const saveMap = (k: string, m: Record<string, string>) => {
  try { localStorage.setItem(k, JSON.stringify(m)); } catch {}
};

const AMLL_PATHS = ["/amll-ttml-db/ncm-lyrics", "https://webmusic.cc.cd/amll-ttml-db/ncm-lyrics"];

const fetchFromApi = async (id: string): Promise<import("../types").LyricLine[]> => {
  try {
    const res = await fetch(`https://music-api.cc.cd/lyric/new?id=${id}`);
    if (!res.ok) return [];
    const data = await res.json();
    const lrcRaw = data?.lrc?.lyric || "";
    const tlyricRaw = data?.tlyric?.lyric || "";
    if (!lrcRaw) return [];
    const { parseLrc } = await import("../services/lyrics/lrc");
    const { mergeTranslations } = await import("../services/lyrics/translation");
    const metaLines: import("../types").LyricLine[] = [];
    for (const line of lrcRaw.split("\n")) {
      if (!line.trim().startsWith('{"t":')) continue;
      try { const m = JSON.parse(line.trim()); const tx = (m.c||[]).map((c:any)=>c.tx||"").join("").trim(); if(tx) metaLines.push({time:m.t/1000,text:tx,isMetadata:false}); } catch {}
    }
    let lyrics = parseLrc(lrcRaw);
    if (tlyricRaw) lyrics = mergeTranslations(lyrics, tlyricRaw);
    return [...metaLines, ...lyrics];
  } catch { return []; }
};

const fetchFromAmll = async (id: string): Promise<import("../types").LyricLine[]> => {
  for (const base of AMLL_PATHS) for (const ext of [".ttml", ".yrc"]) {
    try { const r = await fetch(`${base}/${id}${ext}`); if (r.ok) { const t = await r.text(); if(t[0]!=='<'||t.length<200) continue; const { parseLyrics } = await import("../services/lyrics"); return parseLyrics(t); } } catch {}
  }
  return [];
};

// ── Global helper for preload + playback ──
export const getEffectiveAudioUrl = (): string | null => null;
(window as any).__auraGetAudioUrl = (song: Song) => {
  const urls = loadMap(AUDIO_KEY);
  if (urls[song.id]) return urls[song.id];
  const ids = loadMap(IDS_KEY);
  const id = ids[song.id] || song.neteaseId || KNOWN_IDS[song.title] || "";
  return id ? `https://music-api.cc.cd/song/url/match?id=${id}` : song.fileUrl;
};

const IdManager: React.FC<IdManagerProps> = ({ isOpen, onClose, queue, onIdChanged }) => {
  const [overrides, setOverrides] = useState(() => loadMap(IDS_KEY));
  const [sources, setSources] = useState(() => loadMap(SOURCE_KEY));
  const [audioUrls, setAudioUrls] = useState(() => loadMap(AUDIO_KEY));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editAudio, setEditAudio] = useState("");
  const [editField, setEditField] = useState<"id" | "audio" | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, string>>({});

  const songs = queue
    .filter(s => s.fileUrl && (s.source === "remote" || s.source === "local"))
    .sort((a, b) => a.title.localeCompare(b.title));

  const getEffectiveId = (s: Song) => overrides[s.id] || s.neteaseId || KNOWN_IDS[s.title] || "";
  const getSource = (s: Song) => sources[s.id] || "api";
  const getAudioUrl = (s: Song) => {
    if (audioUrls[s.id]) return audioUrls[s.id];
    const id = getEffectiveId(s);
    return id ? `https://music-api.cc.cd/song/url/match?id=${id}` : s.fileUrl;
  };

  const toggleSource = (s: Song) => {
    const u = { ...sources, [s.id]: getSource(s) === "api" ? "amll" : "api" };
    setSources(u); saveMap(SOURCE_KEY, u);
  };

  const startEdit = (s: Song, field: "id" | "audio") => {
    setEditingId(s.id);
    setEditField(field);
    setEditValue(field === "id" ? getEffectiveId(s) : (audioUrls[s.id] || ""));
    setEditAudio(field === "audio" ? (audioUrls[s.id] || "") : "");
  };
  const cancelEdit = () => { setEditingId(null); setEditField(null); setEditValue(""); setEditAudio(""); };

  const saveAudioUrl = (s: Song) => {
    const v = editAudio.trim();
    const u = { ...audioUrls };
    if (v) u[s.id] = v; else delete u[s.id];
    setAudioUrls(u); saveMap(AUDIO_KEY, u);
    setStatus(p => ({ ...p, [s.id]: v ? `✅ 音频链接已保存` : `✅ 已重置` }));
    cancelEdit();
  };

  const saveId = useCallback(async (s: Song) => {
    const newId = editValue.trim();
    if (!newId) { const u = { ...overrides }; delete u[s.id]; setOverrides(u); saveMap(IDS_KEY, u); cancelEdit(); return; }
    setSaving(s.id);
    const src = getSource(s);
    setStatus(p => ({ ...p, [s.id]: `${src.toUpperCase()} 获取中...` }));
    const lyrics = src === "amll" ? await fetchFromAmll(newId) : await fetchFromApi(newId);
    if (lyrics.length > 0) {
      const u = { ...overrides, [s.id]: newId }; setOverrides(u); saveMap(IDS_KEY, u);
      onIdChanged(s.id, newId, lyrics);
      setStatus(p => ({ ...p, [s.id]: `✅ ${src.toUpperCase()} ${lyrics.length} 行` }));
    } else setStatus(p => ({ ...p, [s.id]: `❌ ${src.toUpperCase()} 无歌词` }));
    setSaving(null); setEditingId(null); setEditField(null);
  }, [editValue, onIdChanged, overrides, sources]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center px-4 select-none font-sans">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto no-scrollbar bg-black/50 backdrop-blur-3xl saturate-150 border border-white/10 rounded-[28px] shadow-[0_30px_80px_rgba(0,0,0,0.5)] text-white animate-in">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div><h2 className="text-xl font-bold tracking-tight">音乐ID管理</h2><p className="text-white/40 text-sm mt-0.5">修改ID / 歌词源 / 音频链接 → 自动获取</p></div>
            <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1L11 11M1 11L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></button>
          </div>
          <div className="space-y-1">
            {songs.map(song => {
              const isEditing = editingId === song.id;
              const src = getSource(song);
              const audioUrl = getAudioUrl(song);
              return (
                <div key={song.id} className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/[0.04] transition-colors">
                  {song.coverUrl ? <img src={song.coverUrl} className="h-8 w-8 rounded-lg object-cover shrink-0" /> : <div className="h-8 w-8 shrink-0 rounded-lg bg-white/5 flex items-center justify-center"><span className="text-[10px] text-white/20">♪</span></div>}
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium truncate text-white/70">{song.title}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {/* ID */}
                      {isEditing && editField === "id" ? (
                        <div className="flex items-center gap-1">
                          <input value={editValue} onChange={e=>setEditValue(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")saveId(song);if(e.key==="Escape")cancelEdit()}} placeholder="网易云ID" autoFocus className="w-20 bg-white/10 border border-white/20 rounded px-1.5 py-0.5 text-[10px] text-white outline-none focus:border-white/40" />
                          <button onClick={()=>saveId(song)} disabled={saving===song.id} className="text-[9px] text-green-400/70 hover:text-green-400">{saving===song.id?"...":"保存"}</button>
                          <button onClick={cancelEdit} className="text-[9px] text-white/20 hover:text-white/40">取消</button>
                        </div>
                      ) : (
                        <button onClick={()=>startEdit(song,"id")} className={`text-[10px] px-1 rounded hover:bg-white/5 ${getEffectiveId(song) ? "text-white/40 hover:text-white/60" : "text-white/15 hover:text-white/30"}`}>
                          ID: {getEffectiveId(song) || "—"}
                        </button>
                      )}
                      {/* Source toggle */}
                      <button onClick={()=>toggleSource(song)} className={`text-[9px] px-1 rounded-full ${src==="amll"?"text-purple-400/60 bg-purple-400/10":"text-blue-400/60 bg-blue-400/10"}`}>{src.toUpperCase()}</button>
                      {/* Audio URL */}
                      {isEditing && editField === "audio" ? (
                        <div className="flex items-center gap-1">
                          <input value={editAudio} onChange={e=>setEditAudio(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")saveAudioUrl(song);if(e.key==="Escape")cancelEdit()}} placeholder="音频链接" autoFocus className="w-32 bg-white/10 border border-white/20 rounded px-1.5 py-0.5 text-[10px] text-white outline-none focus:border-white/40" />
                          <button onClick={()=>saveAudioUrl(song)} className="text-[9px] text-green-400/70 hover:text-green-400">保存</button>
                          <button onClick={cancelEdit} className="text-[9px] text-white/20 hover:text-white/40">取消</button>
                        </div>
                      ) : (
                        <button onClick={()=>startEdit(song,"audio")} className={`text-[10px] px-1 rounded hover:bg-white/5 ${audioUrls[song.id]?"text-amber-400/50":"text-white/15 hover:text-white/30"}`} title={audioUrl}>
                          🎵 {audioUrls[song.id] ? "自定义" : "默认"}
                        </button>
                      )}
                    </div>
                  </div>
                  {status[song.id] && !isEditing && <span className="text-[9px] text-white/30 shrink-0">{status[song.id]}</span>}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between pt-4 mt-2 border-t border-white/5">
            <span className="text-xs text-white/20">{songs.length} 首 · ID / 源 / 音频</span>
            <button onClick={onClose} className="text-xs text-white/30 hover:text-white/60">关闭</button>
          </div>
        </div>
      </div>
      <style>{`@keyframes shortcut-in{0%{opacity:0;transform:scale(0.96) translateY(8px)}100%{opacity:1;transform:scale(1) translateY(0)}}.animate-in{animation:shortcut-in .2s cubic-bezier(0.32,0.72,0,1) forwards}.no-scrollbar{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.1) transparent}.no-scrollbar::-webkit-scrollbar{width:3px}.no-scrollbar::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:999px}`}</style>
    </div>, document.body);
};

export default IdManager;
