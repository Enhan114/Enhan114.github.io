import { fetchViaProxy } from "./utils";
import { isMetadataLine } from "./lyrics/types";

const LYRIC_API_BASE = "https://zm.wwoyun.cn";
const METING_API = "https://api.qijieya.cn/meting/";
const NETEASE_SEARCH_API = "https://zm.wwoyun.cn/cloudsearch";
const NETEASE_API_BASE = "http://music.163.com/api";
const NETEASECLOUD_API_BASE = "https://zm.wwoyun.cn";
const TTML_DB_BASE = "https://amll-ttml-db.stevexmh.net";
const LRCLIB_BASE = "https://lrclib.net/api";

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
 * Fetch TTML lyrics through multiple CORS proxy fallbacks.
 * TTML is the highest-quality format (word-level timing).
 */
const fetchTtmlByNeteaseId = async (id: string): Promise<string | null> => {
  const ttmlUrl = `${TTML_DB_BASE}/ncm/${encodeURIComponent(id)}`;

  const tryFetch = async (url: string): Promise<string | null> => {
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status !== 404) console.warn("TTML fetch failed", res.status, id);
      return null;
    }
    const text = await res.text();
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  // List of fetch strategies: [label, url-factory]
  const strategies: Array<[string, string]> = [
    ["direct", ttmlUrl],
    ["allorigins", `https://api.allorigins.win/raw?url=${encodeURIComponent(ttmlUrl)}`],
    ["corsproxy", `https://corsproxy.io/?${encodeURIComponent(ttmlUrl)}`],
    ["codetabs", `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(ttmlUrl)}`],
  ];

  for (const [label, url] of strategies) {
    try {
      const result = await tryFetch(url);
      if (result) {
        if (label !== "direct") console.log(`[TTML] fetched via ${label}: ${id}`);
        return result;
      }
    } catch {
      // try next strategy
    }
  }

  console.warn("[TTML] all strategies failed for", id);
  return null;
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
  const { limit = 20, offset = 0 } = options;
  const searchPath = `/cloudsearch?keywords=${encodeURIComponent(keyword)}&limit=${limit}&offset=${offset}`;

  // Multiple search strategies: [label, url]
  const strategies: Array<[string, string]> = [
    ["zm.wwoyun.cn", `https://zm.wwoyun.cn${searchPath}`],
    ["netease-direct", `https://music.163.com/api/search/pc?s=${encodeURIComponent(keyword)}&type=1&limit=${limit}&offset=${offset}`],
  ];

  for (const [label, baseUrl] of strategies) {
    try {
      const data = await fetchViaProxy(baseUrl);
      const parsed = data as NeteaseSearchResponse;
      const songs = parsed?.result?.songs ?? (Array.isArray(parsed?.result?.songs) ? parsed.result.songs : []);
      if (songs.length > 0) {
        if (label !== "zm.wwoyun.cn") console.log(`[NetEase] search via ${label}: ${songs.length} results`);
        return songs.map(mapNeteaseSongToTrack);
      }
    } catch (err) {
      console.warn(`[NetEase] search via ${label} failed:`, (err as Error).message);
    }
  }

  return [];
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
      const url = `${NETEASECLOUD_API_BASE}/playlist/track/all?id=${playlistId}&limit=${limit}&offset=${offset}`;
      const data = (await fetchViaProxy(url)) as NeteasePlaylistResponse;
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
    const url = `${NETEASECLOUD_API_BASE}/song/detail?ids=${songId}`;
    const data = (await fetchViaProxy(url)) as NeteaseSongDetailResponse;
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
      console.warn("No songs found on Cloud, falling back to LRCLIB...");
      // Don't return null — fall through to LRCLIB below
    } else {

    // If we know the local file's duration, pick the NetEase result whose
    // duration is closest.  This avoids matching a live/remix/alternate
    // recording whose TTML timing would be out of sync with the local audio.
    let bestSong = songs[0];
    if (durationSec && durationSec > 0) {
      let bestDiff = Infinity;
      for (const s of songs) {
        // NetEase dt is in milliseconds
        const neteaseSec = (s.duration ?? 0) / 1000;
        if (neteaseSec <= 0) continue;
        const diff = Math.abs(neteaseSec - durationSec);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestSong = s;
        }
      }
      if (Number.isFinite(bestDiff) && bestDiff < 15) {
        // Only use duration-matched result if it's within 15 seconds
        console.log(
          `Duration-matched: ${bestSong.title} (${((bestSong.duration ?? 0) / 1000).toFixed(0)}s ≈ ${durationSec.toFixed(0)}s, diff ${bestDiff.toFixed(1)}s)`,
        );
      } else {
        // No close duration match — fall back to first search result
        console.log(
          `Duration match too far (best diff ${Number.isFinite(bestDiff) ? bestDiff.toFixed(1) : "∞"}s), falling back to first result`,
        );
        bestSong = songs[0];
      }
    }

    const songId = bestSong.id;
    console.log(`Matched Song ID: ${songId} — ${bestSong.title}`);

    const lyricsResult = await fetchLyricsById(songId);
    if (lyricsResult) {
      lyricsResult.matchedArtist = bestSong.artist;
      lyricsResult.matchedTitle = bestSong.title;
      lyricsResult.matchedAlbum = bestSong.album;
      lyricsResult.matchedNeteaseId = bestSong.id;
      return lyricsResult;
    }
    } // end else (songs.length > 0)
  } catch (error) {
    console.error("Cloud lyrics match failed:", error);
  }

  // ── Fallback: try LRCLIB if NetEase/TTML didn't work ──
  console.log("[Lyrics] Trying LRCLIB fallback...");
  const lrclibResult = await tryLrclib(title, artist, durationSec);
  if (lrclibResult) return lrclibResult;

  return null;
};

