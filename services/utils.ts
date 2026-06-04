import { getPalette } from "colorthief";
import jsmediatags from "jsmediatags/dist/jsmediatags.min.js";

import { LyricLine } from "../types";
import { parseLyrics } from "./lyrics";
import { loadImageElementWithCache } from "./cache";

export const formatTime = (seconds: number): string => {
  if (isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export const shuffleArray = <T>(array: T[]): T[] => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

// Helper to request via CORS proxy (api.allorigins.win is reliable for GET requests)
// Try direct request first, fallback to proxy if CORS fails
export const fetchViaProxy = async (targetUrl: string): Promise<any> => {
  let text: string;

  // 1. Try direct request first
  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(
        `Direct fetch failed with status: ${response.status} ${targetUrl}`,
      );
    }
    text = await response.text();
    return JSON.parse(text);
  } catch (directError) {
    // 2. Direct request failed (likely CORS), try proxy
    console.warn(
      "Direct fetch failed (likely CORS), trying proxy:",
      directError,
    );

    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`Proxy fetch failed with status: ${response.status}`);
      }
      text = await response.text();
      return JSON.parse(text);
    } catch (proxyError) {
      console.error(
        "Both direct and proxy requests failed:",
        proxyError,
        targetUrl,
      );
      throw proxyError;
    }
  }
};

export const parseNeteaseLink = (
  input: string,
): { type: "song" | "playlist"; id: string } | null => {
  try {
    const url = new URL(input);
    const params = new URLSearchParams(url.search);
    // Handle music.163.com/#/song?id=... (Hash router)
    if (url.hash.includes("/song") || url.hash.includes("/playlist")) {
      const hashParts = url.hash.split("?");
      if (hashParts.length > 1) {
        const hashParams = new URLSearchParams(hashParts[1]);
        const id = hashParams.get("id");
        if (id) {
          if (url.hash.includes("/song")) return { type: "song", id };
          if (url.hash.includes("/playlist")) return { type: "playlist", id };
        }
      }
    }
    // Handle standard params
    const id = params.get("id");
    if (id) {
      if (url.pathname.includes("song")) return { type: "song", id };
      if (url.pathname.includes("playlist")) return { type: "playlist", id };
    }
    return null;
  } catch (e) {
    return null;
  }
};

/**
 * @deprecated Use parseLyrics from services/lyrics instead
 */
export const parseLrc = (
  lrcContent: string,
  translationContent?: string,
): LyricLine[] => {
  return parseLyrics(lrcContent, translationContent);
};

/**
 * @deprecated Use parseLyrics from services/lyrics instead
 */
export const mergeLyrics = (original: string, translation: string): string => {
  return original + "\n" + translation;
};

// Metadata Parser using jsmediatags
export const parseAudioMetadata = (
  file: File,
): Promise<{
  title?: string;
  artist?: string;
  picture?: string;
  lyrics?: string;
}> => {
  return new Promise((resolve) => {
    try {
      jsmediatags.read(file, {
        onSuccess: (tag) => {
          try {
            const tags = tag.tags;
            let pictureUrl = undefined;
            let lyricsText = undefined;

            if (tags.picture) {
              const { data, format } = tags.picture;
              let base64String = "";
              const len = data.length;
              for (let i = 0; i < len; i++) {
                base64String += String.fromCharCode(data[i]);
              }
              pictureUrl = `data:${format};base64,${window.btoa(base64String)}`;
            }

            // Extract embedded lyrics (USLT tag for unsynchronized lyrics)
            // Some formats also use "lyrics" or "LYRICS" tag
            if (tags.USLT) {
              // USLT can be an object with lyrics.text or just a string
              lyricsText =
                typeof tags.USLT === "object"
                  ? tags.USLT.lyrics || tags.USLT.text
                  : tags.USLT;
            } else if (tags.lyrics) {
              lyricsText = tags.lyrics;
            } else if (tags.LYRICS) {
              lyricsText = tags.LYRICS;
            }

            resolve({
              title: tags.title,
              artist: tags.artist,
              picture: pictureUrl,
              lyrics: lyricsText,
            });
          } catch (innerErr) {
            console.error("Error parsing tags structure:", innerErr);
            resolve({});
          }
        },
        onError: (error) => {
          console.warn("Error reading tags:", error);
          resolve({});
        },
      });
    } catch (err) {
      console.error("jsmediatags crashed:", err);
      resolve({});
    }
  });
};

const colorLum = (rgb: number[]) => {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
};

const colorSat = (rgb: number[]) => {
  return Math.max(...rgb) - Math.min(...rgb);
};

const colorDist = (a: number[], b: number[]) => {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
};

const colorScore = (rgb: number[]) => {
  const lum = colorLum(rgb);
  const sat = colorSat(rgb);
  const balance = 1 - Math.min(1, Math.abs(lum - 140) / 140);
  return sat * 0.7 + balance * 90;
};

export const extractColors = async (imageSrc: string): Promise<string[]> => {
  try {
    const img = await loadImageElementWithCache(imageSrc);
    const colors = await getPalette(img, { colorCount: 20 });
    const palette = colors?.map((item) => item.array()) ?? [];

    if (!palette || palette.length === 0) {
      return [];
    }

    const filtered = palette.filter((rgb) => {
      const lum = colorLum(rgb);
      const sat = colorSat(rgb);
      if (lum < 20) return false;
      if (lum > 240 && sat < 30) return false;
      if (sat < 15 && lum > 200) return false;
      return true;
    });

    const candidates = filtered.length >= 6 ? filtered : palette;

    // Sort by vibrance and contrast score
    const ranked = candidates.slice().sort((a: number[], b: number[]) => colorScore(b) - colorScore(a));

    const picked: number[][] = [];
    // Pass 1: Strict distance for max diversity
    for (const rgb of ranked) {
      if (picked.some((item) => colorDist(item, rgb) < 1400)) continue;
      picked.push(rgb);
    }

    // Pass 2: Lower distance threshold if we don't have enough colors
    if (picked.length < 8) {
      for (const rgb of ranked) {
        if (picked.includes(rgb)) continue;
        if (picked.some((item) => colorDist(item, rgb) < 400)) continue;
        picked.push(rgb);
        if (picked.length >= 8) break;
      }
    }

    // Pass 3: Just add remaining colors if we are still desperate
    if (picked.length < 6) {
      for (const rgb of palette) {
        if (picked.includes(rgb)) continue;
        picked.push(rgb);
        if (picked.length >= 6) break;
      }
    }

    console.log(picked);

    // Return the top ~10 diverse colors
    return picked.slice(0, 10).map((c: number[]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`);
  } catch (err) {
    console.warn("Color extraction failed", err);
    return [];
  }
};
