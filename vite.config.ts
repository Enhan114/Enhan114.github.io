import fs from 'node:fs';
import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const AUDIO_EXTENSIONS = new Set([".mp3", ".ogg", ".wav", ".m4a", ".flac"]);
const LYRIC_EXTENSIONS = new Set([".lrc", ".txt", ".json"]);

const readUInt24BE = (buf: Buffer, offset: number): number => {
  return (buf[offset] << 16) | (buf[offset + 1] << 8) | buf[offset + 2];
};

const readUInt32BE = (buf: Buffer, offset: number): number => {
  return buf.readUInt32BE(offset);
};

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/bmp": ".bmp",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

/**
 * Extract embedded cover art from a FLAC file by parsing its metadata blocks.
 * FLAC format: "fLaC" magic → metadata blocks (type 6 = PICTURE).
 */
const extractFlacCover = (filePath: string): { data: Buffer; ext: string } | null => {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length < 42 || buf.toString('utf8', 0, 4) !== 'fLaC') {
      return null;
    }

    let offset = 4;
    let isLast = false;

    while (!isLast && offset + 4 <= buf.length) {
      isLast = (buf[offset] & 0x80) !== 0;
      const blockType = buf[offset] & 0x7F;
      const blockLen = readUInt24BE(buf, offset + 1);
      offset += 4;

      if (offset + blockLen > buf.length) break;

      if (blockType === 6) {
        // PICTURE block: picType(4) + mimeLen(4) + mime + descLen(4) + desc
        //                + width(4) + height(4) + depth(4) + colors(4) + picData
        let pos = offset;
        pos += 4; // skip picture type
        const mimeLen = readUInt32BE(buf, pos);
        pos += 4;
        if (pos + mimeLen > buf.length) break;
        const mime = buf.toString('utf8', pos, pos + mimeLen).toLowerCase();
        pos += mimeLen;
        const descLen = readUInt32BE(buf, pos);
        pos += 4;
        if (pos + descLen > buf.length) break;
        pos += descLen;
        // Skip width(4), height(4), colorDepth(4), colorsUsed(4)
        pos += 16;
        if (pos + 4 > buf.length) break;
        const picDataLen = readUInt32BE(buf, pos);
        pos += 4;
        if (pos + picDataLen > buf.length) break;
        const picData = buf.subarray(pos, pos + picDataLen);
        const ext = MIME_TO_EXT[mime] || '.jpg';
        return { data: Buffer.from(picData), ext };
      }

      offset += blockLen;
    }

    return null;
  } catch {
    return null;
  }
};

/**
 * Extract cover art from any supported audio file.
 * Returns the cover image data and file extension, or null if none found.
 */
const extractCover = (filePath: string, ext: string): { data: Buffer; ext: string } | null => {
  if (ext === '.flac') {
    return extractFlacCover(filePath);
  }
  // TODO: Add MP3/ID3v2 APIC extraction if needed
  return null;
};

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

interface ManifestEntry {
  filePath: string;
  lyricsPath?: string;
  ttmlPath?: string;
  yrcPath?: string;
  coverPath?: string;
  title: string;
  artist: string;
  id: string;
  neteaseId?: string;
}

const createMusicManifest = (rootDir: string): ManifestEntry[] => {
  const musicRoot = path.join(rootDir, "public", "music");
  const files = walkMusicDir(musicRoot);
  const lyricsMap = new Map<string, string>();
  const songs: ManifestEntry[] = [];

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

    // Try to extract embedded cover art and write it alongside the audio file
    let coverPath: string | undefined;
    const cover = extractCover(file.absolutePath, ext);
    if (cover) {
      const coverFileName = baseName + ".cover" + cover.ext;
      const coverAbsPath = path.join(path.dirname(file.absolutePath), coverFileName);
      const coverRelPath = path.posix.join(
        path.posix.dirname(file.filePath),
        coverFileName,
      );
      // Write cover file if it doesn't exist yet
      if (!fs.existsSync(coverAbsPath)) {
        fs.writeFileSync(coverAbsPath, cover.data);
      }
      coverPath = path.posix.join("music", coverRelPath);
    }

    const lyricsPath = lyricsMap.get(baseName.toLowerCase());
    songs.push({
      filePath: path.posix.join("music", file.filePath),
      lyricsPath: lyricsPath ? path.posix.join("music", lyricsPath) : undefined,
      coverPath,
      title,
      artist,
      id,
    });
  }

  return songs.sort((a, b) => a.filePath.localeCompare(b.filePath));
};

const MANIFEST_OUTPUT = "public/music-manifest.json";

const writeManifest = (rootDir: string) => {
  const manifest = createMusicManifest(rootDir);
  const outPath = path.join(rootDir, MANIFEST_OUTPUT);

  // Preserve existing neteaseId, ttmlPath, yrcPath, lyricsPath from old manifest
  const oldMap = new Map<string, any>();
  if (fs.existsSync(outPath)) {
    try {
      const old = JSON.parse(fs.readFileSync(outPath, "utf-8"));
      for (const e of old) {
        if (e.id) oldMap.set(e.id, { neteaseId: e.neteaseId, ttmlPath: e.ttmlPath, yrcPath: e.yrcPath, lyricsPath: e.lyricsPath });
      }
    } catch {}
  }

  for (const entry of manifest) {
    const old = oldMap.get(entry.id);
    if (old?.neteaseId) entry.neteaseId = old.neteaseId;
    if (old?.ttmlPath) entry.ttmlPath = old.ttmlPath;
    if (old?.yrcPath) entry.yrcPath = old.yrcPath;
    if (old?.lyricsPath) entry.lyricsPath = old.lyricsPath;
  }

  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  console.log(`🎵 Music manifest updated: ${manifest.length} tracks`);
};

const musicManifestPlugin = (): Plugin => ({
  name: "vite-plugin-music-manifest",
  // Production: write manifest at build start so it lands in outDir/public
  buildStart() {
    writeManifest(path.resolve(__dirname));
  },
  // Dev mode: configure server and file watcher
  configureServer(server) {
    const rootDir = path.resolve(__dirname);
    writeManifest(rootDir);

    const musicDir = path.join(rootDir, "public", "music");
    if (fs.existsSync(musicDir)) {
      const watcher = fs.watch(
        musicDir,
        { recursive: true },
        (_event, filename) => {
          if (!filename) return;
          const ext = path.extname(filename).toLowerCase();
          if (
            AUDIO_EXTENSIONS.has(ext) ||
            LYRIC_EXTENSIONS.has(ext) ||
            filename.endsWith(".cover.jpg") ||
            filename.endsWith(".cover.png")
          ) {
            writeManifest(rootDir);
            server.ws.send({ type: "full-reload" });
          }
        },
      );
      server.httpServer?.once("close", () => watcher.close());
    }
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
