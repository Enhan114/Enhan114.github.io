/**
 * Customisable keyboard shortcut settings.
 *
 * Shortcuts are persisted in localStorage.  Each shortcut is a
 * human-readable key-combo string (e.g. "Space", "Ctrl+ArrowRight").
 *
 * Media Session API shortcuts (system-wide, work even in games):
 *   Play/Pause, Next, Previous, SeekForward(10s), SeekBackward(10s)
 * These are always available system-wide when the browser has an
 * active audio session — no configuration needed.
 */

const STORAGE_KEY = "aura:shortcuts";

export interface ShortcutDef {
  id: string;
  label: string;
  /** Current key combo string */
  combo: string;
  /** Default combo (used for reset) */
  defaultCombo: string;
}

export type ShortcutAction =
  | "playPause"
  | "next"
  | "prev"
  | "seekForward"
  | "seekBackward"
  | "volumeUp"
  | "volumeDown"
  | "toggleMode"
  | "togglePlaylist"
  | "toggleSearch"
  | "toggleShortcuts"
  | "toggleVolumePanel"
  | "toggleSpeedPanel";

export interface ShortcutBinding {
  action: ShortcutAction;
  label: string;
  /** Current key combo, e.g. "Space" or "Ctrl+ArrowRight" */
  combo: string;
  defaultCombo: string;
}

const DEFAULTS: ShortcutBinding[] = [
  { action: "playPause",        label: "播放 / 暂停",        combo: "Space",         defaultCombo: "Space" },
  { action: "next",             label: "下一首",             combo: "Ctrl+ArrowRight", defaultCombo: "Ctrl+ArrowRight" },
  { action: "prev",             label: "上一首",             combo: "Ctrl+ArrowLeft",  defaultCombo: "Ctrl+ArrowLeft" },
  { action: "seekForward",      label: "快进 5 秒",          combo: "ArrowRight",    defaultCombo: "ArrowRight" },
  { action: "seekBackward",     label: "后退 5 秒",          combo: "ArrowLeft",     defaultCombo: "ArrowLeft" },
  { action: "volumeUp",         label: "音量增大",           combo: "ArrowUp",       defaultCombo: "ArrowUp" },
  { action: "volumeDown",       label: "音量减小",           combo: "ArrowDown",     defaultCombo: "ArrowDown" },
  { action: "toggleMode",       label: "切换播放模式",        combo: "L",             defaultCombo: "L" },
  { action: "togglePlaylist",   label: "播放列表",           combo: "Ctrl+P",        defaultCombo: "Ctrl+P" },
  { action: "toggleSearch",     label: "搜索",               combo: "Ctrl+K",        defaultCombo: "Ctrl+K" },
  { action: "toggleShortcuts",  label: "快捷键帮助",          combo: "Ctrl+/",        defaultCombo: "Ctrl+/" },
  { action: "toggleVolumePanel",label: "音量面板",            combo: "V",             defaultCombo: "V" },
  { action: "toggleSpeedPanel", label: "倍速面板",            combo: "S",             defaultCombo: "S" },
];

export const getDefaultBindings = (): ShortcutBinding[] =>
  DEFAULTS.map((d) => ({ ...d }));

export const loadBindings = (): ShortcutBinding[] => {
  if (typeof window === "undefined") return getDefaultBindings();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultBindings();
    const saved: ShortcutBinding[] = JSON.parse(raw);
    // Merge saved over defaults so new shortcuts added in updates appear
    return DEFAULTS.map((d) => {
      const match = saved.find((s) => s.action === d.action);
      return match ? { ...d, combo: match.combo } : { ...d };
    });
  } catch {
    return getDefaultBindings();
  }
};

export const saveBindings = (bindings: ShortcutBinding[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch { /* quota exceeded — silently ignore */ }
};

export const resetBindings = (): ShortcutBinding[] => {
  const defaults = getDefaultBindings();
  saveBindings(defaults);
  return defaults;
};

// ---------------------------------------------------------------------------
//  Key-combo parser & matcher
// ---------------------------------------------------------------------------

export interface ParsedCombo {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string; // normalised: " "→"Space", "ArrowRight"→"ArrowRight", etc.
}

const KEY_ALIASES: Record<string, string> = {
  " ": "Space",
  "Spacebar": "Space",
  "ArrowUp": "ArrowUp",
  "Up": "ArrowUp",
  "ArrowDown": "ArrowDown",
  "Down": "ArrowDown",
  "ArrowLeft": "ArrowLeft",
  "Left": "ArrowLeft",
  "ArrowRight": "ArrowRight",
  "Right": "ArrowRight",
  "Escape": "Escape",
  "Esc": "Escape",
};

const normaliseKey = (key: string): string => {
  return KEY_ALIASES[key] ?? (key.length === 1 ? key : key);
};

export const parseCombo = (combo: string): ParsedCombo => {
  const parts = combo.split("+");
  const ctrl = parts.includes("Ctrl");
  const alt = parts.includes("Alt");
  const shift = parts.includes("Shift");
  const meta = parts.includes("Meta") || parts.includes("Cmd");
  const keyPart = parts.filter((p) => !["Ctrl", "Alt", "Shift", "Meta", "Cmd"].includes(p)).join("+");
  return { ctrl, alt, shift, meta, key: normaliseKey(keyPart) };
};

export const comboToString = (parsed: ParsedCombo): string => {
  const mods: string[] = [];
  if (parsed.ctrl) mods.push("Ctrl");
  if (parsed.alt) mods.push("Alt");
  if (parsed.shift) mods.push("Shift");
  if (parsed.meta) mods.push("Meta");
  mods.push(parsed.key);
  return mods.join("+");
};

export const eventMatchesCombo = (e: KeyboardEvent, combo: string): boolean => {
  const parsed = parseCombo(combo);
  if (e.ctrlKey !== parsed.ctrl) return false;
  if (e.altKey !== parsed.alt) return false;
  if (e.shiftKey !== parsed.shift) return false;
  if (e.metaKey !== parsed.meta) return false;
  return normaliseKey(e.key) === parsed.key;
};

export const formatComboDisplay = (combo: string): string[] => {
  const parsed = parseCombo(combo);
  const parts: string[] = [];
  if (parsed.ctrl) parts.push("Ctrl");
  if (parsed.alt) parts.push("Alt");
  if (parsed.shift) parts.push("Shift");
  if (parsed.meta) parts.push("⌘");
  const displayKey = parsed.key === "Space" ? "␣" : parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key;
  parts.push(displayKey);
  return parts;
};
