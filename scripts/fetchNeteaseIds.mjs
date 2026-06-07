/**
 * Build-time lyrics fetcher:
 * 1. Search NetEase ID via music-api.cc.cd
 * 2. Download TTML from AMLL (word-level timing, most accurate)
 * 3. Only if no TTML → download LRC from music-api.cc.cd
 * 4. Update music-manifest.json
 *
 * Node.js — no browser CORS.  Usage: node scripts/fetchNeteaseIds.mjs
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

const sanitize = (s) => s.replace(/[<>:"/\\|?*]/g, "");

const API = "https://music-api.cc.cd";
const AMLL = "https://amll-ttml-db.stevexmh.net/ncm";

const fetchJson = async (url) => {
  const res = await fetch(url);
  return res.ok ? await res.json() : null;
};

const fetchText = async (url) => {
  const res = await fetch(url);
  return res.ok ? (await res.text()).trim() : null;
};

const main = async () => {
  console.log("🎵 Lyrics: AMLL TTML first, API LRC fallback...\n");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  let ids = 0, ttml = 0, lrc = 0;

  for (const entry of manifest) {
    const fn = sanitize(entry.title);
    const ttmlFile = `${fn}.ttml`;
    const lrcFile = `${fn}.lrc`;

    console.log(`🔎 ${entry.artist} — ${entry.title}`);

    // 1. Search NetEase ID if missing
    if (!entry.neteaseId?.trim()) {
      const data = await fetchJson(`${API}/search?keywords=${encodeURIComponent(entry.title)}&type=1&limit=3`);
      const songs = data?.result?.songs ?? [];
      if (songs.length === 0) { console.log(`  ❌ No ID`); await sleep(400); continue; }
      entry.neteaseId = String(songs[0].id);
      console.log(`  ✅ ID: ${entry.neteaseId}`);
    } else {
      console.log(`  📌 ID: ${entry.neteaseId}`);
    }
    ids++;

    // 2. AMLL TTML first (most accurate word-level timing)
    let hasTtml = existsSync(join(musicDir, ttmlFile));
    if (!hasTtml) {
      const content = await fetchText(`${AMLL}/${entry.neteaseId}`);
      if (content && content.length > 30) {
        writeFileSync(join(musicDir, ttmlFile), content, "utf-8");
        entry.ttmlPath = `music/${ttmlFile}`;
        hasTtml = true;
        ttml++;
        console.log(`  🎯 TTML: ${ttmlFile}`);
      }
    } else { ttml++; }

    // 3. API LRC fallback (only if no TTML)
    if (!hasTtml) {
      let hasLrc = existsSync(join(musicDir, lrcFile));
      if (!hasLrc) {
        const data = await fetchJson(`${API}/lyric/new?id=${entry.neteaseId}`);
        const content = data?.lrc?.lyric;
        if (content && content.length > 10) {
          writeFileSync(join(musicDir, lrcFile), content, "utf-8");
          hasLrc = true;
          lrc++;
          console.log(`  📝 LRC: ${lrcFile}`);
        }
      } else { lrc++; }
      if (hasLrc) entry.lyricsPath = `music/${lrcFile}`;
      else console.log(`  ⚠️  No lyrics`);
    }

    // If we have TTML, it's the primary source. LRC path is cleared.
    if (hasTtml && !entry.ttmlPath) entry.ttmlPath = `music/${ttmlFile}`;

    await sleep(400);
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  console.log(`\n✅ Done! ${ids} IDs, ${ttml} TTML, ${lrc} LRC, ${manifest.length} total.`);
};

main().catch((e) => { console.error("Failed:", e); process.exit(1); });
