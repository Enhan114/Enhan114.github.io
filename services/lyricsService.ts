import { fetchViaProxy } from "./utils";
import { isMetadataLine } from "./lyrics/types";

const NETEASE_API = "https://api-enhanced-ten-delta.vercel.app";
const TTML_DB_BASE = "https://amll-ttml-db.stevexmh.net";

const TIMESTAMP_REGEX = /^\[(\d{2}):(\d{2})(?:[\.:](\d{2,3}))?\](.*)$/;

interface NeteaseApiArtist {
  name?: string;
}

interface NeteaseApiAlbum {
  name?: string;
  picUrl?: string;
}

interface NeteaseApiSong {
  id: number;
  name?: string;
  ar?: NeteaseApiArtist[];
  al?: NeteaseApiAlbum;
  dt?: number;
}

interface NeteaseSearchResponse {
  result?: {
    songs?: NeteaseApiSong[];
  };
}

interface NeteasePlaylistResponse {
  songs?: NeteaseApiSong[];
}

interface NeteaseSongDetailResponse {
  code?: number;
  songs?: NeteaseApiSong[];
}

export interface MatchedLyricsResult {
  lrc?: string;
  yrc?: string;
  tLrc?: string;
  ttml?: string;
  metadata: string[];
  /** Best-match artist from NetEase search (corrects filename guesses) */
  matchedArtist?: string;
  matchedTitle?: string;
  matchedAlbum?: string;
  /** NetEase song ID — once cached, future plays use fetchLyricsById directly */
  matchedNeteaseId?: string;
}

export interface NeteaseTrackInfo {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  duration?: number;
  isNetease: true;
  neteaseId: string;
}

type SearchOptions = {
  limit?: number;
  offset?: number;
};

const formatArtists = (artists?: NeteaseApiArtist[]) =>
  (artists ?? [])
    .map((artist) => artist.name?.trim())
    .filter(Boolean)
    .join("/") || "";

const mapNeteaseSongToTrack = (song: NeteaseApiSong): NeteaseTrackInfo => ({
  id: song.id.toString(),
  title: song.name?.trim() ?? "",
  artist: formatArtists(song.ar),
  album: song.al?.name?.trim() ?? "",
  coverUrl: song.al?.picUrl?.replaceAll("http:", "https:"),
  duration: song.dt,
  isNetease: true,
  neteaseId: song.id.toString(),
});

const isMetadataTimestampLine = (line: string): boolean => {
  const trimmed = line.trim();
  const match = trimmed.match(TIMESTAMP_REGEX);
  if (!match) return false;
  const content = match[4].trim();
  return isMetadataLine(content);
};

const parseTimestampMetadata = (line: string) => {
  const match = line.trim().match(TIMESTAMP_REGEX);
  return match ? match[4].trim() : line.trim();
};

const isMetadataJsonLine = (line: string): boolean => {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false;
  try {
    const json = JSON.parse(trimmed);
    // In NetEase lyric payloads, JSON lines are credit metadata entries.
    return Boolean(json.c && Array.isArray(json.c));
  } catch {
    // ignore invalid json
  }
  return false;
};

const parseJsonMetadata = (line: string) => {
  try {
    const json = JSON.parse(line.trim());
    if (json.c && Array.isArray(json.c)) {
      return json.c
        .map((item: any) => item.tx || "")
        .join("")
        .trim();
    }
  } catch {
    // ignore
  }
  return line.trim();
};

const extractMetadataLines = (content: string) => {
  const metadataSet = new Set<string>();
  const bodyLines: string[] = [];

  content.split("\n").forEach((line) => {
    if (!line.trim()) return;
    if (isMetadataTimestampLine(line)) {
      metadataSet.add(parseTimestampMetadata(line));
    } else if (isMetadataJsonLine(line)) {
      metadataSet.add(parseJsonMetadata(line));
    } else {
      bodyLines.push(line);
    }
  });

  return {
    clean: bodyLines.join("\n").trim(),
    metadata: Array.from(metadataSet),
  };
};

const TTML_META_LABELS: Record<string, string> = {
  musicName: "歌曲名",
  artists: "艺术家",
  album: "专辑",
  ttmlAuthorGithubLogin: "TTML 歌词贡献者",
};

