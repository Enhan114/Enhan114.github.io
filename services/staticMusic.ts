import { Song } from "../types";
import { parseLyrics } from "./lyrics";
import manifest from "virtual:music-manifest";

const baseUrl = import.meta.env.BASE_URL ?? "/";
const normalizeBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

const resolveAssetUrl = (filePath: string): string => {
  return `${normalizeBaseUrl}${filePath}`;
};

export const loadStaticSongs = async (): Promise<Song[]> => {
  const songs: Song[] = [];

  for (const item of manifest) {
    const fileUrl = resolveAssetUrl(item.filePath);
    let lyrics;
    let needsLyricsMatch = true;

    if (item.lyricsPath) {
      try {
        const lyricsUrl = resolveAssetUrl(item.lyricsPath);
        const response = await fetch(lyricsUrl);
        if (response.ok) {
          const text = await response.text();
          if (text.trim().length > 0) {
            lyrics = parseLyrics(text);
            needsLyricsMatch = false;
          }
        }
      } catch (error) {
        console.warn("Failed to load static lyrics file:", item.lyricsPath, error);
      }
    }

    songs.push({
      id: item.id,
      title: item.title,
      artist: item.artist,
      fileUrl,
      origin: fileUrl,
      source: "remote",
      lyrics,
      needsLyricsMatch,
      colors: [],
    });
  }

  return songs;
};
