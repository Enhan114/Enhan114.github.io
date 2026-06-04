import fs from 'node:fs';
import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const AUDIO_EXTENSIONS = new Set([".mp3", ".ogg", ".wav", ".m4a", ".flac"]);
const LYRIC_EXTENSIONS = new Set([".lrc", ".txt", ".json"]);

const walkMusicDir = (dir: string, relativeRoot = ""): Array<{ filePath: string; absolutePath: string }> => {
  if (!fs.existsSync(dir)) return [];

  const result: Array<{ filePath: string; absolutePath: string }> = [];
  for (const name of fs.readdirSync(dir)) {
    const absolute = path.join(dir, name);
    if (fs.statSync(absolute).isDirectory()) {
      result.push(...walkMusicDir(absolute, path.posix.join(relativeRoot, name)));
      continue;
    }
    const filePath = path.posix.join(relativeRoot, name);
    result.push({ filePath, absolutePath: absolute });
  }
  return result;
};

const createMusicManifest = (rootDir: string) => {
  const musicRoot = path.join(rootDir, "public", "music");
  const files = walkMusicDir(musicRoot);
  const lyricsMap = new Map<string, string>();
  const songs: Array<{ filePath: string; lyricsPath?: string; title: string; artist: string; id: string }> = [];

  for (const file of files) {
    const ext = path.extname(file.filePath).toLowerCase();
    if (LYRIC_EXTENSIONS.has(ext)) {
      const baseName = path.basename(file.filePath, ext).toLowerCase();
      lyricsMap.set(baseName, file.filePath);
    }
  }

  for (const file of files) {
    const ext = path.extname(file.filePath).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(ext)) continue;

    const baseName = path.basename(file.filePath, ext);
    const titleCandidate = baseName.replace(/\.[^/.]+$/, "");
    const titleParts = titleCandidate.split("-").map((part) => part.trim());
    const artist = titleParts.length > 1 ? titleParts[0] : "Unknown Artist";
    const title = titleParts.length > 1 ? titleParts.slice(1).join(" - ") : titleParts[0];
    const id = `static-${file.filePath.replace(/[^a-zA-Z0-9]/g, "-")}`;

    const lyricsPath = lyricsMap.get(baseName.toLowerCase());
    songs.push({
      filePath: path.posix.join("music", file.filePath),
      lyricsPath: lyricsPath ? path.posix.join("music", lyricsPath) : undefined,
      title,
      artist,
      id,
    });
  }

  return songs.sort((a, b) => a.filePath.localeCompare(b.filePath));
};

const musicManifestPlugin = (): Plugin => ({
  name: "vite-plugin-music-manifest",
  resolveId(id) {
    if (id === "virtual:music-manifest") {
      return id;
    }
    return null;
  },
  load(id) {
    if (id !== "virtual:music-manifest") return null;
    const manifest = createMusicManifest(path.resolve(__dirname));
    return `export default ${JSON.stringify(manifest)};`;
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const productionBase = env.VITE_BASE_PATH || './';
  return {
    base: mode === 'production' ? productionBase : '/',
    build: {
      outDir: 'docs',
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [musicManifestPlugin(), react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
