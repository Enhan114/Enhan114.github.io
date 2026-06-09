/**
 * Quick-add music + rebuild + push — all from terminal.
 *
 * Usage:
 *   node scripts/add-music.mjs "C:\my-music\Song.flac"
 *   node scripts/add-music.mjs "C:\my-music\Song.flac" "C:\my-music\Another.flac"
 *
 * What it does:
 *   1. Copy .flac/.mp3 files to public/music/
 *   2. Fetch NetEase IDs + lyrics (.ttml) via music-api.cc.cd
 *   3. Build site (vite build)
 *   4. Commit & push to GitHub
 */

import { copyFileSync, existsSync } from "fs";
import { resolve, basename, join, dirname } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const musicDir = join(root, "public", "music");

const run = (cmd) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit" });
};

const files = process.argv.slice(2).filter(Boolean);

if (!files.length) {
  console.log("用法: node scripts/add-music.mjs <音频文件路径> [更多文件...]");
  process.exit(1);
}

// Step 1: Copy files
console.log("📁 复制文件...");
for (const file of files) {
  const absPath = resolve(file);
  if (!existsSync(absPath)) {
    console.error(`❌ 文件不存在: ${file}`);
    continue;
  }
  const dest = join(musicDir, basename(file));
  copyFileSync(absPath, dest);
  console.log(`   ✅ ${basename(file)} → public/music/`);
}

// Step 2: Fetch lyrics
console.log("\n🎵 获取歌词...");
run("node scripts/fetchNeteaseIds.mjs");

// Step 3: Build
console.log("\n🔨 构建...");
run("npx vite build");

// Step 4: Git commit & push
console.log("\n📤 提交上传...");
try { run('git add -A'); } catch {}
try { run(`git commit -m "Add music: ${files.map(f => basename(f)).join(", ")}"`); } catch {}
try { run("git push"); } catch {}

console.log("\n✅ 完成！");
