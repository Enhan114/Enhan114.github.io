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

// ---------------------------------------------------------------------------
//  Props
// ---------------------------------------------------------------------------

interface ShortcutSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after bindings are saved so parent can refresh its state */
  onBindingsChanged: (bindings: ShortcutBinding[]) => void;
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
    actions: ["volumeUp", "volumeDown", "toggleVolumePanel"],
  },
  {
    title: "界面",
    actions: ["toggleMode", "togglePlaylist", "toggleSearch", "toggleShortcuts", "toggleSpeedPanel"],
  },
];

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

const ShortcutSettings: React.FC<ShortcutSettingsProps> = ({
  isOpen,
  onClose,
  onBindingsChanged,
}) => {
  const [bindings, setBindings] = useState<ShortcutBinding[]>(() => loadBindings());
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

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

  const startRecording = useCallback(
    (action: ShortcutAction) => {
      setRecording(action);
      setConflict(null);
    },
    [],
  );

  const stopRecording = useCallback(() => {
    setRecording(null);
    setConflict(null);
  }, []);

  // Listen for key press when recording
  useEffect(() => {
    if (!recording) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Build combo
      const parsed: ParsedCombo = {
        ctrl: e.ctrlKey || e.metaKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: false,
        key: e.key,
      };

      // Ignore modifier-only presses
      if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;

      const newCombo = comboToString(parsed);
      if (!newCombo) return;

      // Check for conflicts
      const conflicting = bindings.find(
        (b) => b.action !== recording && b.combo === newCombo,
      );
      if (conflicting) {
        setConflict(`${newCombo} 已被「${conflicting.label}」使用`);
        return;
      }

      // Apply
      const updated = bindings.map((b) =>
        b.action === recording ? { ...b, combo: newCombo } : b,
      );
      handleSave(updated);
      stopRecording();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording, bindings, handleSave, stopRecording]);

  const bindingMap = new Map(bindings.map((b) => [b.action, b]));

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[10000] flex items-center justify-center px-4 select-none font-sans"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-md"
        onClick={recording ? undefined : onClose}
      />

      {/* Panel */}
      <div
        className="
          relative w-full max-w-lg max-h-[85vh] overflow-y-auto
          bg-black/50 backdrop-blur-3xl saturate-150
          border border-white/10
          rounded-[28px]
          shadow-[0_30px_80px_rgba(0,0,0,0.5)]
          text-white
          animate-in
        "
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight">快捷键设置</h2>
              <p className="text-white/40 text-sm mt-0.5">
                点击快捷键 → 按下新按键 → 自动保存
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
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
              {conflict}
              <button onClick={stopRecording} className="ml-2 underline">取消</button>
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
                          <span className="min-w-[60px] h-7 px-2 flex items-center justify-center bg-white/20 border border-white/20 rounded-[8px] text-xs font-semibold text-white animate-pulse">
                            按下按键…
                          </span>
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

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-white/5">
            <button
              onClick={handleReset}
              className="text-xs text-white/30 hover:text-white/60 transition-colors px-2 py-1"
            >
              恢复默认
            </button>
            <span className="text-xs text-white/20">单击修改 · 自动保存</span>
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

export default ShortcutSettings;
