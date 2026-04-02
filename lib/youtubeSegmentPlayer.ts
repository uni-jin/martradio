"use client";

import { useState, useEffect, useRef, useCallback, useId } from "react";

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
  playSegment: (offsetSeconds?: number) => void;
  stop: () => void;
  pause: () => void;
  setVolume: (v: number) => void;
  ready: boolean;
};

// NOTE:
// YouTube Iframe API(YT.Player)는 일부 환경(특히 로컬 개발/프록시/확장)에서
// postMessage origin mismatch로 제어(pause/stop/volume)가 깨지는 사례가 있다.
// 이 프로젝트에서는 "JS API 없이 iframe src를 교체"하는 방식으로 재생을 제어한다.

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
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const onEndRef = useRef(onSegmentEnd);
  onEndRef.current = onSegmentEnd;
  const endTimerRef = useRef<number | null>(null);

  const isFullPlayback = Boolean(videoId && startSec == null && endSec == null);
  const { start, end } = isFullPlayback ? { start: 0, end: 0 } : resolveBgmSeconds(startSec, endSec);

  const clearEndTimer = useCallback(() => {
    if (endTimerRef.current != null) {
      window.clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
  }, []);

  const destroyIframe = useCallback(() => {
    clearEndTimer();
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.src = "about:blank";
      iframe.remove();
    }
    iframeRef.current = null;
  }, [clearEndTimer]);

  useEffect(() => {
    destroyIframe();
    setReady(Boolean(videoId));
    return () => {
      destroyIframe();
      setReady(false);
    };
  }, [videoId, destroyIframe]);

  const ensureIframe = useCallback((): HTMLIFrameElement | null => {
    if (typeof window === "undefined") return null;
    const host = document.getElementById(containerId);
    if (!host) return null;
    if (iframeRef.current && host.contains(iframeRef.current)) return iframeRef.current;

    destroyIframe();

    const iframe = document.createElement("iframe");
    iframe.width = "1";
    iframe.height = "1";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.position = "absolute";
    iframe.style.left = "-9999px";
    iframe.style.top = "-9999px";
    iframe.allow = "autoplay; encrypted-media";
    iframe.title = "bgm";
    host.appendChild(iframe);
    iframeRef.current = iframe;
    return iframe;
  }, [containerId, destroyIframe]);

  const playSegment = useCallback((offsetSeconds?: number) => {
    if (!videoId) return;
    const iframe = ensureIframe();
    if (!iframe) return;

    clearEndTimer();

    const params = new URLSearchParams();
    params.set("autoplay", "1");
    params.set("controls", "0");
    params.set("rel", "0");
    params.set("playsinline", "1");
    // JS API(enablejsapi)를 쓰지 않아 postMessage/origin 문제를 회피한다.
    if (!isFullPlayback) {
      const off = Math.max(0, Number(offsetSeconds) || 0);
      const startAt = start + off;
      const endAt = Math.max(end, startAt + 1);
      params.set("start", String(Math.floor(startAt)));
      params.set("end", String(Math.floor(endAt)));
      const ms = Math.max(0, Math.floor((endAt - startAt) * 1000));
      endTimerRef.current = window.setTimeout(() => {
        onEndRef.current();
      }, ms);
    }

    iframe.src = `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
  }, [videoId, ensureIframe, clearEndTimer, isFullPlayback, start, end]);

  const stop = useCallback(() => {
    destroyIframe();
  }, [destroyIframe]);

  const pause = useCallback(() => {
    // iframe 기반에서는 pause 대신 stop으로 통일(확실히 끊기)
    destroyIframe();
  }, [destroyIframe]);

  const setVolume = useCallback((_v: number) => {
    // iframe src 제어 방식에서는 볼륨 제어를 지원하지 않는다.
  }, []);

  return {
    containerId,
    player: { playSegment, stop, pause, setVolume, ready },
  };
}
