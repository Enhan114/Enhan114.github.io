import { Song } from "../types";
import { parseLyrics } from "./lyrics";
import { parseAudioMetadataFromUrl, extractColors } from "./utils";
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
    let coverUrl: string | undefined;
    let colors: string[] = [];

    // Try to extract embedded cover art and metadata from the audio file
    try {
      const metadata = await parseAudioMetadataFromUrl(fileUrl);
      if (metadata.picture) {
        coverUrl = metadata.picture;
        colors = await extractColors(coverUrl);
      }
      // If embedded lyrics exist and no external lyrics file was matched,
      // use the embedded lyrics
      if (metadata.lyrics && metadata.lyrics.trim().length > 0 && !item.lyricsPath) {
        lyrics = parseLyrics(metadata.lyrics);
        needsLyricsMatch = false;
      }
    } catch (error) {
      console.warn("Failed to extract metadata from static song:", item.title, error);
    }

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
      coverUrl,
      lyrics,
      needsLyricsMatch,
      colors: colors.length > 0 ? colors : [],
    });
  }

  return songs;
};