const TTML_AUTHOR_KEY = "ttmlAuthorGithubLogin";
const TTML_SOURCE_TEXT = "TTML 歌词来源: AMLL TTML Database";
const TTML_META_KEYS = Object.keys(TTML_META_LABELS);
const TTML_DISPLAY_KEYS = TTML_META_KEYS.filter((key) => key !== TTML_AUTHOR_KEY);
const HAN_REGEX = /\p{Script=Han}/u;
const KANA_REGEX = /\p{Script=Hiragana}|\p{Script=Katakana}/u;
const HANGUL_REGEX = /\p{Script=Hangul}/u;
const LATIN_REGEX = /[A-Za-z]/;
const NETEASE_CONTRIBUTOR_REGEX = /^(歌词贡献者|翻译贡献者)\s*[:：]/;
const TTML_CONTRIBUTOR_REGEX = /^TTML 歌词贡献者\s*[:：]/;

const BAD_META_HINTS = [
  "instrumental",
  "伴奏",
  "和声伴奏",
  "和聲伴奏",
  "harmonic accompaniment",
  "オフボーカル",
  "화음 반주",
  "single",
  "单曲",
  "單曲",
];

const chineseRankOf = (lang?: string): number | null => {
  const value = lang?.trim().toLowerCase();
  if (!value) return null;
  if (!/^zh(?:-|$)/.test(value)) return null;
  if (/^zh(?:-hans|-cn|-sg)/.test(value)) return 0;
  if (value === "zh") return 1;
  if (/^zh(?:-hant|-tw|-hk|-mo)/.test(value)) return 2;
  return 1;
};

const hasHan = (value: string): boolean => {
  return HAN_REGEX.test(value);
};

const looksChinese = (value: string): boolean => {
  if (!hasHan(value)) return false;
  if (KANA_REGEX.test(value)) return false;
  if (HANGUL_REGEX.test(value)) return false;
  return true;
};

const scoreMeta = (value: string): number => {
  const text = value.trim();
  if (!text) return Number.POSITIVE_INFINITY;

  let score = text.length;

  if (!looksChinese(text)) score += 100;
  if (LATIN_REGEX.test(text)) score += 20;

  const lower = text.toLowerCase();
  BAD_META_HINTS.forEach((hint) => {
    if (lower.includes(hint)) {
      score += 30;
    }
  });

  return score;
};

const pickMeta = (key: string, list: string[]): string | undefined => {
  const uniq = list.filter((value, idx, arr) => arr.indexOf(value) === idx);
  if (uniq.length === 0) return undefined;

  if (key === "ttmlAuthorGithubLogin") {
    return uniq[0];
  }

  const best = uniq
    .map((value) => ({ value, score: scoreMeta(value) }))
    .sort((a, b) => a.score - b.score)[0];

  if (!best || !Number.isFinite(best.score) || best.score >= 100) {
    return undefined;
  }

  return best.value;
};

const parseXmlAttrs = (value: string): Record<string, string> => {
  const attrs: Record<string, string> = {};
  const regex = /([:\w-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(value)) !== null) {
    attrs[match[1]] = match[2]
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }

  return attrs;
};

export const extractTtmlMetadata = (content?: string): string[] => {
  if (!content) return [];

  const groups = new Map<string, string[]>();
  const regex = /<amll:meta\b([^>]*)\/>/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const attrs = parseXmlAttrs(match[1]);
    const key = attrs.key?.trim();
    const value = attrs.value?.trim();
    if (!key || !value || !TTML_META_KEYS.includes(key)) continue;

    const list = groups.get(key) ?? [];
    list.push(value);
    groups.set(key, list);
  }

  const meta: string[] = [];

  TTML_DISPLAY_KEYS.forEach((key) => {
    const list = groups.get(key);
    if (!list?.length) return;

    const value = pickMeta(key, list);
    if (!value) return;
    meta.push(`${TTML_META_LABELS[key]}: ${value}`);
  });

  const author = groups.get(TTML_AUTHOR_KEY);
  const contributor = author?.length
    ? pickMeta(TTML_AUTHOR_KEY, author)
    : undefined;

  if (meta.length > 0 || contributor) meta.push(TTML_SOURCE_TEXT);
  if (contributor) {
    meta.push(`${TTML_META_LABELS[TTML_AUTHOR_KEY]}: ${contributor}`);
  }

  return meta;
};

const isNeteaseContributor = (text: string): boolean => {
  return NETEASE_CONTRIBUTOR_REGEX.test(text.trim());
};

const hasTtmlContributor = (list: string[]): boolean => {
  return list.some((text) => TTML_CONTRIBUTOR_REGEX.test(text.trim()));
};

