/**
 * Build-time lyrics fetcher — only word-level timing formats.
 * 1. Search NetEase ID via music-api.cc.cd
 * 2. Download TTML from AMLL (best, word-level timing)
 * 3. No AMLL TTML? → Download YRC (逐字歌词) from music-api.cc.cd
 * 4. Update music-manifest.json
 *
 * Output: .ttml (AMLL) or .yrc (NetEase), NO .lrc
 * Node.js — no CORS.  node scripts/fetchNeteaseIds.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
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

const fetchJson = async (url) => { try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch { return null; } };
const fetchText = async (url) => { try { const r = await fetch(url); return r.ok ? (await r.text()).trim() : null; } catch { return null; } };

const main = async () => {
  console.log("🎵 Fetching AMLL TTML + API YRC (word-level only)...\n");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  let ids = 0, ttml = 0, yrc = 0;

  for (const entry of manifest) {
    const fn = sanitize(entry.title);
    const ttmlFile = `${fn}.ttml`;
    const yrcFile = `${fn}.yrc`;

    console.log(`🔎 ${entry.artist} — ${entry.title}`);

    // 1. NetEase ID
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

    // 2. API YRC first (user's preference)
    const data = await fetchJson(`${API}/lyric/new?id=${entry.neteaseId}`);
    const yrcContent = data?.yrc?.lyric;
    if (yrcContent && yrcContent.length > 30) {
      writeFileSync(join(musicDir, yrcFile), yrcContent, "utf-8");
      entry.yrcPath = `music/${yrcFile}`;
      delete entry.lyricsPath;
      delete entry.ttmlPath;
      yrc++;
      console.log(`  📝 YRC`);
      await sleep(400);
      continue;
    }

    // 3. AMLL TTML fallback
    const hasTtmlOnDisk = existsSync(join(musicDir, ttmlFile));
    let gotTtml = hasTtmlOnDisk;
    if (!hasTtmlOnDisk) {
      const content = await fetchText(`${AMLL}/${entry.neteaseId}`);
      if (content && content.length > 30) {
        writeFileSync(join(musicDir, ttmlFile), content, "utf-8");
        gotTtml = true;
      }
    }
    if (gotTtml) {
      entry.ttmlPath = `music/${ttmlFile}`;
      delete entry.lyricsPath;
      try { unlinkSync(join(musicDir, yrcFile)); } catch {}
      try { unlinkSync(join(musicDir, `${fn}.lrc`)); } catch {}
      ttml++;
      console.log(`  🎯 TTML (AMLL fallback)`);
    } else {
      console.log(`  ⚠️  No lyrics`);
    }

    await sleep(400);
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  console.log(`\n✅ Done! ${ids} IDs, ${ttml} TTML, ${yrc} YRC, ${manifest.length} total.`);
};

main().catch((e) => { console.error("Failed:", e); process.exit(1); });
