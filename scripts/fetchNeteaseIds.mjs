/**
 * Build-time lyrics fetcher.
 * 1. Search NetEase ID via music-api.cc.cd
 * 2. Download FULL API response → save as .ttml (parseLyrics handles it)
 * 3. AMLL TTML as fallback if API unreachable
 *
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
const AMLL = "https://webmusic.cc.cd/amll-ttml-db/ncm-lyrics"; // same-origin, no CORS

const fetchJson = async (url) => { try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch { return null; } };
const fetchText = async (url) => { try { const r = await fetch(url); return r.ok ? (await r.text()).trim() : null; } catch { return null; } };

const main = async () => {
  console.log("🎵 Downloading full API lyrics → .ttml...\n");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  let ids = 0, saved = 0, amll = 0;

  for (const entry of manifest) {
    const fn = sanitize(entry.title);
    const ttmlFile = `${fn}.ttml`;
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

    // 2. Download full API response, save as .ttml
    if (!existsSync(join(musicDir, ttmlFile))) {
      const fullJson = await fetchText(`${API}/lyric/new?id=${entry.neteaseId}`);
      if (fullJson && fullJson.length > 30) {
        writeFileSync(join(musicDir, ttmlFile), fullJson, "utf-8");
        saved++;
        console.log(`  📝 Saved: ${ttmlFile}`);
      } else {
        // 3. AMLL fallback
        const ttml = await fetchText(`${AMLL}/${entry.neteaseId}`);
        if (ttml && ttml.length > 30) {
          writeFileSync(join(musicDir, ttmlFile), ttml, "utf-8");
          amll++;
          console.log(`  🎯 AMLL fallback`);
        } else {
          console.log(`  ⚠️  No lyrics`);
        }
      }
    } else {
      saved++;
      console.log(`  ⏭️  Already exists`);
    }

    entry.ttmlPath = `music/${ttmlFile}`;
    delete entry.yrcPath;
    delete entry.lyricsPath;

    await sleep(400);
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  console.log(`\n✅ Done! ${ids} IDs, ${saved} API, ${amll} AMLL, ${manifest.length} total.`);
};

main().catch((e) => { console.error("Failed:", e); process.exit(1); });
