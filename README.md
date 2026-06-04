<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1ggcfQNwQs0cGrbzb1oapySzBvuP5I1ha

## Feature (Github Version)

- [x] **WebGL Fluid Background**: Implements a dynamic fluid background effect using WebGL shaders. [Reference](https://www.shadertoy.com/view/wdyczG)
- [x] **Canvas Lyric Rendering**: High-performance, custom-drawn lyric visualization on HTML5 Canvas.
- [x] **Music Import & Search**: Seamlessly search and import music from external providers or local files.
- [x] **Audio Manipulation**: Real-time control over playback speed and pitch shifting.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
 
## Static Music Directory

Place audio files under `public/music/` to make them available automatically in the app and on GitHub Pages.

Supported audio formats: `.mp3`, `.ogg`, `.wav`, `.m4a`, `.flac`

Optional lyric files with the same base name are also supported:
 - `public/music/Artist - Title.mp3`
 - `public/music/Artist - Title.lrc`

When the app starts, it will automatically load any files found in that folder into the playlist.

## Build Static Site

1. Build the production bundle:
  `npm run build`
2. The generated static files are in `dist/`
3. Deploy the contents of `dist/` to GitHub Pages or any static host

### GitHub Pages

This project is configured to build with relative asset paths for static hosting. If you deploy to GitHub Pages, you can use the repository `dist/` content directly without changing paths.

- If you publish from the `gh-pages` branch or GitHub Pages root folder, upload the contents of `dist/`
- If you need a custom base path, add `VITE_BASE_PATH` to `.env.local` and rebuild

