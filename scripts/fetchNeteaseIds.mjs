/**
 * Build-time script: auto-fetch NetEase song IDs for music-manifest.json.
 * Runs in Node.js (no browser CORS), so music.163.com API works directly.
 *
 * Usage: node scripts/fetchNeteaseIds.mjs
 * Integrated into vite build via "build:static": "node scripts/fetchNeteaseIds.mjs && vite build"
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(__dirname, "../public/music-manifest.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const searchNeteaseId = async (title) => {
  const url = `https://api.qijieya.cn/meting/?server=netease&type=search&id=${encodeURIComponent(title)}&limit=3`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  HTTP ${res.status} for "${title}"`);
      return null;
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      console.warn(`  No results for "${title}"`);
      return null;
    }

    const best = data[0];
    // Extract ID from the url field: ".../meting/?server=netease&type=url&id=32431066"
    const idMatch = best.url?.match(/[?&]id=(\d+)/);
    const id = idMatch ? idMatch[1] : null;
    if (!id) {
      console.warn(`  No ID in URL for "${title}":`, best.url?.slice(-40));
      return null;
    }
    console.log(`  ✅ ${best.name} — ${best.artist} (id: ${id})`);
    return id;
  } catch (e) {
    console.warn(`  ❌ Failed for "${title}":`, e.message);
    return null;
  }
};

const main = async () => {
  console.log("🔍 Fetching NetEase IDs for music-manifest.json...\n");

  const raw = readFileSync(manifestPath, "utf-8");
  const manifest = JSON.parse(raw);

  let updated = 0;
  let skipped = 0;

  for (const entry of manifest) {
    // Skip songs that already have a valid neteaseId
    if (entry.neteaseId && entry.neteaseId.trim().length > 0) {
      console.log(`  ⏭️  ${entry.title} — already has ID: ${entry.neteaseId}`);
      skipped++;
      continue;
    }

    console.log(`🔎 ${entry.artist} — ${entry.title}`);
    const id = await searchNeteaseId(entry.title);
    if (id) {
      entry.neteaseId = id;
      updated++;
    }

    // Rate limit: 3 requests per second
    await sleep(350);
  }

  // Preserve formatting: 2-space indent, trailing newline
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  console.log(`\n✅ Done! ${updated} updated, ${skipped} skipped, ${manifest.length} total.`);
};

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
