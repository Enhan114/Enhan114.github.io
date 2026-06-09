/**
 * Process a single .flac file: extract metadata, add to manifest, fetch lyrics.
 * Called by add-music.bat for each song.
 *
 * Usage: node scripts/add-music-single.mjs "path/to/song.flac" --source=amll|api
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from "fs";
import { resolve, basename, join, dirname } from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const fileArg = args.find(a => !a.startsWith("--"));
const source = (args.find(a => a.startsWith("--source=")) || "--source=amll").split("=")[1];

if (!fileArg) { console.error("Usage: node add-music-single.mjs <file> --source=amll|api"); process.exit(1); }

const filePath = resolve(fileArg);
const fileName = basename(filePath, ".flac");
const musicDir = join(root, "public", "music");
const manifestPath = join(root, "public", "music-manifest.json");
const API = "https://music-api.cc.cd";
const AMLL = "https://webmusic.cc.cd/amll-ttml-db/ncm-lyrics";

const fetchText = async (url) => { try { const r = await fetch(url); return r.ok ? await r.text() : null; } catch { return null; } };
const fetchJson = async (url) => { try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch { return null; } };

// ── Extract metadata from FLAC ──
const extractMeta = async (flacPath) => {
  try {
    const jsmediatags = require("jsmediatags");
    return new Promise((resolve) => {
      jsmediatags.read(flacPath, {
        onSuccess: (tag) => {
          const t = tag.tags;
          resolve({ title: t.title || fileName, artist: t.artist || "Unknown Artist" });
        },
        onError: () => resolve({ title: fileName, artist: "Unknown Artist" }),
      });
    });
  } catch {
    return { title: fileName, artist: "Unknown Artist" };
  }
};

// ── Sanitize filename ──
const sanitize = (s) => s.replace(/[<>:"/\\|?*]/g, "");

// ── Main ──
const meta = await extractMeta(filePath);
const id = `static-${sanitize(fileName).replace(/[^a-zA-Z0-9]/g, "-")}`;
console.log(`   歌名: ${meta.title}`);
console.log(`   歌手: ${meta.artist}`);

// Copy file
const destFile = join(musicDir, basename(filePath));
if (!existsSync(destFile)) copyFileSync(filePath, destFile);

// Load / create manifest
let manifest = [];
if (existsSync(manifestPath)) manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

// Remove existing entry with same id
manifest = manifest.filter(e => e.id !== id);

// Search for NetEase ID
const searchData = await fetchJson(`${API}/search?keywords=${encodeURIComponent(meta.title + " " + meta.artist)}&type=1&limit=3`);
const neteaseId = searchData?.result?.songs?.[0]?.id ? String(searchData.result.songs[0].id) : "";

// Download lyrics
let ttmlContent = null;
const ttmlFile = `${sanitize(meta.title)}.ttml`;
const ttmlPath = join(musicDir, ttmlFile);

if (!existsSync(ttmlPath)) {
  if (source === "amll") {
    // AMLL first
    ttmlContent = await fetchText(`${AMLL}/${neteaseId}.ttml`) || await fetchText(`${AMLL}/${neteaseId}.yrc`);
    console.log(`   歌词: ${ttmlContent ? 'AMLL' : 'AMLL 无, 试API...'}`);
    if (!ttmlContent) {
      const apiJson = await fetchText(`${API}/lyric/new?id=${neteaseId}`);
      if (apiJson && apiJson.length > 30) { ttmlContent = apiJson; console.log("   歌词: API fallback"); }
    }
  } else {
    // API first
    ttmlContent = await fetchText(`${API}/lyric/new?id=${neteaseId}`);
    console.log(`   歌词: ${ttmlContent ? 'API' : 'API 无, 试AMLL...'}`);
    if (!ttmlContent) {
      ttmlContent = await fetchText(`${AMLL}/${neteaseId}.ttml`) || await fetchText(`${AMLL}/${neteaseId}.yrc`);
      if (ttmlContent) console.log("   歌词: AMLL fallback");
    }
  }
  if (ttmlContent && ttmlContent.length > 30) {
    writeFileSync(ttmlPath, ttmlContent, "utf-8");
  }
} else {
  console.log("   歌词: 已存在");
}

// Add to manifest
manifest.push({
  filePath: `music/${basename(filePath)}`,
  title: meta.title,
  artist: meta.artist,
  id,
  neteaseId: neteaseId || undefined,
  ttmlPath: existsSync(ttmlPath) ? `music/${ttmlFile}` : undefined,
});

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`   ✅ 已添加 (ID: ${neteaseId || 'N/A'})`);
