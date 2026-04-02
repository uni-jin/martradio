"use client";

import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getSession, saveSession } from "@/lib/store";
import { extractYoutubeId } from "@/lib/utils";
import type { Session, BroadcastItem, SessionWithItems } from "@/lib/types";
import { getCurrentUser, getMaxCharsForUser } from "@/lib/auth";
import { saveAudio, getAudioBlob, hasStoredAudio } from "@/lib/audioStorage";
import {
  DEFAULT_TTS,
  SPEED_PRESETS,
  SPEED_MIN,
  SPEED_MAX,
  speedToRatePercent,
  ratePercentToSpeed,
} from "@/lib/ttsOptions";
import { useYoutubeSegmentPlayer } from "@/lib/youtubeSegmentPlayer";
import { getTemplateOptionsForPlan, getVoiceTemplatesUserFacing } from "@/lib/adminData";
import { buildGoogleTtsSynthesizeBody } from "@/lib/ttsGoogleRequest";
import { SELECT_CHEVRON_TAILWIND } from "@/app/_lib/selectChevron";

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

  const [loaded, setLoaded] = useState(false);
  const [sessionBase, setSessionBase] = useState<Session | null>(null);
  const itemsRef = useRef<BroadcastItem[]>([]);
  const eventItemsRef = useRef<BroadcastItem[]>([]);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [bgmUrl, setBgmUrl] = useState("");
  const [bgmPlayRange, setBgmPlayRange] = useState<"full" | "segment">("full");
  const [bgmStartMin, setBgmStartMin] = useState("");
  const [bgmStartSec, setBgmStartSec] = useState("");
  const [bgmEndMin, setBgmEndMin] = useState("");
  const [bgmEndSec, setBgmEndSec] = useState("");
  const [bgmError, setBgmError] = useState<string | null>(null);
  const [musicMode, setMusicMode] = useState<"background" | "interval">("background");

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
  const [loopMode, setLoopMode] = useState<"infinite" | "count">("infinite");
  const [repeatCount, setRepeatCount] = useState(3);
  const [gapSeconds, setGapSeconds] = useState(0);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const onBgmEndRef = useRef<() => void>(() => {});
  const phaseRef = useRef<"idle" | "tts" | "bgm">("idle");
  const modeRef = useRef<"background" | "interval">("background");
  const loopInfiniteRef = useRef(true);
  const repeatCountRef = useRef(3);
  const gapSecondsRef = useRef(0);
  const playbackGenRef = useRef(0);
  const pausedAtRef = useRef(0);
  const cyclesCompletedRef = useRef(0);
  const activePlaybackGenRef = useRef(0);

  const user = useMemo(() => getCurrentUser(), []);
  const templateOptions = useMemo(() => getTemplateOptionsForPlan(user?.planId), [user]);
  const [voiceListTick, setVoiceListTick] = useState(0);
  useEffect(() => {
    const onV = () => setVoiceListTick((t) => t + 1);
    window.addEventListener("mart-voice-templates-updated", onV);
    return () => window.removeEventListener("mart-voice-templates-updated", onV);
  }, []);
  const availableGooglePresets = useMemo(() => {
    void voiceListTick;
    return getVoiceTemplatesUserFacing(user?.planId);
  }, [voiceListTick, user]);
  const maxChars: number | null = useMemo(() => getMaxCharsForUser(user), [user]);
  const contentLength = content.length;
  const overLimit = maxChars != null && contentLength > maxChars;

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

  const previewSrc = useMemo(() => {
    if (!youtubeId) return null;
    const params = new URLSearchParams();
    params.set("enablejsapi", "1");
    params.set("rel", "0");
    // 미리듣기 iframe은 실제 BGM 제어 대상이 아니므로 autoplay/소리를 강제로 차단한다.
    params.set("autoplay", "0");
    params.set("mute", "1");
    params.set("controls", "0");
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
    const list = getVoiceTemplatesUserFacing(user?.planId);
    if (list.length === 0) return;
    setGooglePresetId((prev) => (prev && list.some((x) => x.id === prev) ? prev : list[0].id));
  }, [loaded, voiceListTick]);

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
    const s = getSession(sessionId) as SessionWithItems | null;
    if (s) {
      setSessionBase(s);
      setTitle(s.title ?? "");
      setContent(s.generatedText ?? "");
      setBgmUrl(s.bgmYoutubeUrl ?? "");
      setMusicMode(s.musicMode === "background" ? "background" : "interval");
      const bs = s.bgmStartSeconds;
      const be = s.bgmEndSeconds;
      if (bs != null && be != null && be > bs) {
        setBgmPlayRange("segment");
        setBgmStartMin(String(Math.floor(bs / 60)));
        setBgmStartSec(String(bs % 60));
        setBgmEndMin(String(Math.floor(be / 60)));
        setBgmEndSec(String(be % 60));
      } else {
        setBgmPlayRange("full");
        setBgmStartMin("");
        setBgmStartSec("");
        setBgmEndMin("");
        setBgmEndSec("");
      }
      itemsRef.current = s.items ?? [];
      eventItemsRef.current = s.eventItems ?? [];

      if (s.ttsBreakSeconds != null) {
        setTtsBreakSeconds(s.ttsBreakSeconds);
      }
      if (s.ttsRate != null) {
        setSpeed(ratePercentToSpeed(s.ttsRate));
      }
      const list = getVoiceTemplatesUserFacing(user?.planId);
      if (s.ttsVoiceTemplateId) {
        const t = list.find((x) => x.id === s.ttsVoiceTemplateId);
        if (t) setGooglePresetId(t.id);
      } else if (s.voice) {
        const preset = list.find((p) => p.voice === s.voice);
        if (preset) setGooglePresetId(preset.id);
      }
    }
    setLoaded(true);
    void refreshHasAudio();
  }, [sessionId, refreshHasAudio]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  const handleGenerate = async () => {
    if (!content.trim()) return;
    if (!sessionId) return;
    if (!validateBgm()) return;
    setIsGenerating(true);
    setGenerateError(null);

    try {
      const gp =
        availableGooglePresets.find((p) => p.id === googlePresetId) ?? availableGooglePresets[0];
      if (!gp) {
        setGenerateError("사용 가능한 음성 템플릿이 없습니다. 관리자에서 음성 템플릿을 등록해 주세요.");
        return;
      }
      const synth = buildGoogleTtsSynthesizeBody(content, gp, speed, ttsBreakSeconds);
      const body: Record<string, unknown> = {
        text: synth.text,
        voice: synth.voice,
        languageCode: synth.languageCode,
        speakingRate: synth.speakingRate,
        pitch: synth.pitch,
        volumeGainDb: synth.volumeGainDb,
        breakSeconds: synth.breakSeconds,
      };
      if (synth.sampleRateHertz != null) body.sampleRateHertz = synth.sampleRateHertz;
      if (synth.effectsProfileId?.length) body.effectsProfileId = synth.effectsProfileId;

      const res = await fetch("/api/tts-google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
        eventType: base?.eventType ?? "FREE",
        customOpening: base?.customOpening,
        scheduledAt: base?.scheduledAt ?? null,
        scheduledEndAt: base?.scheduledEndAt ?? null,
        repeatMinutes: base?.repeatMinutes ?? 5,
        itemSuffixIsnida: base?.itemSuffixIsnida ?? true,
        lastGeneratedAt: now,
        lastPlayedAt: base?.lastPlayedAt ?? null,
        latestAudioUrl: base?.latestAudioUrl ?? null,
        generatedText: content,
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
        createdAt: base?.createdAt ?? now,
        updatedAt: now,
      };

      saveSession(session, itemsRef.current, eventItemsRef.current);
      setSessionBase(session);
      await refreshHasAudio();
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
          const updated: Session = { ...b, lastPlayedAt: now, updatedAt: now };
          saveSession(updated, itemsRef.current, eventItemsRef.current);
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
    [sessionId, hasBgm, ytPlayer, bgmVolume, musicMode, waitGap]
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
      <main className="min-h-screen bg-[var(--bg)] p-8">
        <p className="text-base text-stone-600">잘못된 경로입니다.</p>
        <Link href="/" className="mt-2 inline-block text-base text-amber-700 hover:underline">
          ← 첫 화면
        </Link>
      </main>
    );
  }

  if (!loaded) {
    return (
      <main className="min-h-screen bg-[var(--bg)] p-8">
        <p className="text-base text-stone-600">불러오는 중...</p>
      </main>
    );
  }

  if (!sessionBase) {
    return (
      <main className="min-h-screen bg-[var(--bg)] p-8">
        <p className="text-base text-stone-600">해당 방송을 찾을 수 없습니다.</p>
        <Link href="/" className="mt-2 inline-block text-base text-amber-700 hover:underline">
          ← 첫 화면
        </Link>
      </main>
    );
  }

  const disabled = !title.trim() || !content.trim() || overLimit;

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-stone-800">기존 방송</h1>

        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-stone-800">1. 방송 내용 입력</h2>
          {showTemplatePicker && (
            <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
              {templateOptions.length === 0 ? (
                <p className="text-sm leading-relaxed text-stone-600">사용 가능한 템플릿이 없습니다.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className={`min-w-[220px] rounded-lg border border-stone-200 px-3 py-2.5 pr-10 text-base text-stone-800 ${SELECT_CHEVRON_TAILWIND}`}
                  >
                    <option value="">템플릿 선택</option>
                    {templateOptions.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const selected = templateOptions.find((t) => t.id === selectedTemplateId);
                      if (!selected) return;
                      setContent(selected.content);
                    }}
                    className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600"
                  >
                    템플릿 적용
                  </button>
                </div>
              )}
            </div>
          )}
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
              <label className="flex items-center justify-between gap-2 text-base font-medium text-stone-700">
                <span>
                  방송 내용 ({contentLength.toLocaleString()}
                  {maxChars != null ? ` / ${maxChars.toLocaleString()}` : ""}자)
                </span>
                <button
                  type="button"
                  onClick={() => setShowTemplatePicker((v) => !v)}
                  className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
                >
                  템플릿 불러오기
                </button>
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="오늘 마트에서 안내하고 싶은 방송 멘트를 그대로 입력해 주세요."
                className="mt-1.5 min-h-[180px] w-full rounded-lg border border-stone-200 px-3 py-3 text-base leading-relaxed text-stone-800"
              />
              {overLimit && (
                <p className="mt-1.5 text-sm leading-relaxed text-red-600">
                  글자 수 제한을 초과했습니다. 다른 플랜을 구독해 보세요.
                </p>
              )}
              {maxChars == null && (
                <p className="mt-1.5 text-sm leading-relaxed text-stone-500">현재 플랜은 글자 수 제한이 없습니다.</p>
              )}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-stone-800">2. (선택) 음악</h2>
          <p className="mt-2 text-base leading-relaxed text-stone-600">
            방송 음성과 함께 사용할 YouTube 음악을 선택할 수 있습니다.
            <br />
            배경음악은 음성과 함께, 중간음악은 음성 뒤에 재생됩니다.
          </p>

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
                      }}
                      className="h-2 flex-1 accent-amber-500"
                    />
                    <span className="w-12 text-base tabular-nums text-stone-700">{bgmVolume}%</span>
                  </div>
                </div>
                <div className="aspect-video overflow-hidden rounded-xl border border-stone-200 bg-stone-900">
                  <iframe
                    key={previewSrc ?? ""}
                    src={previewSrc ?? undefined}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title="배경 음악 미리듣기"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-stone-800">3. 음성 생성</h2>
          <div id={containerId} className="h-px w-px overflow-hidden opacity-0" aria-hidden />

          <audio
            ref={audioRef}
            onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
            onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
            onDurationChange={() => setDuration(audioRef.current?.duration ?? 0)}
          />

          <div className="mt-6 border-t border-stone-100 pt-4">
            <h3 className="text-base font-semibold text-stone-800">목소리 선택</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {availableGooglePresets.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 px-3 py-2.5 text-base has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50"
                >
                  <input
                    type="radio"
                    name="googlePreset"
                    value={p.id}
                    checked={googlePresetId === p.id}
                    onChange={() => setGooglePresetId(p.id)}
                    className="h-5 w-5 border-stone-300 text-amber-600"
                  />
                  {p.label}
                </label>
              ))}
            </div>

            <div className="mt-4">
              <span className="block text-sm font-medium text-stone-600">말하기 속도 {speed.toFixed(1)}x</span>
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

            <div className="mt-3">
              <label className="block text-sm font-medium text-stone-600">문장 사이 쉼 (초)</label>
              <input
                type="number"
                min={0.5}
                max={3}
                step={0.1}
                value={ttsBreakSeconds}
                onChange={(e) => setTtsBreakSeconds(parseFloat(e.target.value) || 0.5)}
                className="mt-1.5 w-full max-w-[8rem] rounded-lg border border-stone-200 px-3 py-2.5 text-base text-stone-800"
              />
            </div>

            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating || disabled}
                className="w-full max-w-xs rounded-xl bg-amber-500 px-6 py-3 text-base font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {isGenerating ? "생성 중…" : "음성 다시 생성"}
              </button>
            </div>
            {generateError && <p className="mt-2 text-base leading-relaxed text-red-600">{generateError}</p>}
            {hasAudio && !generateError && (
              <p className="mt-2 text-center text-base leading-relaxed text-green-700">
                오디오가 준비되었습니다. 아래에서 바로 재생할 수 있습니다.
                <br />
                방송 내용이나 음악이 바뀌면 음성 파일을 다시 생성해야 합니다.
              </p>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-stone-800">4. 재생 설정</h2>
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
        </section>

        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-stone-800">5. 재생</h2>
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
                  onClick={pause}
                  disabled={!hasAudio}
                  className="rounded-lg border border-stone-300 px-4 py-2.5 text-base disabled:opacity-40"
                >
                  ⏸ 일시정지
                </button>
                <button
                  type="button"
                  onClick={stop}
                  disabled={!hasAudio}
                  className="rounded-lg border border-stone-300 px-4 py-2.5 text-base disabled:opacity-40"
                >
                  ⏹ 정지
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
        </section>
      </div>
    </main>
  );
}