export const mergeMetadata = (input: {
  lrc?: string[];
  yrc?: string[];
  translation?: string[];
  ttml?: string[];
  lyricUser?: string;
  transUser?: string;
}): string[] => {
  const ttml = input.ttml ?? [];
  const keepNeteaseContributors = !hasTtmlContributor(ttml);
  const filter = keepNeteaseContributors
    ? (text: string) => Boolean(text.trim())
    : (text: string) => Boolean(text.trim()) && !isNeteaseContributor(text);
  const meta = new Set<string>([
    ...(input.lrc ?? []).filter(filter),
    ...(input.yrc ?? []).filter(filter),
    ...(input.translation ?? []).filter(filter),
    ...ttml,
  ]);

  if (keepNeteaseContributors && input.transUser?.trim()) {
    meta.add(`翻译贡献者: ${input.transUser.trim()}`);
  }

  if (keepNeteaseContributors && input.lyricUser?.trim()) {
    meta.add(`歌词贡献者: ${input.lyricUser.trim()}`);
  }

  return Array.from(meta);
};

export const getNeteaseAudioUrl = (id: string) => {
  return `${METING_API}?type=url&id=${id}`;
};

/**
 * Fetch lyrics from AMLL TTML DB via Service Worker proxy.
 * The SW proxies /api/amll/ncm/:id → amll-ttml-db.stevexmh.net/ncm/:id
 * This server returns TTML (word-timed) for some songs, LRC for others.
 * Highest priority — no CORS, same origin, word-level timing when available.
 */
const fetchAmllLyrics = async (id: string): Promise<string | null> => {
  const proxyPath = `/api/amll/ncm/${encodeURIComponent(id)}`;
  try {
    const res = await fetch(proxyPath);
    if (!res.ok) {
      if (res.status !== 404) console.warn("[AMLL] fetch failed", res.status, id);
      return null;
    }
    const text = await res.text();
    if (!text.trim()) return null;
    // Check if it's TTML (XML) or LRC (plain text) by looking at first char
    console.log(`[AMLL] got lyrics for ${id} (${text.trim().startsWith("<?xml") ? "TTML" : "LRC"}, ${text.length} chars)`);
    return text;
  } catch (e) {
    console.warn("[AMLL] proxy fetch failed:", (e as Error).message);
    return null;
  }
};

// ── LRCLIB: open-source lyrics database ──
interface LrclibTrack {
  id: number;
  name: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  plainLyrics?: string;
  syncedLyrics?: string;
}

const searchLrclib = async (title: string, artist: string): Promise<LrclibTrack[]> => {
  const q = encodeURIComponent(`${artist} ${title}`.trim());
  try {
    const res = await fetch(`${LRCLIB_BASE}/search?q=${q}`);
    if (!res.ok) return [];
    return (await res.json()) as LrclibTrack[];
  } catch {
    return [];
  }
};

const fetchLrclibById = async (id: number): Promise<LrclibTrack | null> => {
  try {
    const res = await fetch(`${LRCLIB_BASE}/get/${id}`);
    if (!res.ok) return null;
    return (await res.json()) as LrclibTrack;
  } catch {
    return null;
  }
};

/**
 * Try LRCLIB as a third lyrics source.
 * Returns a MatchedLyricsResult-compatible object, or null.
 */
const tryLrclib = async (
  title: string,
  artist: string,
  durationSec?: number,
): Promise<MatchedLyricsResult | null> => {
  try {
    const tracks = await searchLrclib(title, artist);
    if (tracks.length === 0) return null;

    // Pick best match: prefer duration-matched, then first result
    let best = tracks[0];
    if (durationSec && durationSec > 0) {
      let bestDiff = Infinity;
      for (const t of tracks) {
        if (!t.duration || t.duration <= 0) continue;
        const diff = Math.abs(t.duration - durationSec);
        if (diff < bestDiff) { bestDiff = diff; best = t; }
      }
      if (!Number.isFinite(bestDiff) || bestDiff > 15) best = tracks[0];
    }

    // Need full lyrics — fetch by ID
    const full = await fetchLrclibById(best.id);
    if (!full || (!full.syncedLyrics && !full.plainLyrics)) return null;

    console.log(`[LRCLIB] lyrics found: ${full.name} by ${full.artistName}`);

    const lrcContent = full.syncedLyrics ?? full.plainLyrics ?? "";
    return {
      lrc: lrcContent,
      yrc: undefined,
      tLrc: undefined,
      ttml: undefined,
      metadata: [],
      matchedArtist: full.artistName,
      matchedTitle: full.name,
      matchedAlbum: full.albumName,
    };
  } catch (e) {
    console.warn("[LRCLIB] search/fetch failed:", e);
    return null;
  }
};

