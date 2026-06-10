/**
 * Process a single .flac file: extract metadata, add to manifest, fetch lyrics.
 * Called by add-music.bat for each song.
 *
 * Usage: node scripts/add-music-single.mjs "path/to/song.flac" --source=amll|api
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync } from "fs";
import { resolve, basename, join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const args = process.argv.slice(2);
const fileArg = args.find(a => !a.startsWith("--"));
const source = (args.find(a => a.startsWith("--source=")) || "--source=amll").split("=")[1];

if (!fileArg) { console.error("Usage: node add-music-single.mjs <file> --source=amll|api"); process.exit(1); }

const filePath = resolve(fileArg);
const fileName = basename(filePath).replace(/\.(flac|mp3|ogg|wav|m4a|aac)$/i, "");
const ext = basename(filePath).match(/\.(flac|mp3|ogg|wav|m4a|aac)$/i)?.[0] || ".flac";
const musicDir = join(root, "public", "music");
const manifestPath = join(root, "public", "music-manifest.json");
const API = "https://music-api.cc.cd";
const AMLL = "https://webmusic.cc.cd/amll-ttml-db/ncm-lyrics";

const fetchText = async (url, timeout = 15000) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try { const r = await fetch(url, { signal: ctrl.signal }); return r.ok ? await r.text() : null; }
  catch { return null; }
  finally { clearTimeout(t); }
};
const fetchJson = async (url) => {
  const t = await fetchText(url); return t ? JSON.parse(t) : null;
};

// ── Extract title/artist from filename ──
// Pattern: "Artist - Title" or just "Title"
const extractMeta = (name) => {
  const parts = name.split("-").map(s => s.trim());
  if (parts.length >= 2) {
    return { artist: parts[0], title: parts.slice(1).join(" - ") };
  }
  return { artist: "Unknown Artist", title: name };
};

const sanitize = (s) => s.replace(/[<>:"/\\|?*]/g, "");

// ── Main ──
const meta = extractMeta(fileName);
const id = `static-${sanitize(fileName).replace(/[^a-zA-Z0-9]/g, "-")}`;
console.log(`   Title: ${meta.title}`);
console.log(`   Artist: ${meta.artist}`);

// Copy file
const destFile = join(musicDir, basename(filePath));
if (!existsSync(destFile)) copyFileSync(filePath, destFile);

// Load or create manifest
let manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf-8"))
  : [];
manifest = manifest.filter(e => e.id !== id);

// Search for NetEase ID
const searchData = await fetchJson(`${API}/search?keywords=${encodeURIComponent(meta.title)}&type=1&limit=3`);
const neteaseId = searchData?.result?.songs?.[0]?.id
  ? String(searchData.result.songs[0].id) : "";

// Download lyrics
const ttmlFile = `${sanitize(meta.title)}.ttml`;
const ttmlPath = join(musicDir, ttmlFile);
let gotLyrics = existsSync(ttmlPath);

if (!gotLyrics) {
  let content = null;
  if (source === "amll") {
    content = await fetchText(`${AMLL}/${neteaseId}.ttml`)
           || await fetchText(`${AMLL}/${neteaseId}.yrc`);
    if (!content) {
      content = await fetchText(`${API}/lyric/new?id=${neteaseId}`);
      if (content) console.log("   Lyrics: API fallback");
    } else {
      console.log("   Lyrics: AMLL");
    }
  } else {
    content = await fetchText(`${API}/lyric/new?id=${neteaseId}`);
    if (!content) {
      content = await fetchText(`${AMLL}/${neteaseId}.ttml`)
             || await fetchText(`${AMLL}/${neteaseId}.yrc`);
      if (content) console.log("   Lyrics: AMLL fallback");
    } else {
      console.log("   Lyrics: API");
    }
  }
  if (content && content.length > 30) {
    writeFileSync(ttmlPath, content, "utf-8");
    gotLyrics = true;
  }
} else {
  console.log("   Lyrics: already exists");
}

if (!gotLyrics) console.log("   Lyrics: NONE");

manifest.push({
  filePath: `music/${basename(filePath)}`,
  title: meta.title,
  artist: meta.artist,
  id,
  ...(neteaseId ? { neteaseId } : {}),
  ...(gotLyrics ? { ttmlPath: `music/${ttmlFile}` } : {}),
});

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
console.log(`   OK (ID: ${neteaseId || 'N/A'})`);
