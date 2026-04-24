"use client";

import {
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  type ReactNode,
} from "react";
import Link from "next/link";
import { getAllSessions, saveSession } from "@/lib/store";
import { generateId, extractYoutubeId } from "@/lib/utils";
import type { Session, SessionWithItems } from "@/lib/types";
import {
  getCurrentUser,
  getMaxCharsForUser,
  getVisibleSessionCountForUser,
  refreshCurrentUser,
  type AuthUser,
} from "@/lib/auth";
import { FREE_PLAN_BROADCAST_MAX_CHARS } from "@/lib/adminData";
import { saveAudio, getAudioBlob, hasStoredAudio } from "@/lib/audioStorage";
import {
  DEFAULT_TTS,
  SPEED_PRESETS,
  SPEED_MIN,
  SPEED_MAX,
  speedToRatePercent,
} from "@/lib/ttsOptions";
import { useYoutubeSegmentPlayer } from "@/lib/youtubeSegmentPlayer";
import {
  clearVoiceTemplatesClientCache,
  useVoiceTemplatesForPlan,
} from "@/lib/voiceTemplatesClient";
import { buildGoogleTtsSynthesizeBody, googleTtsApiJsonBody } from "@/lib/ttsGoogleRequest";
import { useRouter } from "next/navigation";
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

const DEMO_MAX_CHARS = FREE_PLAN_BROADCAST_MAX_CHARS;
const DEMO_SESSION_ID = "demo-fixed-session";
const DEMO_PREFILL_TITLE = "체험 방송";
const DEMO_PREFILL_PROMO = "국내산 삼겹살 100g 1,980원\n대추방울토마토 1팩 3,900원";
const DEMO_PREFILL_CONTENT =
  "안녕하세요, 고객님들!\n오늘은 국내산 노릇노릇 삼겹살 100그램을 천구백팔십 원에 준비했습니다.\n싱싱하고 달콤한 대추방울토마토 한 팩은 삼천구백 원에 만나보세요.\n맛과 건강을 모두 챙길 수 있는 기회, 많은 관심 부탁드립니다!";
const DEMO_PREFILL_BGM_URL = "";
const DEMO_PREFERRED_VOICE_LABEL = "전통 시장 상인 남성";
const DEMO_AUDIO_VERSION = "2026-04-21-1";

type DemoOnboardingPhase = "pending" | 1 | 2 | 3 | 4 | "done";

type SpotlightRect = { top: number; left: number; width: number; height: number };