/**
 * Search NetEase via multiple proxy fallbacks.
 * We need the NetEase song ID to fetch TTML and other lyrics.
 */
export const searchNetEase = async (
  keyword: string,
  options: SearchOptions = {},
): Promise<NeteaseTrackInfo[]> => {
  const url = `${NETEASE_API}/search?keywords=${encodeURIComponent(keyword)}&type=1&limit=${limit}&offset=${offset}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.result?.songs ?? []).map(mapNeteaseSongToTrack);
  } catch (err) {
    console.warn("[NetEase] search failed:", (err as Error).message);
    return [];
  }
};

export const fetchNeteasePlaylist = async (
  playlistId: string,
): Promise<NeteaseTrackInfo[]> => {
  try {
    // 使用網易雲音樂 API 獲取歌單所有歌曲
    // 由於接口限制，需要分頁獲取，每次獲取 50 首
    const allTracks: NeteaseTrackInfo[] = [];
    const limit = 50;
    let offset = 0;
    let shouldContinue = true;

    while (shouldContinue) {
      const url = `${NETEASE_API}/playlist/track/all?id=${playlistId}&limit=${limit}&offset=${offset}`;
      const res = await fetch(url);
      if (!res.ok) break;
      const data = (await res.json()) as NeteasePlaylistResponse;
      const songs = data.songs ?? [];
      if (songs.length === 0) {
        break;
      }

      const tracks = songs.map(mapNeteaseSongToTrack);

      allTracks.push(...tracks);

      // Continue fetching if the current page was full
      if (songs.length < limit) {
        shouldContinue = false;
      } else {
        offset += limit;
      }
    }

    return allTracks;
  } catch (e) {
    console.error("Playlist fetch error", e);
    return [];
  }
};

export const fetchNeteaseSong = async (
  songId: string,
): Promise<NeteaseTrackInfo | null> => {
  try {
    const url = `${NETEASE_API}/song/detail?ids=${songId}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as NeteaseSongDetailResponse;
    const track = data.songs?.[0];
    if (data.code === 200 && track) {
      return mapNeteaseSongToTrack(track);
    }
    return null;
  } catch (e) {
    console.error("Song fetch error", e);
    return null;
  }
};

// Keeps the old search for lyric matching fallbacks
export const searchAndMatchLyrics = async (
  title: string,
  artist: string,
  durationSec?: number,
): Promise<MatchedLyricsResult | null> => {
  try {
    const songs = await searchNetEase(`${title} ${artist}`, { limit: 10 });
    if (songs.length === 0) {
      console.warn("[Lyrics] No cloud results");
      return null;
    }

    let bestSong = songs[0];
    if (durationSec && durationSec > 0) {
      let bestDiff = Infinity;
      for (const s of songs) {
        const neteaseSec = (s.duration ?? 0) / 1000;
        if (neteaseSec <= 0) continue;
        const diff = Math.abs(neteaseSec - durationSec);
        if (diff < bestDiff) { bestDiff = diff; bestSong = s; }
      }
    }

    console.log(`Matched Song ID: ${bestSong.id} — ${bestSong.name}`);
    const lyrics = await fetchLyricsById(bestSong.id);
    if (lyrics) {
      lyrics.matchedArtist = bestSong.artist;
      lyrics.matchedTitle = bestSong.name;
      lyrics.matchedAlbum = bestSong.album;
      lyrics.matchedNeteaseId = bestSong.id;
    }
    return lyrics;
  } catch (error) {
    console.error("Cloud lyrics match failed:", error);
    return null;
  }
};

export const fetchLyricsById = async (
  songId: string,
): Promise<MatchedLyricsResult | null> => {
  try {
    const url = `${NETEASE_API}/lyric?id=${encodeURIComponent(songId)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const rawLrc: string | undefined = data?.lrc?.lyric;
    const rawTLrc: string | undefined = data?.tlyric?.lyric;
    if (!rawLrc && !rawTLrc) return null;
    return { lrc: rawLrc, tLrc: rawTLrc?.trim() || undefined, metadata: [] };
  } catch {
    return null;
  }
};
