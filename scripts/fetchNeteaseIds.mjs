/**
 * Build-time script:
 * 1. Auto-fetch NetEase song IDs via Meting API
 * 2. Download LRC lyrics from Meting (proxies music.163.com)
 * 3. Download TTML from amll-ttml-db.stevexmh.net (word-level timing)
 * 4. Update music-manifest.json with all data
 *
 * Runs in Node.js — no browser CORS restrictions.
 * Usage: node scripts/fetchNeteaseIds.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const manifestPath = join(root, "public", "music-manifest.json");
const musicDir = join(root, "public", "music");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(musicDir, { recursive: true });

const sanitizeFilename = (s) => s.replace(/[<>:"/\\|?*]/g, "");

const fetchJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) return null;
  return await res.json();
};

const fetchText = async (url) => {
  const res = await fetch(url);
  if (!res.ok) return null;
  const text = await res.text();
  return text.trim().length > 0 ? text : null;
};

// Vercel NetEase API base
const API = "https://music-api.cc.cd";

// Step 1: Search NetEase for song ID
const searchNeteaseId = async (title) => {
  const url = `${API}/search?keywords=${encodeURIComponent(title)}&type=1&limit=3`;
  const data = await fetchJson(url);
  const songs = data?.result?.songs ?? [];
  return songs.length > 0 ? String(songs[0].id) : null;
};

// Step 2: Download LRC from NetEase API
const downloadLrc = async (id) => {
  const data = await fetchJson(`${API}/lyric/new?id=${id}`);
  const lrc = data?.lrc?.lyric;
  return lrc?.trim().length > 0 ? lrc : null;
};

// Step 3: Download TTML from AMLL (word-level timing, Node.js no CORS)
const downloadTtml = async (id) => fetchText(`https://amll-ttml-db.stevexmh.net/ncm/${id}`);

const main = async () => {
  console.log("🎵 Fetching NetEase IDs + LRC + TTML lyrics...\n");

  const raw = readFileSync(manifestPath, "utf-8");
  const manifest = JSON.parse(raw);

  let idsFound = 0;
  let lrcSaved = 0;
  let ttmlSaved = 0;

  for (const entry of manifest) {
    const fname = sanitizeFilename(entry.title);
    const lrcFile = `${fname}.lrc`;
    const ttmlFile = `${fname}.ttml`;

    const hasAll = entry.neteaseId?.trim()
      && entry.lyricsPath
      && existsSync(join(musicDir, lrcFile));

    if (hasAll) {
      console.log(`  ⏭️  ${entry.title} — already complete`);
      idsFound++;
      lrcSaved++;
      if (entry.ttmlPath && existsSync(join(musicDir, ttmlFile))) ttmlSaved++;
      continue;
    }

    console.log(`🔎 ${entry.artist} — ${entry.title}`);

    // Fetch NetEase ID
    if (!entry.neteaseId?.trim()) {
      const id = await searchNeteaseId(entry.title);
      if (id) { entry.neteaseId = id; idsFound++; console.log(`  ✅ ID: ${id}`); }
      else { console.log(`  ❌ No ID`); await sleep(350); continue; }
    } else {
      console.log(`  📌 ID: ${entry.neteaseId}`);
    }
    idsFound++;

    // Download LRC (from music.163.com via Meting)
    if (!existsSync(join(musicDir, lrcFile))) {
      const lrc = await downloadLrc(entry.neteaseId);
      if (lrc && lrc.length > 10) {
        writeFileSync(join(musicDir, lrcFile), lrc, "utf-8");
        lrcSaved++;
        console.log(`  📝 LRC saved: ${lrcFile}`);
      } else {
        console.log(`  ⚠️  No LRC`);
      }
    } else { lrcSaved++; }

    // Download TTML (from AMLL, word-level timing)
    if (!existsSync(join(musicDir, ttmlFile))) {
      const ttml = await downloadTtml(entry.neteaseId);
      if (ttml && ttml.length > 30) {
        writeFileSync(join(musicDir, ttmlFile), ttml, "utf-8");
        entry.ttmlPath = `music/${ttmlFile}`;
        ttmlSaved++;
        console.log(`  🎯 TTML saved: ${ttmlFile}`);
      } else {
        console.log(`  ⚠️  No TTML`);
      }
    } else { ttmlSaved++; }

    // Always set lyricsPath
    entry.lyricsPath = `music/${lrcFile}`;

    await sleep(500);
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  console.log(`\n✅ Done! ${idsFound} IDs, ${lrcSaved} LRC, ${ttmlSaved} TTML, ${manifest.length} total.`);
};

main().catch((e) => { console.error("Failed:", e); process.exit(1); });
