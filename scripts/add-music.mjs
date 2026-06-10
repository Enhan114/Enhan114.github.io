/**
 * Quick-add music + rebuild + push — standalone, run from anywhere.
 *
 * Usage:
 *   node scripts/add-music.mjs "song.flac" --source=api
 *   node scripts/add-music.mjs "song.flac" --source=amll
 *   node scripts/add-music.mjs "song1.flac" "song2.flac" --source=api --project="C:\Web Music"
 *
 * --source=api   → lyrics from music-api.cc.cd (default)
 * --source=amll  → lyrics from AMLL TTML DB
 * --project=PATH → project root (default: auto-detect from script location)
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve, basename, join, dirname, extname } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_NAME = basename(fileURLToPath(import.meta.url));

// Parse args
const args = process.argv.slice(2);
const files = [];
let source = "amll";                        // 默认改为 AMLL
let projectRoot = resolve(__dirname, "..");

for (const arg of args) {
  if (arg.startsWith("--source=")) {
    source = arg.split("=")[1].toLowerCase();
    if (!["api", "amll"].includes(source)) {
      console.error("❌ --source 必须是 api 或 amll");
      process.exit(1);
    }
  } else if (arg.startsWith("--project=")) {
    projectRoot = resolve(arg.split("=")[1]);
  } else {
    files.push(arg);
  }
}

if (!files.length) {
  console.log(`用法: node ${SCRIPT_NAME} <音频文件> [更多文件...] [--source=api|amll] [--project=路径]`);
  process.exit(1);
}

if (!existsSync(projectRoot)) {
  console.error(`❌ 项目目录不存在: ${projectRoot}`);
  process.exit(1);
}

const musicDir = join(projectRoot, "public", "music");
mkdirSync(musicDir, { recursive: true });

const run = (cmd) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: projectRoot, stdio: "inherit" });
};

// Step 1: Copy files
console.log(`📁 复制 ${files.length} 个文件...`);
for (const file of files) {
  const absPath = resolve(file);
  if (!existsSync(absPath)) {
    console.error(`   ❌ 文件不存在: ${file}`);
    continue;
  }
  const dest = join(musicDir, basename(file));
  copyFileSync(absPath, dest);
  console.log(`   ✅ ${basename(file)}`);
}

// Step 1.5: Auto-update music-manifest.json (always write valid JSON)
const manifestPath = join(projectRoot, "public", "music-manifest.json");
let manifest = [];

// Try to read existing manifest
if (existsSync(manifestPath)) {
  try {
    const raw = readFileSync(manifestPath, "utf-8");
    if (raw.trim().length > 0) {
      manifest = JSON.parse(raw);
      if (!Array.isArray(manifest)) manifest = [];   // ensure array
    }
  } catch {
    console.warn("⚠️ 清单文件损坏，将重新创建");
  }
}

// Add new files
for (const file of files) {
  const name = basename(file, extname(file));        // "Beyond - 海阔天空"
  const parts = name.split(" - ");
  let artist, title;
  if (parts.length >= 2) {
    artist = parts[0].trim();
    title = parts.slice(1).join(" - ").trim();
  } else {
    artist = "未知艺术家";
    title = name.trim();
  }
  // Avoid duplicates
  if (!manifest.find(m => m.title === title && m.artist === artist)) {
    manifest.push({ title, artist });
  }
}

// Write back — ensure file is never empty
const jsonContent = JSON.stringify(manifest, null, 2) + "\n";
writeFileSync(manifestPath, jsonContent, "utf-8");

// Verify immediately
const verify = readFileSync(manifestPath, "utf-8");
if (verify.trim().length === 0) {
  console.error("❌ 写入 music-manifest.json 失败，文件为空！");
  process.exit(1);
}
console.log(`📋 已更新音乐清单 (${manifest.length} 首)`);

// Step 2: Fetch lyrics
console.log(`\n🎵 获取歌词 (来源: ${source === "amll" ? "AMLL TTML" : "API"})...`);
if (source === "amll") process.env.LYRICS_SOURCE = "amll";
run("node scripts/fetchNeteaseIds.mjs");

// Step 3: Build
console.log("\n🔨 构建...");
run("npx vite build");

// Step 4: Git commit & push (only relevant files)
//console.log("\n📤 提交上传...");
//try { run("git add public/music/ public/music-manifest.json docs/"); } catch {}
//try { run(`git commit -m "Add: ${files.map(f => basename(f)).join(", ")}" --allow-empty`); } catch {}
//try { run("git push"); } catch {}

//console.log(`\n✅ 完成！歌词来源: ${source === "amll" ? "AMLL" : "API"}`);