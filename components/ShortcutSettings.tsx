import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ShortcutBinding,
  ShortcutAction,
  comboToString,
  formatComboDisplay,
  loadBindings,
  saveBindings,
  resetBindings,
  ParsedCombo,
} from "../services/shortcutSettings";
import { getLyricsColor, setLyricsColor } from "../services/lyricsColorSettings";
import { getBlockedSongs, unblockSongs, type BlockedSongInfo } from "../services/blocklist";
import ColorPicker from "./ColorPicker";

// ---------------------------------------------------------------------------
//  Props
// ---------------------------------------------------------------------------

interface ShortcutSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onBindingsChanged: (bindings: ShortcutBinding[]) => void;
  onUnblock?: (songs: BlockedSongInfo[]) => void;
  onOpenCacheManager?: () => void;
}

// ---------------------------------------------------------------------------
//  Group definition for the UI
// ---------------------------------------------------------------------------

interface Group {
  title: string;
  actions: ShortcutAction[];
}

const GROUPS: Group[] = [
  {
    title: "播放控制",
    actions: ["playPause", "next", "prev", "seekForward", "seekBackward"],
  },
  {
    title: "音量",
    actions: ["volumeUp", "volumeDown"],
  },
];

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

const ShortcutSettings: React.FC<ShortcutSettingsProps> = ({
  isOpen,
  onClose,
  onBindingsChanged,
  onUnblock,
  onOpenCacheManager,
}) => {
  const [bindings, setBindings] = useState<ShortcutBinding[]>(() => loadBindings());
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [lyricColor, setLyricColorState] = useState(getLyricsColor);

  const handleColorChange = useCallback((hex: string) => {
    setLyricColorState(hex);
    setLyricsColor(hex);
  }, []);

  // --- Keyup-based recording state ---
  // Keys are accumulated on keydown; the combo is finalised on keyup.
  const pendingRef = useRef<{
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    meta: boolean;
    key: string;
    /** Timestamp of last keydown to debounce rapid repeats */
    lastDown: number;
  } | null>(null);
  // Track which physical keys are currently held so we know when ALL are released
  const heldKeysRef = useRef<Set<string>>(new Set());

  // Reload bindings when opened
  useEffect(() => {
    if (isOpen) setBindings(loadBindings());
  }, [isOpen]);

  // Close on Escape when not recording
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !recording) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, recording, onClose]);

  const handleSave = useCallback(
    (updated: ShortcutBinding[]) => {
      setBindings(updated);
      saveBindings(updated);
      onBindingsChanged(updated);
    },
    [onBindingsChanged],
  );

  const handleReset = useCallback(() => {
    const defaults = resetBindings();
    setBindings(defaults);
    onBindingsChanged(defaults);
  }, [onBindingsChanged]);

  const startRecording = useCallback((action: ShortcutAction) => {
    setRecording(action);
    setConflict(null);
    pendingRef.current = null;
    heldKeysRef.current = new Set();
  }, []);

  const cancelRecording = useCallback(() => {
    setRecording(null);
    setConflict(null);
    pendingRef.current = null;
    heldKeysRef.current = new Set();
  }, []);

  const finaliseCombo = useCallback(
    (combo: string) => {
      if (!recording) return;
      // Check for conflicts
      const conflicting = bindings.find(
        (b) => b.action !== recording && b.combo === combo,
      );
      if (conflicting) {
        setConflict(`${combo} 已被「${conflicting.label}」使用`);
        return;
      }
      const updated = bindings.map((b) =>
        b.action === recording ? { ...b, combo } : b,
      );
      handleSave(updated);
      setRecording(null);
      setConflict(null);
      pendingRef.current = null;
      heldKeysRef.current = new Set();
    },
    [recording, bindings, handleSave],
  );

  // --- Keydown: accumulate modifier + key state ---
  useEffect(() => {
    if (!recording) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't prevent default for Esc during recording — it cancels
      if (e.key === "Escape") {
        cancelRecording();
        return;
      }

      // Ignore modifier-only presses
      if (["Control", "Alt", "Shift", "Meta", "OS", "CapsLock", "NumLock", "ScrollLock", "Tab"].includes(e.key)) {
        return;
      }

      // Prevent browser shortcuts during recording
      e.preventDefault();
      e.stopPropagation();

      // Track held keys
      heldKeysRef.current.add(e.code);
      const now = performance.now();
      const last = pendingRef.current?.lastDown ?? 0;

      // If a non-modifier key was already pressed and we're still holding,
      // this is a repeat — ignore it unless significant time has passed
      if (pendingRef.current && pendingRef.current.key !== e.key && now - last < 150) {
        // New key pressed while still holding previous — update to new key
        // (rare: user pressed key A, then key B without releasing A)
      }

      pendingRef.current = {
        ctrl: e.ctrlKey || e.metaKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: false,
        key: e.key,
        lastDown: now,
      };

      // Force re-render to show pending keys
      setConflict(null);
    };

    // --- Keyup: when all keys are released, finalise the combo ---
    const onKeyUp = (e: KeyboardEvent) => {
      if (!recording) return;

      heldKeysRef.current.delete(e.code);

      // Only finalise when ALL keys are released
      if (heldKeysRef.current.size > 0) return;
      if (!pendingRef.current) return;

      const { key } = pendingRef.current;
      // Build full combo string
      const parsed: ParsedCombo = {
        ctrl: pendingRef.current.ctrl,
        alt: pendingRef.current.alt,
        shift: pendingRef.current.shift,
        meta: false,
        key,
      };

      const newCombo = comboToString(parsed);
      if (!newCombo) return;

      finaliseCombo(newCombo);
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [recording, cancelRecording, finaliseCombo]);

  // --- Render helpers ---
  const bindingMap = new Map(bindings.map((b) => [b.action, b]));

  if (!isOpen) return null;

  // Show pending combo while recording
  const pendingDisplay = pendingRef.current
    ? formatComboDisplay(
        comboToString({
          ctrl: pendingRef.current.ctrl,
          alt: pendingRef.current.alt,
          shift: pendingRef.current.shift,
          meta: false,
          key: pendingRef.current.key,
        }),
      )
    : null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center px-4 select-none font-sans">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-md"
        onClick={recording ? undefined : onClose}
      />

      {/* Panel */}
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
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight">快捷键设置</h2>
              <p className="text-white/40 text-sm mt-0.5">
                点击快捷键 → 按下组合键 → 松开后自动保存
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1L11 11M1 11L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Media Session note */}
          <div className="mb-5 p-3 rounded-xl bg-white/5 border border-white/5 text-xs text-white/50 leading-relaxed">
            <span className="text-white/70 font-semibold">💡 系统级快捷键</span>（游戏中也有效）：<br />
            键盘上的 <kbd className="bg-white/10 px-1 rounded">▶⏯</kbd> <kbd className="bg-white/10 px-1 rounded">⏭</kbd> <kbd className="bg-white/10 px-1 rounded">⏮</kbd> 媒体键<br />
            没有媒体键？用 AutoHotkey 映射游戏按键到媒体键
          </div>

          {/* Conflict warning */}
          {conflict && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex items-center justify-between">
              <span>{conflict}</span>
              <button onClick={cancelRecording} className="underline ml-2 shrink-0">取消</button>
            </div>
          )}

          {/* Shortcut groups */}
          {GROUPS.map((group) => (
            <div key={group.title} className="mb-5">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-2 px-1">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.actions.map((action) => {
                  const b = bindingMap.get(action);
                  if (!b) return null;
                  const isRecording = recording === action;
                  return (
                    <button
                      key={action}
                      onClick={() => startRecording(action)}
                      className={`
                        w-full flex items-center justify-between px-3 py-2.5 rounded-xl
                        transition-all duration-150 text-left
                        ${isRecording
                          ? "bg-white/15 ring-1 ring-white/30 scale-[1.02]"
                          : "hover:bg-white/5"
                        }
                      `}
                    >
                      <span className="text-sm font-medium text-white/80">
                        {b.label}
                      </span>
                      <span className="flex gap-1">
                        {isRecording ? (
                          pendingDisplay ? (
                            // Show current combo while pressing
                            pendingDisplay.map((part, i) => (
                              <kbd
                                key={i}
                                className="min-w-[24px] h-6 px-1.5 flex items-center justify-center bg-white/20 border border-white/20 rounded-[7px] text-xs font-semibold text-white animate-pulse"
                              >
                                {part}
                              </kbd>
                            ))
                          ) : (
                            // Waiting for first keypress
                            <span className="min-w-[40px] h-6 px-2 flex items-center justify-center bg-white/15 border border-white/15 rounded-[7px] text-xs text-white/50 italic">
                              ...
                            </span>
                          )
                        ) : (
                          formatComboDisplay(b.combo).map((part, i) => (
                            <kbd
                              key={i}
                              className="min-w-[24px] h-6 px-1.5 flex items-center justify-center bg-white/8 border border-white/5 rounded-[7px] text-xs font-semibold text-white/70"
                            >
                              {part}
                            </kbd>
                          ))
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Lyrics colour */}
          <div className="mt-4 pt-4 border-t border-white/5">
            <ColorPicker value={lyricColor} onChange={handleColorChange} />
          </div>

          {/* Blocklist */}
          <BlocklistSection onUnblock={onUnblock} />

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-white/5">
            <div className="flex items-center gap-2">
              <button onClick={handleReset} className="text-xs text-white/30 hover:text-white/60 transition-colors px-2 py-1">
                恢复默认
              </button>
              {onOpenCacheManager && (
                <button onClick={onOpenCacheManager} className="text-xs text-white/40 hover:text-white/70 transition-colors px-2 py-1">
                  缓存管理
                </button>
              )}
              <button
                onClick={() => {
                  if (confirm("确定清除所有缓存？\n\n包括屏蔽列表、歌词数据、快捷键设置。\n页面将自动刷新。")) {
                    window.localStorage.clear();
                    // Clear audio cache IndexedDB
                    indexedDB.deleteDatabase("aura-audio-cache");
                    // Clear Service Worker Cache Storage
                    if ("caches" in window) {
                      caches.delete("aura-audio-http").catch(() => {});
                    }
                    try {
                      const delReq = indexedDB.deleteDatabase("aura-music");
                      delReq.onsuccess = () => window.location.reload();
                      delReq.onerror = () => window.location.reload();
                    } catch {
                      window.location.reload();
                    }
                  }
                }}
                className="text-xs text-red-400/50 hover:text-red-400 transition-colors px-2 py-1"
              >
                清除缓存
              </button>
            </div>
            <span className="text-xs text-white/20">
              {recording ? "按下组合键 · 松开后保存" : "单击修改 · 自动保存"}
            </span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shortcut-in {
          0% { opacity: 0; transform: scale(0.96) translateY(8px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-in { animation: shortcut-in 0.2s cubic-bezier(0.32, 0.72, 0, 1) forwards; }
      `}</style>
    </div>,
    document.body,
  );
};

// ---------------------------------------------------------------------------
//  Blocklist section (rendered inside the settings panel)
// ---------------------------------------------------------------------------

const BlocklistSection: React.FC<{
  onUnblock?: (songs: BlockedSongInfo[]) => void;
}> = ({ onUnblock }) => {
  const [blockedSongs, setBlockedSongs] = useState<BlockedSongInfo[]>(() => getBlockedSongs());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRemove = (ids: string[]) => {
    const removed = unblockSongs(ids);
    setBlockedSongs(getBlockedSongs());
    setSelected(new Set());
    if (onUnblock && removed.length > 0) onUnblock(removed);
  };

  return (
    <div className="mt-4 pt-4 border-t border-white/5">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-2 px-1">
        屏蔽列表
      </h3>
      {blockedSongs.length === 0 ? (
        <p className="text-xs text-white/20 px-1">暂无屏蔽歌曲</p>
      ) : (
        <>
          {selected.size > 0 && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <button onClick={() => handleRemove([...selected])} className="text-xs text-red-400 hover:text-red-300 transition-colors">
                移除选中 ({selected.size})
              </button>
              <button onClick={() => handleRemove(blockedSongs.map(s => s.id))} className="text-xs text-white/30 hover:text-white/50 transition-colors">
                全部移除
              </button>
            </div>
          )}
          <div className="space-y-1 max-h-[200px] overflow-y-auto no-scrollbar">
            {blockedSongs.map((song) => {
              const isSel = selected.has(song.id);
              return (
                <div key={song.id} onClick={() => toggleSelect(song.id)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-all duration-150 ${isSel ? 'bg-white/10 ring-1 ring-white/20' : 'hover:bg-white/5'}`}>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isSel ? 'border-transparent' : 'border-white/20'}`}
                    style={{ backgroundColor: isSel ? '#fff' : 'transparent' }}>
                    {isSel && (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4L3.5 6L6.5 2" stroke="#000" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white/40 truncate">{song.title}</div>
                    <div className="text-xs text-white/25 truncate">{song.artist}</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleRemove([song.id]); }}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white/25 hover:text-red-400 hover:bg-white/5 transition-all shrink-0" title="取消屏蔽">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M3 3L11 11M3 11L11 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default ShortcutSettings;
