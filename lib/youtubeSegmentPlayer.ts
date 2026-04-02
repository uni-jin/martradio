"use client";

import { useState, useEffect, useRef, useCallback, useId } from "react";

let youtubeLoadPromise: Promise<void> | null = null;

export function loadYoutubeAPI(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as unknown as Record<string, unknown>).YT && typeof ((window as unknown as Record<string, unknown>).YT as Record<string, unknown>).Player === "function") return Promise.resolve();
  if (youtubeLoadPromise) return youtubeLoadPromise;
  youtubeLoadPromise = new Promise((resolve) => {
    (window as unknown as Record<string, unknown>).onYouTubeIframeAPIReady = () => resolve();
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
  });
  return youtubeLoadPromise;
}

export function resolveBgmSeconds(
  startSec: number | null | undefined,
  endSec: number | null | undefined
): { start: number; end: number } {
  const start = startSec != null && !Number.isNaN(Number(startSec)) && Number(startSec) >= 0 ? Number(startSec) : 0;
  const end =
    endSec != null && !Number.isNaN(Number(endSec)) && Number(endSec) > start ? Number(endSec) : start + 60;
  return { start, end: Math.max(end, start + 1) };
}

export type YoutubeSegmentPlayer = {
  playSegment: () => void;
  stop: () => void;
  pause: () => void;
  setVolume: (v: number) => void;
  ready: boolean;
};

type YTRaw = Record<string, unknown>;

const YT_ENDED = 0;

function safeCall(player: YTRaw | null, method: string, ...args: unknown[]) {
  if (!player) return;
  const fn = player[method];
  if (typeof fn === "function") {
    (fn as (...innerArgs: unknown[]) => void)(...args);
  }
}

export function useYoutubeSegmentPlayer(
  videoId: string | null,
  startSec: number | null | undefined,
  endSec: number | null | undefined,
  onSegmentEnd: () => void
): { containerId: string; player: YoutubeSegmentPlayer } {
  const reactId = useId();
  const containerIdRef = useRef("yt-seg-" + reactId.replace(/:/g, ""));
  const containerId = containerIdRef.current;
  const [ready, setReady] = useState(false);
  const instanceRef = useRef<YTRaw | null>(null);
  const onEndRef = useRef(onSegmentEnd);
  onEndRef.current = onSegmentEnd;
  const isRestartingRef = useRef(false);

  const isFullPlayback = Boolean(videoId && startSec == null && endSec == null);
  const { start, end } = isFullPlayback
    ? { start: 0, end: 0 }
    : resolveBgmSeconds(startSec, endSec);
  const startRef = useRef(start);
  const endRef = useRef(end);
  startRef.current = start;
  endRef.current = end;
  const isFullPlaybackRef = useRef(isFullPlayback);
  isFullPlaybackRef.current = isFullPlayback;

  const YT_PLAYING = 1;

  useEffect(() => {
    if (!videoId || typeof window === "undefined") return;
    let mounted = true;

    loadYoutubeAPI().then(() => {
      if (!mounted) return;
      const el = document.getElementById(containerId);
      if (!el) return;
      const YTGlobal = (window as unknown as Record<string, unknown>).YT as Record<string, unknown> | undefined;
      if (!YTGlobal || typeof YTGlobal.Player !== "function") return;

      const PlayerCtor = YTGlobal.Player as new (id: string, opts: Record<string, unknown>) => YTRaw;
      new PlayerCtor(containerId, {
        videoId,
        width: 1,
        height: 1,
        playerVars: {
          autoplay: 0,
          controls: 0,
        },
        events: {
          onReady(e: { target: YTRaw }) {
            if (!mounted) return;
            instanceRef.current = e.target;
            setReady(true);
          },
          onStateChange(e: { data: number }) {
            if (e.data === YT_PLAYING) {
              isRestartingRef.current = false;
            }
            if (e.data === YT_ENDED && !isRestartingRef.current) {
              onEndRef.current();
            }
          },
        },
      });
    });

    return () => {
      mounted = false;
      const p = instanceRef.current;
      if (p) {
        safeCall(p, "stopVideo");
        safeCall(p, "destroy");
      }
      instanceRef.current = null;
      setReady(false);
    };
  }, [containerId, videoId]);

  const playSegment = useCallback(() => {
    const p = instanceRef.current;
    if (!p || !videoId) return;
    isRestartingRef.current = true;
    if (isFullPlaybackRef.current) {
      if (typeof p.loadVideoById === "function") {
        p.loadVideoById({ videoId });
      } else {
        safeCall(p, "playVideo");
      }
      return;
    }
    const s = startRef.current;
    const e = endRef.current;
    if (typeof p.loadVideoById === "function") {
      p.loadVideoById({ videoId, startSeconds: s, endSeconds: e });
    } else {
      safeCall(p, "playVideo");
    }
  }, [videoId]);

  const stop = useCallback(() => {
    isRestartingRef.current = true;
    safeCall(instanceRef.current, "stopVideo");
  }, []);

  const pause = useCallback(() => {
    safeCall(instanceRef.current, "pauseVideo");
  }, []);

  const setVolume = useCallback((v: number) => {
    safeCall(instanceRef.current, "setVolume", Math.min(100, Math.max(0, v)));
  }, []);

  return {
    containerId,
    player: { playSegment, stop, pause, setVolume, ready },
  };
}