function DemoOnboardingSpotlight({
  rect,
  children,
  cornerRadius = 14,
}: {
  rect: SpotlightRect | null;
  children: ReactNode;
  cornerRadius?: number;
}) {
  const [viewport, setViewport] = useState(() =>
    typeof window !== "undefined" ? { w: window.innerWidth, h: window.innerHeight } : { w: 0, h: 0 }
  );

  useLayoutEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  if (viewport.w <= 0 || viewport.h <= 0) return null;

  const pad = 8;
  const t = Math.max(0, rect.top - pad);
  const l = Math.max(0, rect.left - pad);
  const w = rect.width + pad * 2;
  const h = rect.height + pad * 2;
  const { w: vw, h: vh } = viewport;
  const rx = Math.min(cornerRadius, w / 2, h / 2);

  const holePath = `
    M ${l + rx} ${t}
    L ${l + w - rx} ${t}
    A ${rx} ${rx} 0 0 1 ${l + w} ${t + rx}
    L ${l + w} ${t + h - rx}
    A ${rx} ${rx} 0 0 1 ${l + w - rx} ${t + h}
    L ${l + rx} ${t + h}
    A ${rx} ${rx} 0 0 1 ${l} ${t + h - rx}
    L ${l} ${t + rx}
    A ${rx} ${rx} 0 0 1 ${l + rx} ${t}
    Z
  `;

  const pathD = `
    M 0 0 L ${vw} 0 L ${vw} ${vh} L 0 ${vh} Z
    ${holePath}
  `;
  const panelWidth = Math.min(352, vw - 20);
  const panelLeft = Math.min(Math.max(10, l + w / 2 - panelWidth / 2), vw - panelWidth - 10);
  const preferredTop = t - 12 - 50;
  const panelTop = preferredTop >= 10 ? preferredTop : Math.min(t + h + 12, vh - 60);

  return (
    <div className="fixed inset-0 z-[100]" role="presentation">
      <svg
        className="pointer-events-auto fixed inset-0 h-full w-full"
        viewBox={`0 0 ${vw} ${vh}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <path d={pathD} fill="rgba(0,0,0,0.55)" fillRule="evenodd" />
      </svg>
      <div
        className="pointer-events-auto fixed z-[102] rounded-xl border border-stone-200 bg-white px-3 py-2.5 shadow-lg"
        style={{ top: `${panelTop}px`, left: `${panelLeft}px`, width: `${panelWidth}px` }}
        role="dialog"
        aria-modal="true"
        aria-label="안내"
      >
        {children}
      </div>
    </div>
  );
}

export type NewBroadcastScreenProps = {
  demoMode?: boolean;
};

export function NewBroadcastScreen({ demoMode = false }: NewBroadcastScreenProps) {
  const [sessionId] = useState(() => (demoMode ? DEMO_SESSION_ID : generateId()));
  const [title, setTitle] = useState(() => (demoMode ? DEMO_PREFILL_TITLE : ""));
  const [content, setContent] = useState(() => (demoMode ? DEMO_PREFILL_CONTENT : ""));
  const [promoRawText, setPromoRawText] = useState(() => (demoMode ? DEMO_PREFILL_PROMO : ""));
  const [scriptError, setScriptError] = useState<string | null>(null);
  const lastScriptSourceRef = useRef<string>("");
  const [bgmUrl, setBgmUrl] = useState(() => (demoMode ? DEMO_PREFILL_BGM_URL : ""));
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
  const [ttsBreakSeconds] = useState<number>(DEFAULT_TTS.breakSeconds);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bgmVolume, setBgmVolume] = useState(40);
  /** 재생 반복: 무한 또는 지정 횟수 (1회 = 방송 1 사이클) */
  const [loopMode, setLoopMode] = useState<"infinite" | "count">("count");
  const [repeatCount, setRepeatCount] = useState(1);
  /** 사이클 사이 무음 대기 (초) */
  const [gapSeconds, setGapSeconds] = useState(0);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showPaidVoiceSubscribeGuide, setShowPaidVoiceSubscribeGuide] = useState(false);
  /** 음성 생성 성공 후에만 노출. 값이 바뀌면 숨기지 않고 접힌 상태로 유지한다. */
  const [playbackSectionVisible, setPlaybackSectionVisible] = useState(demoMode);
  const [playbackSectionOpen, setPlaybackSectionOpen] = useState(demoMode);
  const lastGeneratedPromoRawRef = useRef<string>("");
  const committedPlaybackRef = useRef<BroadcastPlaybackCommitSnapshot | null>(null);
  const playbackSectionRef = useRef<HTMLElement | null>(null);

  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const voicePreviewBlobUrlRef = useRef<string | null>(null);
  const voicePreviewResumePlayRef = useRef<(() => Promise<void>) | null>(null);
  const [voicePreviewNeedsUserPlay, setVoicePreviewNeedsUserPlay] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const onBgmEndRef = useRef<() => void>(() => {});
  const phaseRef = useRef<"idle" | "tts" | "bgm">("idle");
  const modeRef = useRef<"background" | "interval">("background");
  const loopInfiniteRef = useRef<boolean>(true);
  const repeatCountRef = useRef<number>(3);
  const gapSecondsRef = useRef<number>(0);
  /** 재생 세션마다 증가 — 정지 시 무효화해 대기 중 다음 사이클 취소 */
  const playbackGenRef = useRef(0);
  const pausedAtRef = useRef(0);
  /** 이번 세션에서 완료한 방송 사이클 수 (beginPlayback 때 0) */
  const cyclesCompletedRef = useRef(0);
  const activePlaybackGenRef = useRef(0);
  const demoAudioPreparedRef = useRef(false);

  const [demoOnboardingPhase, setDemoOnboardingPhase] = useState<DemoOnboardingPhase>("pending");
  const [demoSpotlightRect, setDemoSpotlightRect] = useState<SpotlightRect | null>(null);
  const demoTitlePromoRef = useRef<HTMLDivElement | null>(null);
  const demoVoiceSectionRef = useRef<HTMLElement | null>(null);
  const demoVoiceHighlightRef = useRef<HTMLDivElement | null>(null);
  const demoGenerateButtonRef = useRef<HTMLButtonElement | null>(null);
  const demoPlayButtonRef = useRef<HTMLButtonElement | null>(null);

  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(demoMode ? null : getCurrentUser());
  useEffect(() => {
    if (demoMode) return;
    void refreshCurrentUser().then(setUser);
  }, [demoMode]);
  const [voiceListTick, setVoiceListTick] = useState(0);
  const [sessionListTick, setSessionListTick] = useState(0);
  useEffect(() => {
    const onV = () => {
      clearVoiceTemplatesClientCache();
      setVoiceListTick((t) => t + 1);
    };
    window.addEventListener("mart-voice-templates-updated", onV);
    return () => window.removeEventListener("mart-voice-templates-updated", onV);
  }, []);
  useEffect(() => {
    if (demoMode) return;
    const onSessions = () => setSessionListTick((t) => t + 1);
    window.addEventListener("mart-sessions-updated", onSessions);
    return () => window.removeEventListener("mart-sessions-updated", onSessions);
  }, [demoMode]);
  const effectivePlanId = demoMode ? "large" : user?.planId;
  const isPaidSubscriber = effectivePlanId === "small" || effectivePlanId === "medium" || effectivePlanId === "large";
  const availableGooglePresets = useVoiceTemplatesForPlan(effectivePlanId, voiceListTick);
  const planMaxChars: number | null = useMemo(() => getMaxCharsForUser(user), [user]);
  const maxChars: number | null = demoMode ? DEMO_MAX_CHARS : planMaxChars;
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

  useEffect(() => {
    const list = availableGooglePresets;
    if (list.length === 0) return;
    const selectableList = isPaidSubscriber ? list : list.filter((x) => x.paidOnly !== true);
    if (selectableList.length === 0) return;
    setGooglePresetId((prev) => {
      if (demoMode) {
        const preferred = selectableList.find((x) => x.label === DEMO_PREFERRED_VOICE_LABEL);
        return preferred?.id ?? selectableList[0].id;
      }
      return prev && selectableList.some((x) => x.id === prev) ? prev : selectableList[0].id;
    });
  }, [voiceListTick, user, availableGooglePresets, demoMode, isPaidSubscriber]);

  const playVoicePreview = useCallback(async (voiceId: string, previewValue: string | null | undefined) => {
    if (!previewValue) return;
    voicePreviewResumePlayRef.current = null;
    setVoicePreviewNeedsUserPlay(false);
    const el = voicePreviewAudioRef.current;
    if (!el) return;
    const result = await playAudioFromPreviewSource(el, previewValue, voicePreviewBlobUrlRef, {
      voiceId,
    });
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
    const present = await hasStoredAudio(sessionId);
    setHasAudio(present);
  }, [sessionId]);

  const generateScriptFromPromo = useCallback(
    async (rawText: string): Promise<string> => {
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
    },
    []
  );

  useEffect(() => {
    if (!demoMode) return;
    void (async () => {
      if (demoAudioPreparedRef.current) return;
      demoAudioPreparedRef.current = true;
      setContent(DEMO_PREFILL_CONTENT);
      const cacheKey = `mart-demo-audio-version:${DEMO_SESSION_ID}`;
      const cachedVersion = typeof window !== "undefined" ? window.localStorage.getItem(cacheKey) : null;
      const present = await hasStoredAudio(DEMO_SESSION_ID);
      if (!present || cachedVersion !== DEMO_AUDIO_VERSION) {
        const res = await fetch("/demo-broadcast.mp3", { cache: "no-store" });
        if (res.ok) {
          const blob = await res.blob();
          await saveAudio(DEMO_SESSION_ID, blob);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(cacheKey, DEMO_AUDIO_VERSION);
          }
        }
      }
      await refreshHasAudio();
      setPlaybackSectionVisible(true);
    })();
  }, [demoMode, refreshHasAudio]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      if (voicePreviewBlobUrlRef.current) {
        URL.revokeObjectURL(voicePreviewBlobUrlRef.current);
      }
    };
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
      // 음성 생성 직후 오브젝트 URL을 만들어 `blobUrlRef`에 고정합니다.
      // 이후 재생 버튼에서는 IndexedDB 조회(await)를 피해서 autoplay 차단 케이스를 줄입니다.
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      blobUrlRef.current = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.src = blobUrlRef.current;
      }

      const now = new Date().toISOString();
      const session: Session = {
        id: sessionId,
        title: title.trim() || "방송 제목 없음",
        promoRawText: promoRawText.trim() || null,
        eventType: "FREE",
        customOpening: undefined,
        scheduledAt: null,
        scheduledEndAt: null,
        repeatMinutes: 5,
        itemSuffixIsnida: true,
        lastGeneratedAt: now,
        lastPlayedAt: null,
        latestAudioUrl: null,
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
        createdAt: now,
        updatedAt: now,
      };

      if (!demoMode) {
        void saveSession(session, [], []);
      }
      lastGeneratedPromoRawRef.current = rawTextTrimmed;
      await refreshHasAudio();
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

  /** 대기 후에도 같은 재생 세션이면 true */
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
      activePlaybackGenRef.current = gen;

      try {
        // 생성 직후 handleGenerate에서 blob URL을 세팅해뒀다면,
        // 여기서는 IndexedDB await를 건너뛰고 바로 재생만 시도한다.
        if (!blobUrlRef.current) {
          const blob = await getAudioBlob(sessionId);
          if (!blob) return;
          if (playbackGenRef.current !== gen) return;
          blobUrlRef.current = URL.createObjectURL(blob);
          audioRef.current.src = blobUrlRef.current;
        } else {
          audioRef.current.src = blobUrlRef.current;
          if (playbackGenRef.current !== gen) return;
        }

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
              // BGM(유튜브) 쪽 실패가 발생해도 TTS 오디오는 재생되도록 한다.
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
      } catch (e) {
        if (playbackGenRef.current !== gen) return;
        phaseRef.current = "idle";
        const detail =
          e instanceof DOMException
            ? `${e.name}`
            : e instanceof Error
              ? e.message
              : String(e);
        // 재생 실패 원인을 콘솔에 남겨 운영 환경에서도 확인 가능하게 한다.
        // (UI에는 간단한 이름만 표시)
        console.error("audio.play() failed:", e);
        setGenerateError(`재생을 시작할 수 없습니다. (${detail})`);
      }
    },
    [sessionId, hasBgm, ytPlayer, bgmVolume, musicMode, waitGap]
  );

  const beginPlayback = useCallback(() => {
    if (!demoMode) {
      const now = new Date().toISOString();
      const existing = getAllSessions().find((s) => s.id === sessionId) ?? null;
      if (existing) {
        const updated: Session = {
          ...existing,
          playbackLoopMode: loopMode,
          playbackRepeatCount: Math.max(1, Math.floor(repeatCount) || 1),
          playbackGapSeconds: Math.max(0, Math.floor(gapSeconds) || 0),
          lastPlayedAt: now,
          updatedAt: now,
        };
        void saveSession(updated, existing.items, existing.eventItems ?? []);
      } else {
        const fallback: Session = {
          id: sessionId,
          title: title.trim() || "제목 없음",
          promoRawText: promoRawText.trim() || null,
          eventType: "FREE",
          customOpening: undefined,
          scheduledAt: null,
          scheduledEndAt: null,
          repeatMinutes: 5,
          itemSuffixIsnida: true,
          lastGeneratedAt: null,
          lastPlayedAt: now,
          latestAudioUrl: null,
          generatedText: content.trim() || null,
          musicMode,
          bgmYoutubeUrl: bgmUrl.trim() || null,
          bgmStartSeconds:
            bgmPlayRange === "segment"
              ? totalSecondsFromMinSec(bgmStartMin, bgmStartSec)
              : null,
          bgmEndSeconds:
            bgmPlayRange === "segment" ? totalSecondsFromMinSec(bgmEndMin, bgmEndSec) : null,
          ttsProvider: "google",
          ttsVoiceTemplateId: googlePresetId || null,
          ttsRate: speedToRatePercent(speed),
          ttsBreakSeconds,
          playbackLoopMode: loopMode,
          playbackRepeatCount: Math.max(1, Math.floor(repeatCount) || 1),
          playbackGapSeconds: Math.max(0, Math.floor(gapSeconds) || 0),
          bgmVolume,
          createdAt: now,
          updatedAt: now,
        };
        void saveSession(fallback, [], []);
      }
    }
    playbackGenRef.current += 1;
    const gen = playbackGenRef.current;
    cyclesCompletedRef.current = 0;
    pausedAtRef.current = 0;
    void play(gen, 0);
  }, [bgmEndMin, bgmEndSec, bgmPlayRange, bgmStartMin, bgmStartSec, bgmUrl, bgmVolume, content, demoMode, gapSeconds, googlePresetId, loopMode, play, promoRawText, repeatCount, sessionId, speed, title, ttsBreakSeconds, musicMode]);

  const pause = useCallback(() => {
    // 일시정지: currentTime을 유지하고, 재생 루프(onended)만 끊는다.
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
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.onended = null;
    }
    if (hasBgm) {
      ytPlayer.stop();
    }
    phaseRef.current = "idle";
    setIsPlaying(false);
    setIsPaused(false);
    pausedAtRef.current = 0;
  }, [hasBgm, ytPlayer]);

  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => {
    if (demoMode) {
      if (hasAudio) {
        setPlaybackSectionVisible(true);
        setPlaybackSectionOpen(true);
      }
      return;
    }
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
    demoMode,
    hasAudio,
  ]);

  /** 광고문으로 스크립트 생성하는 흐름에서는 방송 미리보기(content)가 비어 있어도 됨. */
  const disabled =
    overLimit || (!promoRawText.trim() && !content.trim());
  const savedSessions = useMemo<SessionWithItems[]>(() => {
    void showLoadModal;
    void sessionListTick;
    if (demoMode) return [];
    if (typeof window === "undefined") return [];
    const all = getAllSessions();
    const visibleLimit = getVisibleSessionCountForUser(user);
    return visibleLimit == null ? all : all.slice(0, visibleLimit);
  }, [showLoadModal, user, demoMode, sessionListTick]);

  const handleLoadSession = useCallback((session: SessionWithItems) => {
    committedPlaybackRef.current = null;
    setTitle(session.title ?? "");
    const loadedPromoRawText = session.promoRawText ?? "";
    setPromoRawText(loadedPromoRawText);
    setContent(session.generatedText ?? "");
    lastScriptSourceRef.current = loadedPromoRawText.trim();
    lastGeneratedPromoRawRef.current = loadedPromoRawText.trim();
    const bv = session.bgmVolume;
    setBgmVolume(
      bv != null && Number.isFinite(Number(bv))
        ? Math.max(0, Math.min(100, Math.round(Number(bv))))
        : 40
    );
    setBgmUrl(session.bgmYoutubeUrl ?? "");
    // 저장된 모드가 없으면 예전 동작을 유지하기 위해 "interval"로 둔다.
    setMusicMode(session.musicMode === "background" ? "background" : "interval");
    const s = session.bgmStartSeconds;
    const e = session.bgmEndSeconds;
    if (s != null && e != null && e > s) {
      setBgmPlayRange("segment");
      setBgmStartMin(String(Math.floor(s / 60)));
      setBgmStartSec(String(s % 60));
      setBgmEndMin(String(Math.floor(e / 60)));
      setBgmEndSec(String(e % 60));
    } else {
      setBgmPlayRange("full");
      setBgmStartMin("");
      setBgmStartSec("");
      setBgmEndMin("");
      setBgmEndSec("");
    }
    const hasPlaybackHistory = Boolean(session.lastPlayedAt);
    if (!hasPlaybackHistory) {
      setLoopMode("count");
      setRepeatCount(1);
      setGapSeconds(0);
    } else {
      setLoopMode(session.playbackLoopMode === "infinite" ? "infinite" : "count");
      setRepeatCount(
        session.playbackRepeatCount != null && Number.isFinite(Number(session.playbackRepeatCount))
          ? Math.max(1, Math.floor(Number(session.playbackRepeatCount)))
          : 1
      );
      setGapSeconds(
        session.playbackGapSeconds != null && Number.isFinite(Number(session.playbackGapSeconds))
          ? Math.max(0, Math.floor(Number(session.playbackGapSeconds)))
          : 0
      );
    }
    setShowLoadModal(false);
  }, []);

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

  useEffect(() => {
    if (!playbackSectionVisible) return;
    if (demoMode) return;
    playbackSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [playbackSectionVisible, demoMode]);

  useEffect(() => {
    if (!demoMode) return;
    setDemoOnboardingPhase(1);
  }, [demoMode]);

  useLayoutEffect(() => {
    if (!demoMode) return;
    if (typeof window === "undefined") return;
    let restore: "auto" | "manual" | undefined;
    if ("scrollRestoration" in history) {
      restore = history.scrollRestoration;
      history.scrollRestoration = "manual";
    }
    const toTop = () => {
      window.scrollTo(0, 0);
    };
    toTop();
    const raf = requestAnimationFrame(toTop);
    const t0 = window.setTimeout(toTop, 0);
    const t1 = window.setTimeout(toTop, 50);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      if (restore != null) {
        history.scrollRestoration = restore;
      }
    };
  }, [demoMode]);

  useEffect(() => {
    if (!demoMode) return;
    const active = demoOnboardingPhase !== "pending" && demoOnboardingPhase !== "done";
    if (!active) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyTouch = body.style.touchAction;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overflow = prevBodyOverflow;
      body.style.touchAction = prevBodyTouch;
    };
  }, [demoMode, demoOnboardingPhase]);

  const getDemoSpotlightElement = useCallback((): HTMLElement | null => {
    if (!demoMode || demoOnboardingPhase === "pending" || demoOnboardingPhase === "done") return null;
    switch (demoOnboardingPhase) {
      case 1:
        return demoTitlePromoRef.current;
      case 2:
        return demoVoiceHighlightRef.current;
      case 3:
        return demoGenerateButtonRef.current;
      case 4:
        return demoPlayButtonRef.current;
      default:
        return null;
    }
  }, [demoMode, demoOnboardingPhase]);

  const updateDemoSpotlight = useCallback(() => {
    const el = getDemoSpotlightElement();
    if (!el) {
      setDemoSpotlightRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) {
      setDemoSpotlightRect(null);
      return;
    }
    setDemoSpotlightRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [getDemoSpotlightElement]);

  useLayoutEffect(() => {
    if (!demoMode || demoOnboardingPhase === "pending" || demoOnboardingPhase === "done") {
      setDemoSpotlightRect(null);
      return;
    }
    const el = getDemoSpotlightElement();
    if (!el) {
      setDemoSpotlightRect(null);
      return;
    }
    el.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });

    const measure = () => {
      const cur = getDemoSpotlightElement();
      if (!cur) {
        setDemoSpotlightRect(null);
        return;
      }
      const r = cur.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      setDemoSpotlightRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    measure();
    requestAnimationFrame(measure);
    requestAnimationFrame(() => requestAnimationFrame(measure));
    const t1 = window.setTimeout(measure, 50);
    const t2 = window.setTimeout(measure, 200);
    const t3 = window.setTimeout(measure, 500);
    let cancelled = false;
    if (typeof document !== "undefined" && document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        if (!cancelled) measure();
      });
    }
    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [demoMode, demoOnboardingPhase, hasAudio, getDemoSpotlightElement]);

  useEffect(() => {
    if (!demoMode || demoOnboardingPhase === "pending" || demoOnboardingPhase === "done") return;
    const onResize = () => updateDemoSpotlight();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [demoMode, demoOnboardingPhase, updateDemoSpotlight]);

  useEffect(() => {
    if (!demoMode || demoOnboardingPhase === "pending" || demoOnboardingPhase === "done") return;
    const el = getDemoSpotlightElement();
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => updateDemoSpotlight());
    ro.observe(el);
    return () => ro.disconnect();
  }, [demoMode, demoOnboardingPhase, hasAudio, getDemoSpotlightElement, updateDemoSpotlight]);

  useEffect(() => {
    if (!demoMode || demoOnboardingPhase === "pending" || demoOnboardingPhase === "done") return;
    const run = () => updateDemoSpotlight();
    if (document.readyState === "complete") {
      run();
      return;
    }
    window.addEventListener("load", run, { once: true });
    return () => window.removeEventListener("load", run);
  }, [demoMode, demoOnboardingPhase, updateDemoSpotlight]);

  return (
    <main className="min-h-full bg-[var(--bg)]">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {demoMode && (
          <div className="mb-6 space-y-2 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-base leading-relaxed text-stone-800">
            <p>
              체험 모드입니다. 이미 만들어진 방송을 들어볼 수만 있습니다.
              <br />
              새로운 방송을 만들고 싶으시면{" "}
              <Link href="/login" className="font-medium text-amber-800 underline underline-offset-2 hover:text-amber-950">
                로그인
              </Link>
              {" "}후 이용해 주세요.
            </p>
          </div>
        )}
        <h1 className="text-4xl font-bold tracking-tight text-stone-800">
          {demoMode ? "체험 방송" : "새 방송 만들기"}
        </h1>
        {!demoMode && (
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => setShowLoadModal(true)}
              className="rounded-lg border border-stone-300 px-4 py-2 text-base font-medium text-stone-700 hover:bg-stone-50"
            >
              기존 방송 불러오기
            </button>
          </div>
        )}

        <section className="mt-2 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-stone-800">1. 방송 내용 입력</h2>
          <div className="mt-4 space-y-4">
            <div ref={demoTitlePromoRef} className="space-y-4">
              <div>
                <label className="text-base font-medium text-stone-700">방송 제목</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="예: 오후 3시 행사 안내 방송"
                  disabled={demoMode}
                  className="mt-1.5 w-full rounded-lg border border-stone-200 px-3 py-2.5 text-base text-stone-800"
                />
              </div>
              <div>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <label htmlFor="new-broadcast-promo" className="text-base font-medium text-stone-700">
                    상품 정보(상품명, 단위, 판매가) 입력
                  </label>
                  <span className="text-sm tabular-nums text-stone-500" aria-live="polite">
                    광고문 {promoLength.toLocaleString()}
                    {maxChars != null ? ` / ${maxChars.toLocaleString()}자` : "자"}
                  </span>
                </div>
                <textarea
                  id="new-broadcast-promo"
                  value={promoRawText}
                  onChange={(e) => setPromoRawText(e.target.value)}
                  placeholder="입력한 품목명과 단위, 가격 등을 바탕으로 방송을 자연스럽게 만들어 드립니다."
                  disabled={demoMode}
                  className="mt-1.5 min-h-[280px] w-full rounded-lg border border-stone-200 px-3 py-3 text-base leading-relaxed text-stone-800"
                />
                {scriptError && <p className="mt-1.5 text-base leading-relaxed text-red-600">{scriptError}</p>}
              </div>
            </div>
            <div>
              <div className="text-base font-medium text-stone-700">
                <span id="new-broadcast-content-label">방송 내용 미리보기</span>
              </div>
              <textarea
                id="new-broadcast-content"
                aria-labelledby="new-broadcast-content-label"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="오늘 마트에서 안내하고 싶은 방송 멘트를 그대로 입력해 주세요."
                disabled={demoMode}
                className="mt-1.5 min-h-[360px] w-full rounded-lg border border-stone-200 px-3 py-3 text-base leading-relaxed text-stone-800"
              />
              {overLimit && (
                <p className="mt-1.5 text-base leading-relaxed text-red-600">
                  {demoMode
                    ? `체험에서는 광고 문자를 최대 ${DEMO_MAX_CHARS.toLocaleString()}자까지 입력할 수 있습니다.`
                    : "광고 문자 글자 수 제한을 초과했습니다. 다른 플랜을 구독해 보세요."}
                </p>
              )}
              {!demoMode && maxChars == null && (
                <p className="mt-1.5 text-base leading-relaxed text-stone-500">
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
              onClick={() => {
                if (demoMode) return;
                setMusicSectionOpen((prev) => !prev);
              }}
              disabled={demoMode}
              className="rounded-lg border border-stone-300 px-3 py-2 text-base font-medium text-stone-700 hover:bg-stone-50"
              aria-expanded={musicSectionOpen}
            >
              {musicSectionOpen ? "접기" : "펼치기"}
            </button>
          </div>

          {musicSectionOpen && (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-base text-stone-700">
                <span className="text-base font-semibold text-stone-600">재생 방식</span>
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
                  <p className="text-base leading-relaxed text-stone-600">
                    아래 미리듣기에서 지정한 구간이 제대로 재생되는지 확인해 보세요.
                    <br />
                    유튜브 영상의 원하는 구간만 재생할 수 있습니다.
                  </p>
                  <div className="flex flex-wrap items-center gap-4 text-base text-stone-700">
                    <span className="text-base font-semibold text-stone-600">배경 음악 구간</span>
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
                  {bgmError && <p className="text-base leading-relaxed text-red-600">{bgmError}</p>}
                  <div>
                    <h4 className="text-base font-semibold text-stone-800">음악 볼륨</h4>
                    <p className="mt-1 text-base leading-relaxed text-stone-600">
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

        <section ref={demoVoiceSectionRef} className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
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
            <div ref={demoVoiceHighlightRef}>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-stone-800">목소리 선택</h3>
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
                  const demoPaidPreviewOnly = demoMode && p.paidOnly === true;
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
                              if (demoMode) return;
                              if (paidLocked) {
                                setShowPaidVoiceSubscribeGuide(true);
                                return;
                              }
                              setGooglePresetId(p.id);
                            }}
                            disabled={demoMode}
                            className="h-5 w-5 border-stone-300 text-amber-600"
                          />
                          {p.paidOnly && (
                            <span className="rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                              유료
                            </span>
                          )}
                          <span>{p.label}</span>
                        </label>
                        {(paidLocked || demoPaidPreviewOnly) && (
                          <button
                            type="button"
                            disabled={!p.previewAudioDataUrl}
                            title={
                              p.previewAudioDataUrl
                                ? undefined
                                : "관리자 사이트에서 해당 음성의 미리듣기를 저장한 뒤 이용할 수 있습니다."
                            }
                            onClick={() => void playVoicePreview(p.id, p.previewAudioDataUrl)}
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
                  onChange={(e) => {
                    if (demoMode) return;
                    setSpeed(parseFloat(e.target.value));
                  }}
                  disabled={demoMode}
                  className="h-2 w-32 flex-1 accent-amber-500"
                />
                <div className="flex gap-1 rounded-lg border border-stone-200 p-0.5">
                  {SPEED_PRESETS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSpeed(v)}
                      disabled={demoMode}
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
                ref={demoGenerateButtonRef}
                type="button"
                onClick={handleGenerate}
                disabled={demoMode || isGenerating || disabled}
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
          <section ref={playbackSectionRef} className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
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
                    onChange={() => {
                      setLoopMode("infinite");
                      setRepeatCount(1);
                    }}
                    className="h-5 w-5 border-stone-300 text-amber-600"
                  />
                  무한 반복
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="loopMode"
                    checked={loopMode === "count"}
                    onChange={() => {
                      setLoopMode("count");
                      setRepeatCount(1);
                    }}
                    className="h-5 w-5 border-stone-300 text-amber-600"
                  />
                  횟수 지정
                </label>
              </div>
              {loopMode === "count" && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="repeat-count" className="block text-base font-medium text-stone-600">
                    방송 횟수 (중간음악 모드는 음성+음악 1회 = 1회)
                  </label>
                  <input
                    id="repeat-count"
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
                <label htmlFor="gap-seconds" className="text-base font-medium text-stone-600">
                  재생 간격 (초)
                </label>
                <p className="mt-1 text-base leading-relaxed text-stone-600">
                  방송이 한 번 끝난 뒤 다음 방송까지 기다리는 시간입니다.
                </p>
                <input
                  id="gap-seconds"
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
                    ref={demoPlayButtonRef}
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
                  <p className="mt-1 text-base text-stone-600">중간 음악 로딩 중…</p>
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
                    <div className="mt-0.5 flex justify-between text-base tabular-nums text-stone-600">
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

      {showLoadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-5xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-2xl font-semibold text-stone-800">기존 방송 불러오기</h2>
              <button
                type="button"
                onClick={() => setShowLoadModal(false)}
                className="rounded-md border border-stone-300 px-3 py-2 text-base text-stone-700 hover:bg-stone-50"
              >
                닫기
              </button>
            </div>
            {savedSessions.length === 0 ? (
              <p className="mt-4 rounded-xl border border-stone-100 bg-stone-50 px-4 py-8 text-center text-base leading-relaxed text-stone-600">
                불러올 방송이 없습니다.
              </p>
            ) : (
              <ul className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                {savedSessions.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() => handleLoadSession(session)}
                      className="w-full rounded-xl border border-stone-200 px-4 py-3.5 text-left hover:border-amber-300 hover:bg-amber-50/40"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-base font-medium text-stone-800">
                          {session.title || "제목 없음"}
                        </span>
                        <span className="shrink-0 text-base text-stone-500">불러오기</span>
                      </div>
                      <div className="mt-1 text-base text-stone-600">
                        생성일시 {new Date(session.createdAt).toLocaleString("ko-KR")}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {demoMode &&
        demoOnboardingPhase !== "pending" &&
        demoOnboardingPhase !== "done" &&
        demoSpotlightRect && (
          <DemoOnboardingSpotlight rect={demoSpotlightRect}>
            {demoOnboardingPhase === 1 && (
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 flex-1 text-sm leading-snug text-stone-800">
                  <span className="mr-1 font-semibold text-amber-700">1/4</span>
                  방송 제목과 상품 정보를 입력합니다.
                </p>
                <button
                  type="button"
                  className="shrink-0 rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600"
                  onClick={() => setDemoOnboardingPhase(2)}
                >
                  확인
                </button>
              </div>
            )}
            {demoOnboardingPhase === 2 && (
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 flex-1 text-sm leading-snug text-stone-800">
                  <span className="mr-1 font-semibold text-amber-700">2/4</span>
                  사용할 목소리를 선택합니다.
                </p>
                <button
                  type="button"
                  className="shrink-0 rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600"
                  onClick={() => setDemoOnboardingPhase(3)}
                >
                  확인
                </button>
              </div>
            )}
            {demoOnboardingPhase === 3 && (
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 flex-1 text-sm leading-snug text-stone-800">
                  <span className="mr-1 font-semibold text-amber-700">3/4</span>
                  음성 생성으로 음성 파일을 만듭니다.
                </p>
                <button
                  type="button"
                  className="shrink-0 rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600"
                  onClick={() => setDemoOnboardingPhase(4)}
                >
                  확인
                </button>
              </div>
            )}
            {demoOnboardingPhase === 4 && (
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 flex-1 text-sm leading-snug text-stone-800">
                  <span className="mr-1 font-semibold text-amber-700">4/4</span>
                  {hasAudio ? "재생 버튼으로 들어보세요." : "음성을 불러오는 중…"}
                </p>
                <button
                  type="button"
                  className="shrink-0 rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-40"
                  disabled={!hasAudio}
                  onClick={() => setDemoOnboardingPhase("done")}
                >
                  확인
                </button>
              </div>
            )}
          </DemoOnboardingSpotlight>
        )}
    </main>
  );
}