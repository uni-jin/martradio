"use client";

import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getSession, saveSession } from "@/lib/store";
import { extractYoutubeId } from "@/lib/utils";
import type { Session, BroadcastItem, SessionWithItems } from "@/lib/types";
import { getCurrentUser, getMaxCharsForUser, refreshCurrentUser, type AuthUser } from "@/lib/auth";
import { saveAudio, getAudioBlob, hasStoredAudio } from "@/lib/audioStorage";
import {
  DEFAULT_TTS,
  SPEED_PRESETS,
  SPEED_MIN,
  SPEED_MAX,
  speedToRatePercent,
  ratePercentToSpeed,
  normalizeTtsLineBreakPauseSeconds,
} from "@/lib/ttsOptions";
import { useYoutubeSegmentPlayer } from "@/lib/youtubeSegmentPlayer";
import {
  clearVoiceTemplatesClientCache,
  fetchVoiceTemplatesForPlan,
  useVoiceTemplatesForPlan,
} from "@/lib/voiceTemplatesClient";
import { buildGoogleTtsSynthesizeBody, googleTtsApiJsonBody } from "@/lib/ttsGoogleRequest";
import { setYoutubeEmbedIframeVolume } from "@/lib/youtubeEmbedVolume";
import {
  type BroadcastPlaybackCommitSnapshot,
  buildBroadcastPlaybackCommitSnapshot,
  broadcastPlaybackCommitMatches,
} from "@/lib/broadcastPlaybackCommit";
import {
  isAudioAutoplayBlockedError,
  playAudioFromPreviewSource,
} from "@/lib/voicePreviewPlayback";

function digitsOnly(v: string) {
  return v.replace(/\D/g, "");
}

function totalSecondsFromMinSec(minStr: string, secStr: string): number {
  const min = parseInt(minStr || "0", 10);
  const sec = parseInt(secStr || "0", 10);
  if (!Number.isFinite(min) || !Number.isFinite(sec) || min < 0 || sec < 0) return NaN;
  return min * 60 + sec;
}

