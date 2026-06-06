import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../hooks/useI18n";
import { useKeyboardScope } from "../hooks/useKeyboardScope";
import {
  ShortcutBinding,
  eventMatchesCombo,
  formatComboDisplay,
  loadBindings,
} from "../services/shortcutSettings";
import ShortcutSettings from "./ShortcutSettings";

interface KeyboardShortcutsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (time: number) => void;
  currentTime: number;
  duration: number;
  volume: number;
  onVolumeChange: (vol: number) => void;
  onToggleMode: () => void;
  onTogglePlaylist: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  onToggleVolumeDialog: () => void;
  onToggleSpeedDialog: () => void;
  onToggleSearch: () => void;
}

const KeyboardShortcuts: React.FC<KeyboardShortcutsProps> = ({
  isPlaying,
  onPlayPause,
  onNext,
  onPrev,
  onSeek,
  currentTime,
  duration,
  volume,
  onVolumeChange,
  onToggleMode,
  onTogglePlaylist,
  speed,
  onSpeedChange,
  onToggleVolumeDialog,
  onToggleSpeedDialog,
  onToggleSearch,
}) => {
  const { dict } = useI18n();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [bindings, setBindings] = useState<ShortcutBinding[]>(() => loadBindings());

  const getCombo = useCallback(
    (action: string) => bindings.find((b) => b.action === action)?.combo ?? "",
    [bindings],
  );

  const reloadBindings = useCallback(() => {
    setBindings(loadBindings());
  }, []);

  const handleBindingsChanged = useCallback((updated: ShortcutBinding[]) => {
    setBindings(updated);
  }, []);

  useEffect(() => {
    if (isHelpOpen || isSettingsOpen) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isHelpOpen, isSettingsOpen]);

  // Use keyboard scope with lower priority (50) for global shortcuts
  useKeyboardScope(
    (e) => {
      const target = e.target as HTMLElement;
      if (
        ["INPUT", "TEXTAREA"].includes(target.tagName) ||
        target.isContentEditable
      )
        return false;

      // Read combos dynamically so user changes take effect immediately
      const currentBindings = bindings;

      const match = (action: string) => {
        const combo = currentBindings.find((b) => b.action === action)?.combo;
        return combo ? eventMatchesCombo(e, combo) : false;
      };

      if (e.key === "Escape") {
        if (isHelpOpen) { e.preventDefault(); setIsHelpOpen(false); return true; }
        if (isSettingsOpen) { e.preventDefault(); setIsSettingsOpen(false); return true; }
        return false;
      }

      // Allow close when settings panel is open
      if (isSettingsOpen) {
        if (match("toggleShortcuts")) { e.preventDefault(); setIsSettingsOpen(false); return true; }
        return false;
      }

      if (match("toggleShortcuts")) { e.preventDefault(); setIsHelpOpen((p) => !p); return true; }
      if (match("toggleSearch")) { e.preventDefault(); onToggleSearch(); return true; }
      if (match("togglePlaylist")) { e.preventDefault(); onTogglePlaylist(); return true; }

      if (match("playPause")) { e.preventDefault(); onPlayPause(); return true; }
      if (match("next")) { e.preventDefault(); onNext(); return true; }
      if (match("prev")) { e.preventDefault(); onPrev(); return true; }
      if (match("toggleMode")) { e.preventDefault(); onToggleMode(); return true; }
      if (match("toggleVolumePanel")) { e.preventDefault(); onToggleVolumeDialog(); return true; }
      if (match("toggleSpeedPanel")) { e.preventDefault(); onToggleSpeedDialog(); return true; }
      if (match("volumeUp")) { e.preventDefault(); onVolumeChange(Math.min(volume + 0.1, 1)); return true; }
      if (match("volumeDown")) { e.preventDefault(); onVolumeChange(Math.max(volume - 0.1, 0)); return true; }
      if (match("seekForward")) { e.preventDefault(); onSeek(Math.min(currentTime + 5, duration)); return true; }
      if (match("seekBackward")) { e.preventDefault(); onSeek(Math.max(currentTime - 5, 0)); return true; }

      return false;
    },
    50,
    true,
  );

  if (!isVisible) return null;

  return (
    <>
      {/* Settings Panel */}
      <ShortcutSettings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onBindingsChanged={handleBindingsChanged}
      />

      {/* Help Dialog */}
      {isHelpOpen && (
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4 select-none font-sans pointer-events-none">
            <style>{`
              @keyframes ios-in {
                0% { opacity: 0; transform: scale(0.95); }
                100% { opacity: 1; transform: scale(1); }
              }
              @keyframes ios-out {
                0% { opacity: 1; transform: scale(1); }
                100% { opacity: 0; transform: scale(0.95); }
              }
              .animate-help-in { animation: ios-in 0.2s cubic-bezier(0.32, 0.72, 0, 1) forwards; }
            `}</style>

            <div
              className="absolute inset-0 bg-black/20 backdrop-blur-sm pointer-events-auto"
              onClick={() => setIsHelpOpen(false)}
            />

            <div className="
              relative w-full max-w-2xl pointer-events-auto
              bg-black/40 backdrop-blur-2xl saturate-150
              border border-white/10
              rounded-[32px]
              shadow-[0_30px_80px_rgba(0,0,0,0.45)]
              overflow-hidden text-white
              animate-help-in
            ">
              <div className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold tracking-tight">{dict.keys.title}</h2>
                    <p className="text-white/50 font-medium">{dict.keys.subtitle}</p>
                  </div>
                  <button
                    onClick={() => { setIsHelpOpen(false); reloadBindings(); setIsSettingsOpen(true); }}
                    className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors text-white/60 hover:text-white"
                    title="自定义快捷键"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M13.5 8a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Z" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M8 10.5V8m0-3h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => setIsHelpOpen(false)}
                    className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M1 1L11 11M1 11L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                  {bindings.map((b) => (
                    <ShortcutItem key={b.action} keys={formatComboDisplay(b.combo)} label={b.label} />
                  ))}
                </div>

                {/* Media Session hint */}
                <div className="mt-6 p-3 rounded-xl bg-white/5 border border-white/5 text-xs text-white/40">
                  💡 系统级快捷键（游戏中也有效）：键盘媒体键 ▶⏯ ⏭ ⏮
                </div>

                <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-white/30 text-xs">
                  <span>{dict.keys.press} <kbd className="bg-white/10 px-1.5 py-0.5 rounded mx-1 text-white/60">Esc</kbd> {dict.keys.close}</span>
                  <button
                    onClick={() => { setIsHelpOpen(false); reloadBindings(); setIsSettingsOpen(true); }}
                    className="text-white/40 hover:text-white/70 transition-colors flex items-center gap-1"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="opacity-60">
                      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
                      <path d="M7 4.5v4m0 1h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                    自定义快捷键
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      )}
    </>
  );
};

const ShortcutItem = ({ keys, label }: { keys: string[]; label: string }) => (
  <div className="flex items-center justify-between group p-2 rounded-xl hover:bg-white/5 transition-colors">
    <span className="text-white/70 font-medium group-hover:text-white transition-colors">
      {label}
    </span>
    <div className="flex gap-1">
      {keys.map((k, i) => (
        <kbd
          key={i}
          className="min-w-[28px] h-7 px-2 flex items-center justify-center bg-white/10 border border-white/5 rounded-[8px] text-sm font-semibold text-white/90 shadow-sm"
        >
          {k}
        </kbd>
      ))}
    </div>
  </div>
);

export default KeyboardShortcuts;
