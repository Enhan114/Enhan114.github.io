import { extractTtmlMetadata } from "./services/lyricsService.ts";

const xml = `<amll:meta key="musicName" value="Song Title"/>
<amll:meta key="artists" value="Artist Name"/>
<amll:meta key="album" value="Album Name"/>`;

console.log(extractTtmlMetadata(xml));
