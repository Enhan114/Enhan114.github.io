/**
 * Build-time script:
 * 1. Auto-fetch NetEase song IDs via Meting API
 * 2. Download LRC lyrics and save as local .lrc files
 * 3. Update music-manifest.json with all data
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

// Step 1: Search Meting for NetEase ID
const searchNeteaseId = async (title) => {
  const url = `https://api.qijieya.cn/meting/?server=netease&type=search&id=${encodeURIComponent(title)}&limit=3`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const idMatch = data[0].url?.match(/[?&]id=(\d+)/);
    return idMatch ? idMatch[1] : null;
  } catch { return null; }
};

// Step 2: Download LRC from Meting
const downloadLrc = async (id) => {
  const url = `https://api.qijieya.cn/meting/?server=netease&type=lrc&id=${id}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    return text.trim().length > 0 ? text : null;
  } catch { return null; }
};

const sanitizeFilename = (s) => s.replace(/[<>:"/\\|?*]/g, "");

const main = async () => {
  console.log("🎵 Fetching NetEase IDs + downloading lyrics...\n");

  const raw = readFileSync(manifestPath, "utf-8");
  const manifest = JSON.parse(raw);

  let idsFound = 0;
  let lrcSaved = 0;

  for (const entry of manifest) {
    const filename = sanitizeFilename(entry.title);
    const lrcFile = `${filename}.lrc`;

    // Skip if lyrics already exist and neteaseId is present
    if (entry.neteaseId?.trim() && existsSync(join(musicDir, lrcFile))) {
      console.log(`  ⏭️  ${entry.title} — already have LRC`);
      // Ensure lyricsPath is set
      if (!entry.lyricsPath) entry.lyricsPath = `music/${lrcFile}`;
      idsFound++;
      lrcSaved++;
      continue;
    }

    console.log(`🔎 ${entry.artist} — ${entry.title}`);

    // Fetch NetEase ID if missing
    if (!entry.neteaseId?.trim()) {
      const id = await searchNeteaseId(entry.title);
      if (id) {
        entry.neteaseId = id;
        idsFound++;
        console.log(`  ✅ ID: ${id}`);
      } else {
        console.log(`  ❌ No ID found`);
        await sleep(350);
        continue;
      }
    } else {
      console.log(`  📌 ID: ${entry.neteaseId}`);
    }

    // Download LRC
    const lrc = await downloadLrc(entry.neteaseId);
    if (lrc && lrc.trim().length > 10) {
      writeFileSync(join(musicDir, lrcFile), lrc, "utf-8");
      entry.lyricsPath = `music/${lrcFile}`;
      lrcSaved++;
      console.log(`  📝 LRC saved: ${lrcFile}`);
    } else {
      console.log(`  ⚠️  No LRC for this ID`);
    }

    await sleep(500); // rate limit
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  console.log(`\n✅ Done! ${idsFound} IDs, ${lrcSaved} LRC files, ${manifest.length} total.`);
};

main().catch((e) => { console.error("Failed:", e); process.exit(1); });