export const fetchLyricsById = async (
  songId: string,
): Promise<MatchedLyricsResult | null> => {
  try {
    // Fetch TTML and NetEase lyrics in parallel
    const [ttmlContent, lyricDataResult] = await Promise.all([
      fetchTtmlByNeteaseId(songId),
      (async () => {
        const lyricUrl = `${NETEASECLOUD_API_BASE}/lyric/new?id=${songId}`;
        try {
          return await fetchViaProxy(lyricUrl);
        } catch (err) {
          console.error("Lyric fetch error", err);
          return null;
        }
      })(),
    ]);

    const lyricData = lyricDataResult as any;

    const rawYrc: string | undefined = lyricData?.yrc?.lyric;
    const rawLrc: string | undefined = lyricData?.lrc?.lyric;
    const rawTLrc: string | undefined = lyricData?.tlyric?.lyric;
    const rawYtl: string | undefined = lyricData?.ytlrc?.lyric;

    const lrcMeta = rawLrc
      ? extractMetadataLines(rawLrc)
      : { clean: undefined, metadata: [] };
    const yrcMeta = rawYrc
      ? extractMetadataLines(rawYrc)
      : { clean: undefined, metadata: [] };

    const rawTranslation = rawTLrc?.trim() ? rawTLrc : rawYtl;

    let cleanTranslation: string | undefined;
    let translationMetadata: string[] = [];
    if (rawTranslation) {
      const result = extractMetadataLines(rawTranslation);
      cleanTranslation = result.clean;
      translationMetadata = result.metadata;
    }

    const ttmlMetadata = extractTtmlMetadata(ttmlContent ?? undefined);

    const metadata = mergeMetadata({
      lrc: lrcMeta.metadata,
      yrc: yrcMeta.metadata,
      translation: translationMetadata,
      ttml: ttmlMetadata,
      lyricUser: lyricData?.lyricUser?.nickname,
      transUser: lyricData?.transUser?.nickname,
    });

    const baseLyrics = lrcMeta.clean || yrcMeta.clean || rawLrc || rawYrc;

    if (!ttmlContent && !baseLyrics) {
      return null;
    }

    const yrcForEnrichment =
      yrcMeta.clean && lrcMeta.clean ? yrcMeta.clean : undefined;

    return {
      lrc: baseLyrics,
      yrc: yrcForEnrichment,
      tLrc: cleanTranslation,
      ttml: ttmlContent ?? undefined,
      metadata,
    };
  } catch (e) {
    console.error("Lyric fetch pipeline error", e);
    return null;
  }
};
