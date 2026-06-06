/**
 * Lyrics colour settings — persisted in localStorage.
 *
 * The palette is a curated set of colours that look good on the dark
 * background.  Users pick one from the grid; the active line fill and
 * past/future opacities are derived automatically.
 */

const STORAGE_KEY = "aura:lyrics-color";

export interface LyricsColor {
  /** Hex colour, e.g. "#FFFFFF" */
  hex: string;
  label: string;
}

/** Curated palette — all colours are tested on the dark background. */
export const COLOR_PALETTE: LyricsColor[] = [
  { hex: "#FFFFFF", label: "纯白" },
  { hex: "#F5F0E8", label: "暖白" },
  { hex: "#E8F0FF", label: "冷白" },
  { hex: "#FFD700", label: "金色" },
  { hex: "#FFA07A", label: "暖橙" },
  { hex: "#FF6B8A", label: "桃红" },
  { hex: "#FF8C69", label: "珊瑚" },
  { hex: "#98FB98", label: "嫩绿" },
  { hex: "#87CEEB", label: "天蓝" },
  { hex: "#DDA0DD", label: "淡紫" },
  { hex: "#FFB6C1", label: "浅粉" },
  { hex: "#E6E6FA", label: "薰衣草" },
];

const DEFAULT_COLOR = "#FFFFFF";

export const getLyricsColor = (): string => {
  if (typeof window === "undefined") return DEFAULT_COLOR;
  try {
    return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_COLOR;
  } catch {
    return DEFAULT_COLOR;
  }
};

export const setLyricsColor = (hex: string) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, hex);
  } catch { /* quota */ }
};

/**
 * Derive the past-state (fully filled) colour from the base colour.
 * Returns a CSS colour string suitable for fillStyle.
 */
export const activeLyricsColor = (): string => {
  return getLyricsColor();
};

export const pastLyricsColor = (): string => {
  return getLyricsColor();
};

/**
 * Derive the future-state (dim) colour — same hue, lower opacity.
 */
export const futureLyricsColor = (alpha = 0.5): string => {
  const hex = getLyricsColor();
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
