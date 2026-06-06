import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Song, PlayState, PlayMode, LyricLine as LyricLineType } from "../types";
import { extractColors, shuffleArray } from "../services/utils";
import { parseLyrics } from "../services/lyrics";
import {
  loadPlaybackSnapshot,
  savePlaybackSnapshot,
} from "../services/libraryStore";
import {
  fetchLyricsById,
  searchAndMatchLyrics,
  MatchedLyricsResult,
} from "../services/lyricsService";
import { audioResourceCache } from "../services/cache";

type MatchStatus = "idle" | "matching" | "success" | "failed";

interface UsePlayerParams {
  isReady: boolean;
  queue: Song[];
  updateSongInQueue: (id: string, updates: Partial<Song>) => void;
  setQueue: Dispatch<SetStateAction<Song[]>>;
}

const MATCH_TIMEOUT_MS = 8000;

export const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Lyrics request timed out"));
    }, timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
};

export const usePlayer = ({
  isReady,
  queue,
  updateSongInQueue,
  setQueue,
}: UsePlayerParams) => {
  const savedRef = useRef(loadPlaybackSnapshot());
  const restoredRef = useRef(false);
  const songRef = useRef<string | null>(savedRef.current.songId);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [playState, setPlayState] = useState<PlayState>(PlayState.PAUSED);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playMode, setPlayMode] = useState<PlayMode>(savedRef.current.playMode);
  const [matchStatus, setMatchStatus] = useState<MatchStatus>("idle");
  const audioRef = useRef<HTMLAudioElement>(null);
  const isSeekingRef = useRef(false);
  const poolRef = useRef<string[]>([]);
  const pastRef = useRef<string[]>([]);

  const pauseAndResetCurrentAudio = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
  }, []);

  const setIndex = useCallback(
    (index: number, list: Song[] = queue) => {
      songRef.current = index >= 0 ? list[index]?.id ?? null : null;
      setCurrentIndex(index);
    },
    [queue],
  );

  const currentSong =
    (songRef.current
      ? queue.find((song) => song.id === songRef.current)
      : null) ??
    queue[currentIndex] ??
    null;
  const accentColor = currentSong?.colors?.[0] || "#a855f7";
  const idsKey = queue.map((song) => song.id).join("\n");

  const pickShuffle = useCallback(() => {
    if (queue.length === 0) {
      return null;
    }

    const currId = currentSong?.id ?? null;
    const ids = new Set(queue.map((song) => song.id));
    const seen = new Set<string>();

    poolRef.current = poolRef.current.filter((id) => {
      if (!ids.has(id) || id === currId || seen.has(id)) {
        return false;
      }

      seen.add(id);
      return true;
    });

    if (poolRef.current.length === 0) {
      poolRef.current = shuffleArray(
        queue.map((song) => song.id).filter((id) => id !== currId),
      );
    }

    return poolRef.current.shift() ?? currId ?? queue[0]?.id ?? null;
  }, [currentSong?.id, queue]);

  const toggleMode = useCallback(() => {
    let nextMode: PlayMode;
    if (playMode === PlayMode.LOOP_ALL) nextMode = PlayMode.LOOP_ONE;
    else if (playMode === PlayMode.LOOP_ONE) nextMode = PlayMode.SHUFFLE;
    else nextMode = PlayMode.LOOP_ALL;

    setPlayMode(nextMode);
    setMatchStatus("idle");

    if (nextMode === PlayMode.SHUFFLE) {
      const currId = currentSong?.id ?? null;
      poolRef.current = shuffleArray(
        queue.map((song) => song.id).filter((id) => id !== currId),
      );
      pastRef.current = [];
    } else {
      poolRef.current = [];
      pastRef.current = [];
    }
  }, [playMode, currentSong?.id, queue]);

  const fadeOutRef = useRef<number>(0);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (playState === PlayState.PLAYING) {
      // Fade out volume over ~300ms then pause
      const audio = audioRef.current;
      const startVol = audio.volume;
      const startTime = performance.now();
      const duration = 300; // ms
      cancelAnimationFrame(fadeOutRef.current);
      const fadeStep = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(1, elapsed / duration);
        // Ease-out curve for smooth fade
        audio.volume = startVol * (1 - t * t);
        if (t < 1) {
          fadeOutRef.current = requestAnimationFrame(fadeStep);
        } else {
          audio.pause();
          audio.volume = startVol; // restore for next play
          setPlayState(PlayState.PAUSED);
        }
      };
      fadeOutRef.current = requestAnimationFrame(fadeStep);
    } else {
      const duration = audioRef.current.duration || 0;
      const isAtEnd =
        duration > 0 && audioRef.current.currentTime >= duration - 0.01;
      if (isAtEnd) {
        audioRef.current.currentTime = 0;
        setCurrentTime(0);
      }
      audioRef.current.play().catch((err) => console.error("Play failed", err));
      setPlayState(PlayState.PLAYING);
    }
  }, [playState]);

  const play = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current
      .play()
      .catch((err) => console.error("Play failed", err));
    setPlayState(PlayState.PLAYING);
  }, []);

  const pause = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    setPlayState(PlayState.PAUSED);
  }, []);

  const handleSeek = useCallback(
    (
      time: number,
      playImmediately: boolean = false,
      defer: boolean = false,
    ) => {
      if (!audioRef.current) return;

      if (defer) {
        // Only update visual state during drag, don't actually seek
        isSeekingRef.current = true;
        setCurrentTime(time);
      } else {
        // Actually perform the seek
        audioRef.current.currentTime = time;
        setCurrentTime(time);
        isSeekingRef.current = false;
        if (playImmediately) {
          audioRef.current
            .play()
            .catch((err) => console.error("Play failed", err));
          setPlayState(PlayState.PLAYING);
        }
      }
    },
    [],
  );

  const handleTimeUpdate = useCallback(() => {
    if (!audioRef.current || isSeekingRef.current) return;
    const value = audioRef.current.currentTime;
    setCurrentTime(Number.isFinite(value) ? value : 0);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (!audioRef.current) return;
    const value = audioRef.current.duration;
    setDuration(Number.isFinite(value) ? value : 0);
    if (playState === PlayState.PLAYING) {
      audioRef.current
        .play()
        .catch((err) => console.error("Auto-play failed", err));
    }
  }, [playState]);

  useEffect(() => {
    isSeekingRef.current = false;
    setCurrentTime(0);
    setDuration(0);
  }, [currentSong?.id]);

  useEffect(() => {
    if (playMode !== PlayMode.SHUFFLE) {
      poolRef.current = [];
      pastRef.current = [];
      return;
    }

    const currId = currentSong?.id ?? null;
    const ids = new Set(queue.map((song) => song.id));
    const seen = new Set<string>();

    poolRef.current = poolRef.current.filter((id) => {
      if (!ids.has(id) || id === currId || seen.has(id)) {
        return false;
      }

      seen.add(id);
      return true;
    });

    pastRef.current = pastRef.current.filter((id) => ids.has(id));

    const extra = queue
      .map((song) => song.id)
      .filter(
        (id) =>
          id !== currId &&
          !poolRef.current.includes(id) &&
          !pastRef.current.includes(id),
      );

    if (extra.length > 0) {
      poolRef.current = [...poolRef.current, ...shuffleArray(extra)];
    }
  }, [idsKey, playMode, currentSong?.id, queue]);

  const playNext = useCallback(() => {
    if (queue.length === 0) return;

    if (playMode === PlayMode.LOOP_ONE) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
      return;
    }

    pauseAndResetCurrentAudio();

    if (playMode === PlayMode.SHUFFLE) {
      const nextId = pickShuffle();
      const currId = currentSong?.id ?? null;

      if (!nextId) {
        return;
      }

      if (currId && currId !== nextId) {
        pastRef.current.push(currId);
      }

      const idx = queue.findIndex((song) => song.id === nextId);
      if (idx === -1) {
        return;
      }

      setIndex(idx);
      setMatchStatus("idle");
      setPlayState(PlayState.PLAYING);
      return;
    }

    const next = (currentIndex + 1) % queue.length;
    setIndex(next);
    setMatchStatus("idle");
    setPlayState(PlayState.PLAYING);
  }, [
    queue,
    playMode,
    currentIndex,
    pauseAndResetCurrentAudio,
    setIndex,
    pickShuffle,
    currentSong?.id,
  ]);

  const playPrev = useCallback(() => {
    if (queue.length === 0) return;
    pauseAndResetCurrentAudio();

    if (playMode === PlayMode.SHUFFLE) {
      const prevId = pastRef.current.pop();
      const currId = currentSong?.id ?? null;

      if (!prevId) {
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
        }
        setMatchStatus("idle");
        setPlayState(PlayState.PLAYING);
        return;
      }

      if (currId && currId !== prevId) {
        poolRef.current = [
          currId,
          ...poolRef.current.filter((id) => id !== currId),
        ];
      }

      const idx = queue.findIndex((song) => song.id === prevId);
      if (idx === -1) {
        return;
      }

      setIndex(idx);
      setMatchStatus("idle");
      setPlayState(PlayState.PLAYING);
      return;
    }

    const prev = (currentIndex - 1 + queue.length) % queue.length;
    setIndex(prev);
    setMatchStatus("idle");
    setPlayState(PlayState.PLAYING);
  }, [
    queue,
    playMode,
    currentIndex,
    pauseAndResetCurrentAudio,
    setIndex,
    currentSong?.id,
  ]);

  const playIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= queue.length) return;
      pauseAndResetCurrentAudio();

      if (playMode === PlayMode.SHUFFLE) {
        const nextId = queue[index]?.id;
        const currId = currentSong?.id ?? null;

        if (nextId) {
          poolRef.current = poolRef.current.filter((id) => id !== nextId);
        }

        if (currId && nextId && currId !== nextId) {
          pastRef.current.push(currId);
        }
      }

      setIndex(index);
      setPlayState(PlayState.PLAYING);
      setMatchStatus("idle");
    },
    [queue, playMode, pauseAndResetCurrentAudio, setIndex, currentSong?.id],
  );

  const handleAudioEnded = useCallback(() => {
    if (playMode === PlayMode.LOOP_ONE) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current
          .play()
          .catch((err) => console.error("Play failed", err));
      }
      setPlayState(PlayState.PLAYING);
      return;
    }

    if (queue.length === 1) {
      setPlayState(PlayState.PAUSED);
      return;
    }

    playNext();
  }, [playMode, queue.length, playNext]);

  const addSongAndPlay = useCallback(
    (song: Song) => {
      if (playMode === PlayMode.SHUFFLE && currentSong?.id && currentSong.id !== song.id) {
        pastRef.current.push(currentSong.id);
      }

      setQueue((prev) => {
        const next = [...prev, song];
        poolRef.current = poolRef.current.filter((id) => id !== song.id);
        setIndex(next.length - 1, next);
        setPlayState(PlayState.PLAYING);
        setMatchStatus("idle");
        return next;
      });
    },
    [playMode, currentSong?.id, setIndex, setQueue],
  );

  const handlePlaylistAddition = useCallback(
    (added: Song[], wasEmpty: boolean) => {
      if (added.length === 0) return;
      setMatchStatus("idle");
      if (wasEmpty || currentIndex === -1) {
        setIndex(0);
        setPlayState(PlayState.PLAYING);
      }
    },
    [currentIndex, setIndex],
  );

  /**
   * Merge cloud lyrics with local lyrics.
   *
   * The local LRC has line timing that matches the actual audio file.
   * TTML/YRC has per-word timing that may come from a different
   * recording and therefore have slightly different line boundaries.
   *
   * Strategy: keep local LRC line timing, graft TTML/YRC per-word
   * data onto matching lines.  If no local lyrics exist, use TTML
   * directly.
   */
  const mergeLyricsWithMetadata = useCallback(
    (result: MatchedLyricsResult, existingLyrics: LyricLineType[]) => {
      const hasTtml = Boolean(result.ttml && result.ttml.trim());

      const cloudParsed = hasTtml
        ? parseLyrics(result.ttml!)
        : parseLyrics(result.lrc ?? "", result.tLrc, {
            yrcContent: result.yrc,
          });

      // If there are no local lyrics, use cloud data directly
      if (existingLyrics.length === 0) {
        const metadataCount = result.metadata.length;
        const metadataLines = result.metadata.map((text, idx) => ({
          time: -0.1 * (metadataCount - idx),
          text,
          isMetadata: true,
        }));
        return [...metadataLines, ...cloudParsed].sort((a, b) => a.time - b.time);
      }

      // Build a text→TTML line map for word-data grafting.
      // Match by normalised text (strip spaces, punctuation, lowercase).
      const ttmlByText = new Map<string, (typeof cloudParsed)[0]>();
      const normalise = (s: string) =>
        s.replace(/[\s　,，、。！？：；""''（）【】「」…—\-\.\!\?\:;\(\)\[\]""'']/g, "").toLowerCase();
      for (const cl of cloudParsed) {
        if (cl.isMetadata || cl.isInterlude || cl.isBackground) continue;
        if (!cl.words?.length) continue;
        ttmlByText.set(normalise(cl.text), cl);
      }

      // Merge: keep local line timing, graft TTML word data
      let graftedCount = 0;
      const merged = existingLyrics.map((local) => {
        if (local.isMetadata || local.isInterlude || local.isBackground) {
          return local;
        }
        const key = normalise(local.text);
        const match = ttmlByText.get(key);
        if (match && match.words && match.words.length > 0) {
          graftedCount++;
          // Graft TTML word timing onto local line timing
          // Map TTML word times into the local line's time window
          const localStart = local.time;
          const localEnd = local.endTime && local.endTime > localStart
            ? local.endTime
            : localStart + 4;
          const cloudStart = match.time;
          const cloudEnd = match.endTime && match.endTime > cloudStart
            ? match.endTime
            : cloudStart + 4;
          const cloudDuration = Math.max(0.01, cloudEnd - cloudStart);
          const localDuration = Math.max(0.01, localEnd - localStart);

          return {
            ...local,
            words: match.words.map((w) => ({
              ...w,
              startTime:
                localStart +
                ((w.startTime - cloudStart) / cloudDuration) * localDuration,
              endTime:
                localStart +
                ((w.endTime - cloudStart) / cloudDuration) * localDuration,
            })),
          };
        }
        return local;
      });

      console.log(
        `[lyrics] TTML grafted onto ${graftedCount}/${existingLyrics.filter(l => !l.isMetadata && !l.isInterlude && !l.isBackground).length} local lines`,
      );

      const metadataCount = result.metadata.length;
      const metadataLines = result.metadata.map((text, idx) => ({
        time: -0.1 * (metadataCount - idx),
        text,
        isMetadata: true,
      }));
      return [...metadataLines, ...merged].sort((a, b) => a.time - b.time);
    },
    [],
  );

  const loadLyricsFile = useCallback(
    (file?: File) => {
      if (!file || !currentSong) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          const parsedLyrics = parseLyrics(text);
          updateSongInQueue(currentSong.id, { lyrics: parsedLyrics });
          setMatchStatus("success");
        }
      };
      reader.readAsText(file);
    },
    [currentSong, updateSongInQueue],
  );

  useEffect(() => {
    if (!currentSong) {
      if (matchStatus !== "idle") {
        setMatchStatus("idle");
      }
      return;
    }

    const songId = currentSong.id;
    const songTitle = currentSong.title;
    const songArtist = currentSong.artist;
    const needsLyricsMatch = currentSong.needsLyricsMatch;
    const existingLyrics = currentSong.lyrics ?? [];
    const isNeteaseSong = currentSong.isNetease;
    const songNeteaseId = currentSong.neteaseId;

    let cancelled = false;

    const markMatchFailed = () => {
      if (cancelled) return;
      updateSongInQueue(songId, {
        needsLyricsMatch: false,
      });
      setMatchStatus("failed");
    };

    const markMatchSuccess = () => {
      if (cancelled) return;
      setMatchStatus("success");
    };

    // Local LRC is a fallback — if cloud matching hasn't been tried yet,
    // always attempt it so we can get TTML/YRC with per-word timing.
    if (!needsLyricsMatch) {
      // Already matched (or explicitly opted out).
      if (existingLyrics.length > 0) {
        markMatchSuccess();
      } else {
        markMatchFailed();
      }
      return;
    }

    const fetchLyrics = async () => {
      setMatchStatus("matching");
      try {
        let merged: ReturnType<typeof mergeLyricsWithMetadata> | null = null;
        let cloudArtist: string | undefined;
        let cloudTitle: string | undefined;
        let cloudAlbum: string | undefined;
        let cloudNeteaseId: string | undefined;

        if (isNeteaseSong && songNeteaseId) {
          const raw = await withTimeout(
            fetchLyricsById(songNeteaseId),
            MATCH_TIMEOUT_MS,
          );
          if (cancelled) return;
          if (raw) {
            merged = mergeLyricsWithMetadata(raw, existingLyrics);
          }
        } else {
          const audioDuration = audioRef.current?.duration ?? 0;
          const result = await withTimeout(
            searchAndMatchLyrics(songTitle, songArtist, audioDuration || undefined),
            MATCH_TIMEOUT_MS,
          );
          if (cancelled) return;
          if (result) {
            merged = mergeLyricsWithMetadata(result, existingLyrics);
            // For local files, the artist/title came from the filename.
            // Use the cloud-matched metadata instead — it's more accurate.
            cloudArtist = result.matchedArtist;
            cloudTitle = result.matchedTitle;
            cloudAlbum = result.matchedAlbum;
            cloudNeteaseId = result.matchedNeteaseId;
          }
        }

        if (merged && merged.length > 0) {
          const wordCount = merged.reduce(
            (s, l) => s + (l.words?.length ?? 0), 0,
          );
          console.log(
            `[lyrics] Cloud match success: ${merged.length} lines, ${wordCount} timed words`,
          );
          const updates: Partial<Song> = {
            lyrics: merged,
            needsLyricsMatch: false,
          };
          if (cloudArtist) updates.artist = cloudArtist;
          if (cloudTitle) updates.title = cloudTitle;
          if (cloudAlbum) updates.album = cloudAlbum;
          // Cache the NetEase ID so future plays use fetchLyricsById directly
          // (same as link import — exact recording, no text search guesswork)
          if (cloudNeteaseId) {
            updates.neteaseId = cloudNeteaseId;
            updates.isNetease = true;
          }
          updateSongInQueue(songId, updates);
          markMatchSuccess();
        } else if (existingLyrics.length > 0) {
          // Cloud match failed, but we have local LRC — keep it.
          updateSongInQueue(songId, {
            needsLyricsMatch: false,
          });
          markMatchSuccess();
        } else {
          markMatchFailed();
        }
      } catch (error) {
        console.warn("Lyrics matching failed:", error);
        if (existingLyrics.length > 0) {
          // Keep local LRC as fallback
          updateSongInQueue(songId, {
            needsLyricsMatch: false,
          });
          markMatchSuccess();
        } else {
          markMatchFailed();
        }
      }
    };

    fetchLyrics();

    return () => {
      cancelled = true;
    };
  }, [currentSong?.id, mergeLyricsWithMetadata, updateSongInQueue]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleAudioError = () => {
      console.warn("Audio playback error detected");
      audio.pause();
      audio.currentTime = 0;
      setPlayState(PlayState.PAUSED);
      setCurrentTime(0);
    };

    audio.addEventListener("error", handleAudioError);
    return () => {
      audio.removeEventListener("error", handleAudioError);
    };
  }, [audioRef]);

  // Provide high-precision time updates directly from the native audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleNativeTimeUpdate = () => {
      if (isSeekingRef.current) return;
      const value = audio.currentTime;
      setCurrentTime(Number.isFinite(value) ? value : 0);
    };

    audio.addEventListener("timeupdate", handleNativeTimeUpdate);
    return () => {
      audio.removeEventListener("timeupdate", handleNativeTimeUpdate);
    };
  }, [audioRef]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleDurationChange = () => {
      const value = audio.duration;
      setDuration(Number.isFinite(value) ? value : 0);
    };

    audio.addEventListener("durationchange", handleDurationChange);
    return () => {
      audio.removeEventListener("durationchange", handleDurationChange);
    };
  }, [audioRef]);

  useEffect(() => {
    if (
      !currentSong ||
      !currentSong.isNetease ||
      !currentSong.coverUrl ||
      (currentSong.colors && currentSong.colors.length > 0)
    ) {
      return;
    }

    extractColors(currentSong.coverUrl)
      .then((colors) => {
        if (colors.length > 0) {
          updateSongInQueue(currentSong.id, { colors });
        }
      })
      .catch((err) => console.warn("Color extraction failed", err));
  }, [currentSong, updateSongInQueue]);

  useEffect(() => {
    if (!isReady || restoredRef.current) return;

    restoredRef.current = true;

    if (queue.length === 0) return;

    const idx = savedRef.current.songId
      ? queue.findIndex((song) => song.id === savedRef.current.songId)
      : -1;

    setIndex(idx !== -1 ? idx : 0);
    setMatchStatus("idle");
  }, [isReady, queue, setIndex]);

  useEffect(() => {
    if (!isReady || !restoredRef.current) return;

    savePlaybackSnapshot({
      songId: currentSong?.id ?? null,
      playMode,
    });
  }, [isReady, currentSong?.id, playMode]);

  useEffect(() => {
    if (queue.length === 0) {
      if (currentIndex === -1) return;
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.currentTime = 0;
      setPlayState(PlayState.PAUSED);
      setIndex(-1, []);
      setCurrentTime(0);
      setDuration(0);
      setMatchStatus("idle");
      return;
    }

    const id = songRef.current;
    if (id && queue[currentIndex]?.id !== id) {
      const idx = queue.findIndex((song) => song.id === id);
      if (idx !== -1) {
        setCurrentIndex(idx);
        return;
      }

      songRef.current = queue[currentIndex]?.id ?? null;
    }

    if (currentIndex >= queue.length || !queue[currentIndex]) {
      const nextIndex = Math.max(0, Math.min(queue.length - 1, currentIndex));
      setIndex(nextIndex);
      setMatchStatus("idle");
    }
  }, [queue, currentIndex, setIndex]);

  const [speed, setSpeed] = useState(1);
  const [preservesPitch, setPreservesPitch] = useState(true);
  const [resolvedAudioSrc, setResolvedAudioSrc] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferProgress, setBufferProgress] = useState(0);

  const handleSetSpeed = useCallback((newSpeed: number) => {
    setSpeed(newSpeed);
  }, []);

  const handleTogglePreservesPitch = useCallback(() => {
    setPreservesPitch((prev) => !prev);
  }, []);

  // Ensure playback rate is applied when song changes or play state changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.preservesPitch = preservesPitch;
      audioRef.current.playbackRate = speed;
    }
  }, [currentSong, playState, speed, preservesPitch]);

  useEffect(() => {
    let canceled = false;
    let currentObjectUrl: string | null = null;
    let controller: AbortController | null = null;

    const releaseObjectUrl = () => {
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = null;
      }
    };

    if (!currentSong?.fileUrl) {
      releaseObjectUrl();
      setResolvedAudioSrc(null);
      setIsBuffering(false);
      setBufferProgress(0);
      return () => {
        canceled = true;
        controller?.abort();
        releaseObjectUrl();
      };
    }

    const fileUrl = currentSong.fileUrl;

    // Already a blob or data URL - use directly
    if (fileUrl.startsWith("blob:") || fileUrl.startsWith("data:")) {
      releaseObjectUrl();
      setResolvedAudioSrc(fileUrl);
      setIsBuffering(false);
      setBufferProgress(1);
      return () => {
        canceled = true;
      };
    }

    // Check cache first
    const cachedBlob = audioResourceCache.get(fileUrl);
    if (cachedBlob) {
      releaseObjectUrl();
      currentObjectUrl = URL.createObjectURL(cachedBlob);
      setResolvedAudioSrc(currentObjectUrl);
      setIsBuffering(false);
      setBufferProgress(1);
      return () => {
        canceled = true;
        releaseObjectUrl();
      };
    }

    // Use the original URL directly - let browser handle native buffering
    // This is the most reliable approach and works for any file size
    releaseObjectUrl();
    setResolvedAudioSrc(null); // Use original fileUrl via fallback in audio element
    setIsBuffering(true);
    setBufferProgress(0);

    // Download in background for caching (does not affect playback)
    const cacheInBackground = async () => {
      if (typeof fetch !== "function") return;

      controller = new AbortController();
      try {
        const response = await fetch(fileUrl, { signal: controller.signal });
        if (!response.ok) {
          throw new Error("Failed to load audio: " + response.status);
        }

        const totalBytes = Number(response.headers.get("content-length")) || 0;

        if (!response.body) {
          const fallbackBlob = await response.blob();
          if (canceled) return;
          audioResourceCache.set(fileUrl, fallbackBlob);
          setBufferProgress(1);
          // Don't switch - will be used next time
          return;
        }

        const reader = response.body.getReader();
        const chunks: BlobPart[] = [];
        let loaded = 0;

        while (!canceled) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            loaded += value.byteLength;
            if (totalBytes > 0) {
              setBufferProgress(Math.min(loaded / totalBytes, 0.99));
            } else {
              setBufferProgress((prev) => {
                const increment = value.byteLength / (5 * 1024 * 1024);
                return Math.min(0.95, prev + increment);
              });
            }
          }
        }

        if (canceled) return;

        const blob = new Blob(chunks, {
          type: response.headers.get("content-type") || "audio/mpeg",
        });
        audioResourceCache.set(fileUrl, blob);
        setBufferProgress(1);
        // Don't switch to blob URL during playback - it would restart the audio
        // The cached blob will be used automatically next time this song is played
      } catch (error) {
        if (!canceled) {
          // Not critical - browser is still playing via native buffering
          console.warn("Background audio caching failed:", error);
        }
      } finally {
        if (!canceled) {
          setIsBuffering(false);
        }
      }
    };

    cacheInBackground();

    return () => {
      canceled = true;
      controller?.abort();
      releaseObjectUrl();
    };
  }, [currentSong?.fileUrl]);

  return {
    audioRef,
    currentSong,
    currentIndex,
    playState,
    currentTime,
    duration,
    playMode,
    matchStatus,
    accentColor,
    speed,
    preservesPitch,
    togglePlay,
    toggleMode,
    handleSeek,
    playNext,
    playPrev,
    playIndex,
    handleTimeUpdate,
    handleLoadedMetadata,
    handlePlaylistAddition,
    loadLyricsFile,
    addSongAndPlay,
    handleAudioEnded,
    setSpeed: handleSetSpeed,
    togglePreservesPitch: handleTogglePreservesPitch,
    pitch: 0, // Default pitch
    setPitch: (pitch: number) => { }, // Placeholder
    play,
    pause,
    resolvedAudioSrc,
    isBuffering,
    bufferProgress,
  };
};