export default function EditBroadcastPage() {
  const params = useParams();
  const sessionId = typeof params.id === "string" ? params.id : "";
  const router = useRouter();

  const [loaded, setLoaded] = useState(false);
  const [sessionBase, setSessionBase] = useState<Session | null>(null);
  const itemsRef = useRef<BroadcastItem[]>([]);
  const eventItemsRef = useRef<BroadcastItem[]>([]);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [promoRawText, setPromoRawText] = useState("");
  const [scriptError, setScriptError] = useState<string | null>(null);
  const lastScriptSourceRef = useRef("");
  const [bgmUrl, setBgmUrl] = useState("");
  const [bgmPlayRange, setBgmPlayRange] = useState<"full" | "segment">("full");
  const [bgmStartMin, setBgmStartMin] = useState("");
  const [bgmStartSec, setBgmStartSec] = useState("");
  const [bgmEndMin, setBgmEndMin] = useState("");
  const [bgmEndSec, setBgmEndSec] = useState("");
  const [bgmError, setBgmError] = useState<string | null>(null);
  const [musicMode, setMusicMode] = useState<"background" | "interval">("background");
  const [musicSectionOpen, setMusicSectionOpen] = useState(false);

  const [hasAudio, setHasAudio] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState<number>(DEFAULT_TTS.speed);
  const [googlePresetId, setGooglePresetId] = useState<string>("");
  const [ttsBreakSeconds, setTtsBreakSeconds] = useState<number>(DEFAULT_TTS.breakSeconds);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bgmVolume, setBgmVolume] = useState(40);
  const [loopMode, setLoopMode] = useState<"infinite" | "count">("count");
  const [repeatCount, setRepeatCount] = useState(1);
  const [gapSeconds, setGapSeconds] = useState(0);
  /** 음성 생성 성공 후 또는 저장된 방송과 동기일 때만 true. 값이 바뀌면 숨기지 않고 접힌 상태로 유지. */
  const [playbackSectionVisible, setPlaybackSectionVisible] = useState(false);
  const [playbackSectionOpen, setPlaybackSectionOpen] = useState(false);
  const lastGeneratedPromoRawRef = useRef("");
  const committedPlaybackRef = useRef<BroadcastPlaybackCommitSnapshot | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const voicePreviewBlobUrlRef = useRef<string | null>(null);
  const voicePreviewResumePlayRef = useRef<(() => Promise<void>) | null>(null);
  const [voicePreviewNeedsUserPlay, setVoicePreviewNeedsUserPlay] = useState(false);
  const [showPaidVoiceSubscribeGuide, setShowPaidVoiceSubscribeGuide] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const onBgmEndRef = useRef<() => void>(() => {});
  const phaseRef = useRef<"idle" | "tts" | "bgm">("idle");
  const modeRef = useRef<"background" | "interval">("background");
  const loopInfiniteRef = useRef(false);
  const repeatCountRef = useRef(1);
  const gapSecondsRef = useRef(0);
  const playbackGenRef = useRef(0);
  const pausedAtRef = useRef(0);
  const cyclesCompletedRef = useRef(0);
  const activePlaybackGenRef = useRef(0);

  const [user, setUser] = useState<AuthUser | null>(null);
  useEffect(() => {
    void refreshCurrentUser().then(setUser);
  }, []);
  const [voiceListTick, setVoiceListTick] = useState(0);
  useEffect(() => {
    const onV = () => {
      clearVoiceTemplatesClientCache();
      setVoiceListTick((t) => t + 1);
    };
    window.addEventListener("mart-voice-templates-updated", onV);
    return () => window.removeEventListener("mart-voice-templates-updated", onV);
  }, []);
  const availableGooglePresets = useVoiceTemplatesForPlan(user?.planId, voiceListTick);
  const isPaidSubscriber = user?.planId === "small" || user?.planId === "medium" || user?.planId === "large";
  const maxChars: number | null = useMemo(() => getMaxCharsForUser(user), [user]);
  const promoLength = promoRawText.length;
  const overLimit = maxChars != null && promoLength > maxChars;

  useEffect(() => {
    if (
      scriptError &&
      scriptError.includes("초과했습니다") &&
      maxChars != null &&
      promoRawText.length <= maxChars
    ) {
      setScriptError(null);
    }
  }, [promoRawText.length, maxChars, scriptError]);

  const youtubeId = useMemo(() => {
    if (!bgmUrl.trim()) return null;
    return extractYoutubeId(bgmUrl.trim());
  }, [bgmUrl]);

  const hasBgm = Boolean(youtubeId);

  const bgmSegmentStart =
    bgmPlayRange === "segment" ? totalSecondsFromMinSec(bgmStartMin, bgmStartSec) : null;
  const bgmSegmentEnd =
    bgmPlayRange === "segment" ? totalSecondsFromMinSec(bgmEndMin, bgmEndSec) : null;

  const { containerId, player: ytPlayer } = useYoutubeSegmentPlayer(
    hasBgm ? youtubeId! : null,
    hasBgm && bgmPlayRange === "segment" ? bgmSegmentStart : null,
    hasBgm && bgmPlayRange === "segment" ? bgmSegmentEnd : null,
    () => onBgmEndRef.current?.()
  );

  useEffect(() => {
    modeRef.current = musicMode;
  }, [musicMode]);

  useEffect(() => {
    loopInfiniteRef.current = loopMode === "infinite";
  }, [loopMode]);

  useEffect(() => {
    repeatCountRef.current = Math.max(1, Math.floor(repeatCount) || 1);
  }, [repeatCount]);

  useEffect(() => {
    gapSecondsRef.current = Math.max(0, Number(gapSeconds) || 0);
  }, [gapSeconds]);

  useEffect(() => {
    setYoutubeEmbedIframeVolume(previewIframeRef.current, bgmVolume);
  }, [bgmVolume]);

  const previewSrc = useMemo(() => {
    if (!youtubeId) return null;
    const params = new URLSearchParams();
    params.set("enablejsapi", "1");
    params.set("rel", "0");
    // 미리듣기 iframe은 실제 BGM 제어 대상과 별도(겹침 방지는 autoplay 비활성로 유지).
    params.set("autoplay", "0");
    params.set("mute", "0");
    params.set("controls", "1");
    if (bgmPlayRange === "segment") {
      const start = totalSecondsFromMinSec(bgmStartMin, bgmStartSec);
      const end = totalSecondsFromMinSec(bgmEndMin, bgmEndSec);
      if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
        if (start > 0) params.set("start", String(Math.floor(start)));
        params.set("end", String(Math.floor(end)));
      }
    }
    return `https://www.youtube.com/embed/${youtubeId}?${params.toString()}`;
  }, [youtubeId, bgmPlayRange, bgmStartMin, bgmStartSec, bgmEndMin, bgmEndSec]);

  useEffect(() => {
    if (!loaded) return;
    const list = availableGooglePresets;
    if (list.length === 0) return;
    const selectableList = isPaidSubscriber ? list : list.filter((x) => x.paidOnly !== true);
    if (selectableList.length === 0) return;
    setGooglePresetId((prev) => (prev && selectableList.some((x) => x.id === prev) ? prev : selectableList[0].id));
  }, [loaded, voiceListTick, user?.planId, availableGooglePresets, isPaidSubscriber]);

  const playVoicePreview = useCallback(async (dataUrl: string | null | undefined) => {
    if (!dataUrl) return;
    voicePreviewResumePlayRef.current = null;
    setVoicePreviewNeedsUserPlay(false);
    const el = voicePreviewAudioRef.current;
    if (!el) return;
    const result = await playAudioFromPreviewSource(el, dataUrl, voicePreviewBlobUrlRef);
    if (result.kind === "played") return;
    if (result.kind === "autoplay_blocked") {
      voicePreviewResumePlayRef.current = async () => {
        const a = voicePreviewAudioRef.current;
        if (!a) return;
        try {
          a.currentTime = 0;
          await a.play();
          setVoicePreviewNeedsUserPlay(false);
          voicePreviewResumePlayRef.current = null;
        } catch (e2) {
          setGenerateError(
            isAudioAutoplayBlockedError(e2)
              ? "미리듣기 재생을 시작할 수 없습니다. 화면을 한 번 클릭한 뒤 다시 시도해 주세요."
              : e2 instanceof Error
                ? e2.message
                : "미리듣기 재생에 실패했습니다."
          );
        }
      };
      setVoicePreviewNeedsUserPlay(true);
      return;
    }
    setGenerateError(result.message);
  }, []);

  const validateBgm = () => {
    if (!bgmUrl.trim()) {
      setBgmError(null);
      return true;
    }
    if (!youtubeId) {
      setBgmError("유효한 YouTube 주소가 아닙니다.");
      return false;
    }
    if (bgmPlayRange === "segment") {
      const start = totalSecondsFromMinSec(bgmStartMin, bgmStartSec);
      const end = totalSecondsFromMinSec(bgmEndMin, bgmEndSec);
      if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
        setBgmError("음악 시작·종료 시간을 분·초로 올바르게 입력해 주세요. 종료는 시작보다 항상 커야 합니다.");
        return false;
      }
    }
    setBgmError(null);
    return true;
  };

  const refreshHasAudio = useCallback(async () => {
    if (!sessionId) return;
    const present = await hasStoredAudio(sessionId);
    setHasAudio(present);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const applySession = async (s: SessionWithItems | null) => {
      if (s) {
      setSessionBase(s);
      setTitle(s.title ?? "");
      const loadedPromoRawText = s.promoRawText ?? "";
      setPromoRawText(loadedPromoRawText);
      lastScriptSourceRef.current = loadedPromoRawText.trim();
      lastGeneratedPromoRawRef.current = loadedPromoRawText.trim();
      const genText = s.generatedText ?? "";
      const vol =
        s.bgmVolume != null && Number.isFinite(Number(s.bgmVolume))
          ? Math.max(0, Math.min(100, Math.round(Number(s.bgmVolume))))
          : 40;
      setContent(genText);
      setBgmVolume(vol);
      const loadedBgmUrl = s.bgmYoutubeUrl ?? "";
      setBgmUrl(loadedBgmUrl);
      setMusicSectionOpen(Boolean(loadedBgmUrl.trim()));
      setMusicMode(s.musicMode === "background" ? "background" : "interval");
      const bs = s.bgmStartSeconds;
      const be = s.bgmEndSeconds;
      let playRange: "full" | "segment" = "full";
      let smin = "";
      let ssec = "";
      let emin = "";
      let esec = "";
      if (bs != null && be != null && be > bs) {
        playRange = "segment";
        smin = String(Math.floor(bs / 60));
        ssec = String(bs % 60);
        emin = String(Math.floor(be / 60));
        esec = String(be % 60);
        setBgmPlayRange("segment");
        setBgmStartMin(smin);
        setBgmStartSec(ssec);
        setBgmEndMin(emin);
        setBgmEndSec(esec);
      } else {
        setBgmPlayRange("full");
        setBgmStartMin("");
        setBgmStartSec("");
        setBgmEndMin("");
        setBgmEndSec("");
      }
      itemsRef.current = s.items ?? [];
      eventItemsRef.current = s.eventItems ?? [];

      const list = await fetchVoiceTemplatesForPlan(user?.planId);
      const loadedBreak = normalizeTtsLineBreakPauseSeconds(s.ttsBreakSeconds);
      const loadedSpeed =
        s.ttsRate != null ? ratePercentToSpeed(s.ttsRate) : DEFAULT_TTS.speed;
      let loadedPresetId = "";
      if (s.ttsVoiceTemplateId) {
        const t = list.find((x) => x.id === s.ttsVoiceTemplateId);
        if (t) loadedPresetId = t.id;
      }
      if (!loadedPresetId && s.voice) {
        const preset = list.find((p) => p.voice === s.voice);
        if (preset) loadedPresetId = preset.id;
      }
      if (!loadedPresetId && list[0]) loadedPresetId = list[0].id;

      setTtsBreakSeconds(loadedBreak);
      setSpeed(loadedSpeed);
      setGooglePresetId(loadedPresetId);
      const hasPlaybackHistory = Boolean(s.lastPlayedAt);
      if (!hasPlaybackHistory) {
        setLoopMode("count");
        setRepeatCount(1);
        setGapSeconds(0);
      } else {
        setLoopMode(s.playbackLoopMode === "infinite" ? "infinite" : "count");
        setRepeatCount(
          s.playbackRepeatCount != null && Number.isFinite(Number(s.playbackRepeatCount))
            ? Math.max(1, Math.floor(Number(s.playbackRepeatCount)))
            : 1
        );
        setGapSeconds(
          s.playbackGapSeconds != null && Number.isFinite(Number(s.playbackGapSeconds))
            ? Math.max(0, Math.floor(Number(s.playbackGapSeconds)))
            : 0
        );
      }

      committedPlaybackRef.current = buildBroadcastPlaybackCommitSnapshot({
        content: genText,
        bgmVolume: vol,
        bgmUrl: s.bgmYoutubeUrl ?? "",
        musicMode: s.musicMode === "background" ? "background" : "interval",
        bgmPlayRange: playRange,
        bgmStartMin: smin,
        bgmStartSec: ssec,
        bgmEndMin: emin,
        bgmEndSec: esec,
        ttsGooglePresetId: loadedPresetId,
        ttsSpeed: loadedSpeed,
        ttsBreakSeconds: loadedBreak,
      });
      setPlaybackSectionOpen(true);
      } else {
        committedPlaybackRef.current = null;
        setMusicSectionOpen(false);
      }
      setLoaded(true);
      void refreshHasAudio();
    };
    void applySession(getSession(sessionId) as SessionWithItems | null);
    const onUpdate = () => {
      void applySession(getSession(sessionId) as SessionWithItems | null);
    };
    window.addEventListener("mart-sessions-updated", onUpdate as EventListener);
    return () => window.removeEventListener("mart-sessions-updated", onUpdate as EventListener);
  }, [sessionId, refreshHasAudio, user?.planId]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      if (voicePreviewBlobUrlRef.current) URL.revokeObjectURL(voicePreviewBlobUrlRef.current);
    };
  }, []);

  const generateScriptFromPromo = useCallback(async (rawText: string): Promise<string> => {
    const trimmed = rawText.trim();
    const res = await fetch("/api/broadcast/promo-to-script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText: trimmed }),
    });
    const data = (await res.json().catch(() => ({}))) as { script?: string; error?: string };
    if (!res.ok) {
      throw new Error(data.error || `오류 ${res.status}`);
    }
    if (!data.script?.trim()) {
      throw new Error("생성된 방송문이 없습니다.");
    }
    return data.script.trim();
  }, []);

  const handleGenerate = async () => {
    const rawTextTrimmed = promoRawText.trim();
    const shouldGenerateScript = Boolean(rawTextTrimmed) && rawTextTrimmed !== lastScriptSourceRef.current;
    if (shouldGenerateScript && maxChars != null && promoRawText.length > maxChars) {
      setScriptError(
        `광고 문자 내용이 구독 플랜 글자 수(${maxChars.toLocaleString()}자)를 초과했습니다. 내용을 줄여 주세요.`
      );
      return;
    }
    if (!shouldGenerateScript && !content.trim()) {
      setGenerateError("방송 내용을 입력하거나 광고 문자 내용을 입력해 주세요.");
      return;
    }
    if (!sessionId) return;
    if (!validateBgm()) return;
    setIsGenerating(true);
    setGenerateError(null);
    setScriptError(null);

    try {
      let effectiveContent = content.trim();
      if (shouldGenerateScript) {
        effectiveContent = await generateScriptFromPromo(rawTextTrimmed);
        setContent(effectiveContent);
        lastScriptSourceRef.current = rawTextTrimmed;
      }
      const gp =
        availableGooglePresets.find((p) => p.id === googlePresetId) ?? availableGooglePresets[0];
      if (!gp) {
        setGenerateError("사용 가능한 음성 템플릿이 없습니다. 관리자에서 음성 템플릿을 등록해 주세요.");
        return;
      }
      const synth = buildGoogleTtsSynthesizeBody(effectiveContent, gp, speed, ttsBreakSeconds);
      const res = await fetch("/api/tts-google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(googleTtsApiJsonBody(synth)),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `오류 ${res.status}`);
      }
      const blob = await res.blob();
      await saveAudio(sessionId, blob);

      const now = new Date().toISOString();
      const base = sessionBase;
      const session: Session = {
        id: sessionId,
        title: title.trim() || base?.title || "제목 없음",
        promoRawText: promoRawText.trim() || null,
        eventType: base?.eventType ?? "FREE",
        customOpening: base?.customOpening,
        scheduledAt: base?.scheduledAt ?? null,
        scheduledEndAt: base?.scheduledEndAt ?? null,
        repeatMinutes: base?.repeatMinutes ?? 5,
        itemSuffixIsnida: base?.itemSuffixIsnida ?? true,
        lastGeneratedAt: now,
        lastPlayedAt: base?.lastPlayedAt ?? null,
        latestAudioUrl: base?.latestAudioUrl ?? null,
        generatedText: effectiveContent,
        musicMode,
        bgmYoutubeUrl: bgmUrl.trim() || null,
        bgmStartSeconds:
          bgmPlayRange === "segment"
            ? totalSecondsFromMinSec(bgmStartMin, bgmStartSec)
            : null,
        bgmEndSeconds:
          bgmPlayRange === "segment" ? totalSecondsFromMinSec(bgmEndMin, bgmEndSec) : null,
        ttsProvider: "google",
        ttsVoiceTemplateId: gp.id,
        voice: gp.voice,
        ttsRate: speedToRatePercent(speed),
        ttsBreakSeconds,
        playbackLoopMode: loopMode,
        playbackRepeatCount: Math.max(1, Math.floor(repeatCount) || 1),
        playbackGapSeconds: Math.max(0, Math.floor(gapSeconds) || 0),
        bgmVolume,
        createdAt: base?.createdAt ?? now,
        updatedAt: now,
      };

      await saveSession(session, itemsRef.current, eventItemsRef.current);
      setSessionBase(session);
      await refreshHasAudio();
      lastGeneratedPromoRawRef.current = rawTextTrimmed;
      committedPlaybackRef.current = buildBroadcastPlaybackCommitSnapshot({
        content: effectiveContent,
        bgmVolume,
        bgmUrl,
        musicMode,
        bgmPlayRange,
        bgmStartMin,
        bgmStartSec,
        bgmEndMin,
        bgmEndSec,
        ttsGooglePresetId: googlePresetId,
        ttsSpeed: speed,
        ttsBreakSeconds,
      });
      setPlaybackSectionVisible(true);
      setPlaybackSectionOpen(true);
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsGenerating(false);
    }
  };

  const waitGap = useCallback(async (gen: number): Promise<boolean> => {
    const gap = gapSecondsRef.current;
    if (gap <= 0) return playbackGenRef.current === gen;
    await new Promise<void>((resolve) => window.setTimeout(resolve, gap * 1000));
    return playbackGenRef.current === gen;
  }, []);

  const play = useCallback(
    async (gen: number, startAtSeconds?: number) => {
      if (playbackGenRef.current !== gen) return;
      if (!audioRef.current) return;
      if (!sessionId) return;
      activePlaybackGenRef.current = gen;

      try {
        const blob = await getAudioBlob(sessionId);
        if (!blob) return;
        if (playbackGenRef.current !== gen) return;

        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = URL.createObjectURL(blob);
        audioRef.current.src = blobUrlRef.current;

        if (startAtSeconds != null && Number.isFinite(startAtSeconds) && startAtSeconds >= 0) {
          audioRef.current.currentTime = startAtSeconds;
        }

        if (hasBgm && ytPlayer.ready) {
          if (musicMode === "background") {
            phaseRef.current = "tts";
            try {
              ytPlayer.setVolume(bgmVolume);
              ytPlayer.playSegment(startAtSeconds);
            } catch (e) {
              // BGM(유튜브) 쪽이 막혀도 음성 재생은 계속 진행한다.
              console.warn("ytPlayer.playSegment failed:", e);
            }
            audioRef.current.onended = async () => {
              if (playbackGenRef.current !== gen) return;
              if (phaseRef.current !== "tts") return;
              // 배경음악 모드에서는 음성(TTS)이 끝나는 즉시 BGM을 끊는다.
              // (BGM 구간이 더 길어도 음성 길이에 맞춰 잘라야 한다.)
              try {
                ytPlayer.stop();
              } catch (e) {
                console.warn("ytPlayer.stop failed:", e);
              }
              cyclesCompletedRef.current += 1;
              if (
                !loopInfiniteRef.current &&
                cyclesCompletedRef.current >= repeatCountRef.current
              ) {
                phaseRef.current = "idle";
                setIsPlaying(false);
                return;
              }
              if (!(await waitGap(gen))) return;
              await play(gen);
            };
          } else {
            phaseRef.current = "tts";
            audioRef.current.onended = () => {
              if (playbackGenRef.current !== gen) return;
              if (modeRef.current !== "interval") return;
              if (!hasBgm || !ytPlayer.ready) {
                phaseRef.current = "idle";
                setIsPlaying(false);
                return;
              }
              phaseRef.current = "bgm";
              try {
                ytPlayer.setVolume(bgmVolume);
                ytPlayer.playSegment();
              } catch (e) {
                console.warn("ytPlayer.playSegment failed:", e);
              }
            };
          }
        } else {
          phaseRef.current = "tts";
          audioRef.current.onended = async () => {
            if (playbackGenRef.current !== gen) return;
            if (phaseRef.current !== "tts") return;
            cyclesCompletedRef.current += 1;
            if (
              !loopInfiniteRef.current &&
              cyclesCompletedRef.current >= repeatCountRef.current
            ) {
              phaseRef.current = "idle";
              setIsPlaying(false);
              return;
            }
            if (!(await waitGap(gen))) return;
            await play(gen);
          };
        }

        await audioRef.current.play();
        if (playbackGenRef.current !== gen) return;
        setIsPlaying(true);
        setIsPaused(false);

        const now = new Date().toISOString();
        setSessionBase((b) => {
          if (!b) return b;
          const updated: Session = {
            ...b,
            playbackLoopMode: loopMode,
            playbackRepeatCount: Math.max(1, Math.floor(repeatCount) || 1),
            playbackGapSeconds: Math.max(0, Math.floor(gapSeconds) || 0),
            lastPlayedAt: now,
            updatedAt: now,
          };
          void saveSession(updated, itemsRef.current, eventItemsRef.current);
          return updated;
        });
      } catch (e) {
        if (playbackGenRef.current !== gen) return;
        phaseRef.current = "idle";
        const detail =
          e instanceof DOMException
            ? `${e.name}`
            : e instanceof Error
              ? e.message
              : String(e);
        console.error("audio.play() failed:", e);
        setGenerateError(`재생을 시작할 수 없습니다. (${detail})`);
      }
    },
    [sessionId, hasBgm, ytPlayer, bgmVolume, gapSeconds, loopMode, musicMode, repeatCount, waitGap]
  );

  const beginPlayback = useCallback(() => {
    playbackGenRef.current += 1;
    const gen = playbackGenRef.current;
    cyclesCompletedRef.current = 0;
    pausedAtRef.current = 0;
    void play(gen, 0);
  }, [play]);

  const pause = useCallback(() => {
    playbackGenRef.current += 1;
    if (audioRef.current) {
      pausedAtRef.current = audioRef.current.currentTime || 0;
      audioRef.current.onended = null;
      audioRef.current.pause();
    }
    if (hasBgm) ytPlayer.stop();
    phaseRef.current = "idle";
    setIsPlaying(false);
    setIsPaused(true);
  }, [hasBgm, ytPlayer]);

  const resumePlayback = useCallback(() => {
    playbackGenRef.current += 1;
    const gen = playbackGenRef.current;
    void play(gen, pausedAtRef.current);
  }, [play]);

  const stop = useCallback(() => {
    playbackGenRef.current += 1;
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (hasBgm) ytPlayer.stop();
    phaseRef.current = "idle";
    setIsPlaying(false);
    setIsPaused(false);
    pausedAtRef.current = 0;
  }, [hasBgm, ytPlayer]);

  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => {
    const hasCommittedPlayback = Boolean(committedPlaybackRef.current && hasAudio);
    if (!hasCommittedPlayback) {
      setPlaybackSectionVisible(false);
      return;
    }
    const cur = buildBroadcastPlaybackCommitSnapshot({
      content,
      bgmVolume,
      bgmUrl,
      musicMode,
      bgmPlayRange,
      bgmStartMin,
      bgmStartSec,
      bgmEndMin,
      bgmEndSec,
      ttsGooglePresetId: googlePresetId,
      ttsSpeed: speed,
      ttsBreakSeconds,
    });
    const snapshotMatched = broadcastPlaybackCommitMatches(committedPlaybackRef.current, cur);
    const promoMatched = promoRawText.trim() === lastGeneratedPromoRawRef.current;
    if (snapshotMatched && promoMatched) {
      setPlaybackSectionVisible(true);
      return;
    }
    setPlaybackSectionVisible(true);
    setPlaybackSectionOpen(false);
    stopRef.current();
  }, [
    content,
    promoRawText,
    bgmVolume,
    bgmUrl,
    musicMode,
    bgmPlayRange,
    bgmStartMin,
    bgmStartSec,
    bgmEndMin,
    bgmEndSec,
    googlePresetId,
    speed,
    ttsBreakSeconds,
    hasAudio,
  ]);

  useEffect(() => {
    onBgmEndRef.current = () => {
      if (modeRef.current !== "interval") return;
      if (phaseRef.current !== "bgm") return;
      const gen = activePlaybackGenRef.current;
      if (playbackGenRef.current !== gen) return;

      cyclesCompletedRef.current += 1;
      if (!loopInfiniteRef.current && cyclesCompletedRef.current >= repeatCountRef.current) {
        phaseRef.current = "idle";
        setIsPlaying(false);
        return;
      }

      phaseRef.current = "idle";
      void (async () => {
        if (!(await waitGap(gen))) return;
        await play(gen);
      })();
    };
  }, [play, waitGap]);

  if (!sessionId) {
    return (
      <main className="min-h-full bg-[var(--bg)] p-8">
        <p className="text-base text-stone-600">잘못된 경로입니다.</p>
        <Link href="/" className="mt-2 inline-block text-base text-amber-700 hover:underline">
          ← 첫 화면
        </Link>
      </main>
    );
  }

  if (!loaded) {
    return (
      <main className="min-h-full bg-[var(--bg)] p-8">
        <p className="text-base text-stone-600">불러오는 중...</p>
      </main>
    );
  }

  if (!sessionBase) {
    return (
      <main className="min-h-full bg-[var(--bg)] p-8">
        <p className="text-base text-stone-600">해당 방송을 찾을 수 없습니다.</p>
        <Link href="/" className="mt-2 inline-block text-base text-amber-700 hover:underline">
          ← 첫 화면
        </Link>
      </main>
    );
  }

  const disabled =
    !title.trim() || overLimit || (!promoRawText.trim() && !content.trim());

  return (
    <main className="min-h-full bg-[var(--bg)]">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-4xl font-bold tracking-tight text-stone-800">기존 방송</h1>

        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-stone-800">1. 방송 내용 입력</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="text-base font-medium text-stone-700">방송 제목</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 오후 3시 행사 안내 방송"
                className="mt-1.5 w-full rounded-lg border border-stone-200 px-3 py-2.5 text-base text-stone-800"
              />
            </div>
            <div>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <label htmlFor="edit-broadcast-promo" className="text-base font-medium text-stone-700">
                  상품 정보(상품명, 단위, 판매가) 입력
                </label>
                <span className="text-sm tabular-nums text-stone-500" aria-live="polite">
                  광고문 {promoLength.toLocaleString()}
                  {maxChars != null ? ` / ${maxChars.toLocaleString()}자` : "자"}
                </span>
              </div>
              <textarea
                id="edit-broadcast-promo"
                value={promoRawText}
                onChange={(e) => setPromoRawText(e.target.value)}
                placeholder="입력한 품목명과 단위, 가격 등을 바탕으로 방송을 자연스럽게 만들어 드립니다."
                className="mt-1.5 min-h-[280px] w-full rounded-lg border border-stone-200 px-3 py-3 text-base leading-relaxed text-stone-800"
              />
              {scriptError && (
                <p className="mt-1.5 text-base leading-relaxed text-red-600">{scriptError}</p>
              )}
            </div>
            <div>
              <div className="text-base font-medium text-stone-700">
                <span id="edit-broadcast-content-label">방송 내용 미리보기</span>
              </div>
              <textarea
                id="edit-broadcast-content"
                aria-labelledby="edit-broadcast-content-label"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="오늘 마트에서 안내하고 싶은 방송 멘트를 그대로 입력해 주세요."
                className="mt-1.5 min-h-[360px] w-full rounded-lg border border-stone-200 px-3 py-3 text-base leading-relaxed text-stone-800"
              />
              {overLimit && (
                <p className="mt-1.5 text-sm leading-relaxed text-red-600">
                  광고 문자 글자 수 제한을 초과했습니다. 다른 플랜을 구독해 보세요.
                </p>
              )}
              {maxChars == null && (
                <p className="mt-1.5 text-sm leading-relaxed text-stone-500">
                  현재 플랜은 광고 문자 글자 수 제한이 없습니다.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-stone-800">2. (선택) 음악</h2>
              <p className="mt-2 text-base leading-relaxed text-stone-600">
                방송 음성과 함께 사용할 YouTube 음악을 선택할 수 있습니다.
                <br />
                배경음악은 음성과 함께, 중간음악은 음성 뒤에 재생됩니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMusicSectionOpen((prev) => !prev)}
              className="rounded-lg border border-stone-300 px-3 py-2 text-base font-medium text-stone-700 hover:bg-stone-50"
              aria-expanded={musicSectionOpen}
            >
              {musicSectionOpen ? "접기" : "펼치기"}
            </button>
          </div>

          {musicSectionOpen && (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-base text-stone-700">
                <span className="text-sm font-semibold text-stone-600">재생 방식</span>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="musicMode"
                    value="background"
                    checked={musicMode === "background"}
                    onChange={() => setMusicMode("background")}
                    className="h-5 w-5 border-stone-300 text-amber-600"
                  />
                  <span>배경음악</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="musicMode"
                    value="interval"
                    checked={musicMode === "interval"}
                    onChange={() => setMusicMode("interval")}
                    className="h-5 w-5 border-stone-300 text-amber-600"
                  />
                  <span>중간음악</span>
                </label>
              </div>
              <div>
                <label className="text-base font-medium text-stone-700">YouTube URL</label>
                <input
                  type="text"
                  value={bgmUrl}
                  onChange={(e) => setBgmUrl(e.target.value)}
                  placeholder="예: https://www.youtube.com/watch?v=..."
                  className="mt-1.5 w-full rounded-lg border border-stone-200 px-3 py-2.5 text-base text-stone-800"
                />
              </div>
              {youtubeId ? (
                <div className="mt-2 space-y-4">
                  <p className="text-sm leading-relaxed text-stone-600">
                    아래 미리듣기에서 지정한 구간이 제대로 재생되는지 확인해 보세요.
                    <br />
                    유튜브 영상의 원하는 구간만 재생할 수 있습니다.
                  </p>
                  <div className="flex flex-wrap items-center gap-4 text-base text-stone-700">
                    <span className="text-sm font-semibold text-stone-600">배경 음악 구간</span>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="bgmPlayRange"
                        value="full"
                        checked={bgmPlayRange === "full"}
                        onChange={() => setBgmPlayRange("full")}
                        className="h-5 w-5 border-stone-300 text-amber-600"
                      />
                      <span>전체 재생</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="bgmPlayRange"
                        value="segment"
                        checked={bgmPlayRange === "segment"}
                        onChange={() => setBgmPlayRange("segment")}
                        className="h-5 w-5 border-stone-300 text-amber-600"
                      />
                      <span>구간 재생</span>
                    </label>
                  </div>
                  {bgmPlayRange === "segment" && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="text-base font-medium text-stone-700">음악 시작 시간</label>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={bgmStartMin}
                            onChange={(e) => setBgmStartMin(digitsOnly(e.target.value))}
                            placeholder="0"
                            className="w-20 rounded-lg border border-stone-200 px-2 py-2.5 text-center text-base text-stone-800"
                          />
                          <span className="text-base text-stone-600">분</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={bgmStartSec}
                            onChange={(e) => setBgmStartSec(digitsOnly(e.target.value))}
                            placeholder="0"
                            className="w-20 rounded-lg border border-stone-200 px-2 py-2.5 text-center text-base text-stone-800"
                          />
                          <span className="text-base text-stone-600">초</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-base font-medium text-stone-700">음악 종료 시간</label>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={bgmEndMin}
                            onChange={(e) => setBgmEndMin(digitsOnly(e.target.value))}
                            placeholder="0"
                            className="w-20 rounded-lg border border-stone-200 px-2 py-2.5 text-center text-base text-stone-800"
                          />
                          <span className="text-base text-stone-600">분</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={bgmEndSec}
                            onChange={(e) => setBgmEndSec(digitsOnly(e.target.value))}
                            placeholder="0"
                            className="w-20 rounded-lg border border-stone-200 px-2 py-2.5 text-center text-base text-stone-800"
                          />
                          <span className="text-base text-stone-600">초</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {bgmError && <p className="text-sm leading-relaxed text-red-600">{bgmError}</p>}
                  <div>
                    <h4 className="text-base font-semibold text-stone-800">음악 볼륨</h4>
                    <p className="mt-1 text-sm leading-relaxed text-stone-600">
                      방송과 함께 재생되거나 중간에 재생되는 YouTube 구간의 음량입니다.
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={bgmVolume}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setBgmVolume(v);
                          ytPlayer.setVolume(v);
                          setYoutubeEmbedIframeVolume(previewIframeRef.current, v);
                        }}
                        className="h-2 flex-1 accent-amber-500"
                      />
                      <span className="w-12 text-base tabular-nums text-stone-700">{bgmVolume}%</span>
                    </div>
                  </div>
                  <div className="aspect-video overflow-hidden rounded-xl border border-stone-200 bg-stone-900">
                    <iframe
                      ref={previewIframeRef}
                      key={previewSrc ?? ""}
                      src={previewSrc ?? undefined}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      title="배경 음악 미리듣기"
                      onLoad={() =>
                        setYoutubeEmbedIframeVolume(previewIframeRef.current, bgmVolume)
                      }
                    />
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>

        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-stone-800">3. 음성 생성</h2>
          <div id={containerId} className="h-px w-px overflow-hidden opacity-0" aria-hidden />

          <audio
            ref={audioRef}
            onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
            onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
            onDurationChange={() => setDuration(audioRef.current?.duration ?? 0)}
          />
          <audio ref={voicePreviewAudioRef} className="hidden" preload="auto" />

          <div className="mt-6 border-t border-stone-100 pt-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-stone-800">목소리 선택</h3>
              {!isPaidSubscriber && availableGooglePresets.some((x) => x.paidOnly === true) && (
                <button
                  type="button"
                  onClick={() => setShowPaidVoiceSubscribeGuide(true)}
                  className="rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600"
                >
                  유료 목소리 사용하기
                </button>
              )}
              </div>
              {showPaidVoiceSubscribeGuide && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 px-4">
                  <div className="w-full max-w-sm rounded-xl border border-amber-200 bg-white p-4 shadow-xl">
                    <p className="text-sm text-stone-800">
                      다양한 목소리를 이용하려면 유료 구독이 필요합니다.
                      <br />
                      구독 화면으로 이동하시겠어요?
                    </p>
                    <div className="mt-4 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowPaidVoiceSubscribeGuide(false)}
                        className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
                      >
                        닫기
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowPaidVoiceSubscribeGuide(false);
                          router.push("/pricing");
                        }}
                        className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                      >
                        이동
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {availableGooglePresets.map((p) => {
                  const paidLocked = !isPaidSubscriber && p.paidOnly === true;
                  return (
                    <div
                      key={p.id}
                      className={`rounded-lg border px-3 py-2.5 text-base ${
                        googlePresetId === p.id && !paidLocked
                          ? "border-amber-500 bg-amber-50"
                          : "border-stone-200"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name="googlePreset"
                            value={p.id}
                            checked={googlePresetId === p.id}
                            onChange={() => {
                              if (paidLocked) return;
                              setGooglePresetId(p.id);
                            }}
                            disabled={paidLocked}
                            className="h-5 w-5 border-stone-300 text-amber-600"
                          />
                          {p.paidOnly && (
                            <span className="rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                              유료
                            </span>
                          )}
                          <span>{p.label}</span>
                        </label>
                        {paidLocked && (
                          <button
                            type="button"
                            disabled={!p.previewAudioDataUrl}
                            title={
                              p.previewAudioDataUrl
                                ? undefined
                                : "관리자 사이트에서 해당 음성의 미리듣기를 저장한 뒤 이용할 수 있습니다."
                            }
                            onClick={() => void playVoicePreview(p.previewAudioDataUrl)}
                            className="rounded-md border border-stone-300 px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50 enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 sm:ml-auto sm:w-auto w-full"
                          >
                            미리듣기
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {voicePreviewNeedsUserPlay && (
                <div
                  className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                  role="status"
                >
                  <span className="min-w-0 flex-1">
                    브라우저 정책으로 자동 재생이 제한되었습니다. 아래를 누르면 바로 들을 수 있습니다.
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                    onClick={() => void voicePreviewResumePlayRef.current?.()}
                  >
                    재생하기
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4">
              <span className="block text-base font-medium text-stone-600">말하기 속도 {speed.toFixed(1)}x</span>
              <div className="mt-1.5 flex items-center gap-3">
                <input
                  type="range"
                  min={SPEED_MIN}
                  max={SPEED_MAX}
                  step={0.1}
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="h-2 w-32 flex-1 accent-amber-500"
                />
                <div className="flex gap-1 rounded-lg border border-stone-200 p-0.5">
                  {SPEED_PRESETS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSpeed(v)}
                      className={`min-w-[2.25rem] rounded px-2 py-1.5 text-base ${
                        speed === v ? "bg-amber-500 text-white" : "text-stone-600 hover:bg-stone-100"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating || disabled}
                className="w-full max-w-xs rounded-xl bg-amber-500 px-6 py-3 text-base font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {isGenerating ? "생성 중…" : "음성 생성"}
              </button>
            </div>
            {generateError && <p className="mt-2 text-base leading-relaxed text-red-600">{generateError}</p>}
            {hasAudio && !generateError && playbackSectionVisible && playbackSectionOpen && (
              <p className="mt-2 text-center text-base leading-relaxed text-green-700">
                오디오가 준비되었습니다. 아래 재생 영역을 확인해 주세요.
                <br />
                방송 내용이나 음악이 바뀌면 다시 생성해야 합니다.
              </p>
            )}
            {hasAudio && !generateError && playbackSectionVisible && !playbackSectionOpen && (
              <p className="mt-2 text-center text-base leading-relaxed text-amber-800">
                광고 문자 내용 또는 방송 설정이 변경되었습니다. 음성 생성을 다시 해주세요.
              </p>
            )}
          </div>
        </section>

        {playbackSectionVisible && (
          <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-2xl font-semibold text-stone-800">4. 재생</h2>
              <button
                type="button"
                onClick={() => setPlaybackSectionOpen((prev) => !prev)}
                className="rounded-lg border border-stone-300 px-3 py-2 text-base font-medium text-stone-700 hover:bg-stone-50"
                aria-expanded={playbackSectionOpen}
              >
                {playbackSectionOpen ? "접기" : "펼치기"}
              </button>
            </div>
            {playbackSectionOpen && (
            <>
            <div className="mt-6 max-w-md space-y-3 border-t border-stone-100 pt-4">
              <p className="text-base font-semibold text-stone-800">반복 방식</p>
              <div className="flex flex-wrap gap-4 text-base text-stone-700">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="loopMode"
                    checked={loopMode === "infinite"}
                    onChange={() => setLoopMode("infinite")}
                    className="h-5 w-5 border-stone-300 text-amber-600"
                  />
                  무한 반복
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="loopMode"
                    checked={loopMode === "count"}
                    onChange={() => setLoopMode("count")}
                    className="h-5 w-5 border-stone-300 text-amber-600"
                  />
                  횟수 지정
                </label>
              </div>
              {loopMode === "count" && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="repeat-count-edit" className="block text-sm font-medium text-stone-600">
                    방송 횟수 (중간음악 모드는 음성+음악 1회 = 1회)
                  </label>
                  <input
                    id="repeat-count-edit"
                    type="number"
                    min={1}
                    max={999}
                    value={repeatCount}
                    onChange={(e) =>
                      setRepeatCount(Math.max(1, Math.floor(Number(e.target.value)) || 1))
                    }
                    className="w-full max-w-[8rem] rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-base text-stone-800"
                  />
                </div>
              )}
              <div>
                <label htmlFor="gap-seconds-edit" className="text-sm font-medium text-stone-600">
                  재생 간격 (초)
                </label>
                <p className="mt-1 text-sm leading-relaxed text-stone-600">
                  방송이 한 번 끝난 뒤 다음 방송까지 기다리는 시간입니다.
                </p>
                <input
                  id="gap-seconds-edit"
                  type="number"
                  min={0}
                  max={3600}
                  step={1}
                  value={gapSeconds}
                  onChange={(e) =>
                    setGapSeconds(Math.max(0, Math.floor(Number(e.target.value)) || 0))
                  }
                  className="mt-1.5 w-full max-w-[8rem] rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-base text-stone-800"
                />
              </div>
            </div>
            <div className="mt-6 border-t border-stone-100 pt-4">
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={isPlaying ? pause : isPaused ? resumePlayback : beginPlayback}
                    disabled={!hasAudio}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-stone-800 text-white disabled:opacity-40"
                    aria-label={isPlaying ? "일시정지" : "재생"}
                  >
                    {isPlaying ? "⏸" : "▶"}
                  </button>
                  <button
                    type="button"
                    onClick={stop}
                    disabled={!hasAudio}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-stone-800 text-white disabled:opacity-40"
                    aria-label="정지"
                  >
                    ⏹
                  </button>
                </div>
                {hasBgm && !ytPlayer.ready && (
                  <p className="mt-1 text-sm text-stone-600">중간 음악 로딩 중…</p>
                )}
                {hasAudio && duration > 0 && (
                  <div className="w-full max-w-md">
                    <input
                      type="range"
                      min={0}
                      max={duration}
                      step={0.1}
                      value={currentTime}
                      onChange={(e) => {
                        const t = parseFloat(e.target.value);
                        if (audioRef.current) audioRef.current.currentTime = t;
                        setCurrentTime(t);
                      }}
                      className="h-2 w-full accent-amber-500"
                    />
                    <div className="mt-0.5 flex justify-between text-sm tabular-nums text-stone-600">
                      <span>
                        {Math.floor(currentTime / 60)}:
                        {String(Math.floor(currentTime % 60)).padStart(2, "0")}
                      </span>
                      <span>
                        {Math.floor(duration / 60)}:
                        {String(Math.floor(duration % 60)).padStart(2, "0")}
                      </span>
                    </div>
                  </div>
                )}
                {!hasAudio && (
                  <p className="mt-1 text-base leading-relaxed text-stone-600">먼저 음성 생성을 해주세요.</p>
                )}
              </div>
            </div>
            </>
            )}
          </section>
        )}
      </div>

    </main>
  );
}
