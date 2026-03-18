"use client";

import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { saveSession } from "@/lib/store";
import { generateId, extractYoutubeId } from "@/lib/utils";
import type { Session } from "@/lib/types";
import { getCurrentUser, getMaxCharsForUser } from "@/lib/auth";
import { saveAudio, getAudioBlob, hasStoredAudio } from "@/lib/audioStorage";
import {
  GOOGLE_TTS_PRESETS,
  DEFAULT_TTS,
  SPEED_PRESETS,
  SPEED_MIN,
  SPEED_MAX,
  speedToRatePercent,
} from "@/lib/ttsOptions";
import { useYoutubeSegmentPlayer } from "@/lib/youtubeSegmentPlayer";

export default function NewBroadcastPage() {
  const [sessionId] = useState(() => generateId());
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [bgmUrl, setBgmUrl] = useState("");
  const [bgmStart, setBgmStart] = useState<string>("");
  const [bgmEnd, setBgmEnd] = useState<string>("");
  const [bgmError, setBgmError] = useState<string | null>(null);
  const [musicMode, setMusicMode] = useState<"background" | "interval">("background");

  const [hasAudio, setHasAudio] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(DEFAULT_TTS.speed);
  const [googlePresetId, setGooglePresetId] = useState<string>(GOOGLE_TTS_PRESETS[0].id);
  const [ttsBreakSeconds, setTtsBreakSeconds] = useState<number>(DEFAULT_TTS.breakSeconds);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bgmVolume, setBgmVolume] = useState(40);
  const [repeatEnabled, setRepeatEnabled] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const onBgmEndRef = useRef<() => void>(() => {});
  const phaseRef = useRef<"idle" | "tts" | "bgm">("idle");
  const modeRef = useRef<"background" | "interval">("background");
  const repeatRef = useRef<boolean>(true);

  const user = useMemo(() => getCurrentUser(), []);
  const maxChars: number | null = useMemo(() => getMaxCharsForUser(user), [user]);
  const contentLength = content.length;
  const overLimit = maxChars != null && contentLength > maxChars;

  const youtubeId = useMemo(() => {
    if (!bgmUrl.trim()) return null;
    return extractYoutubeId(bgmUrl.trim());
  }, [bgmUrl]);

  const hasBgm = Boolean(youtubeId);

  const { containerId, player: ytPlayer } = useYoutubeSegmentPlayer(
    hasBgm ? youtubeId! : null,
    hasBgm ? (bgmStart ? Number(bgmStart) : null) : null,
    hasBgm ? (bgmEnd ? Number(bgmEnd) : null) : null,
    () => onBgmEndRef.current?.()
  );

  useEffect(() => {
    modeRef.current = musicMode;
  }, [musicMode]);

  useEffect(() => {
    repeatRef.current = repeatEnabled;
  }, [repeatEnabled]);

  const previewSrc = useMemo(() => {
    if (!youtubeId) return null;
    const start = Number(bgmStart);
    const end = Number(bgmEnd);
    const params = new URLSearchParams();
    if (!Number.isNaN(start) && start > 0) params.set("start", String(Math.floor(start)));
    if (!Number.isNaN(end) && end > 0 && (!Number.isNaN(start) ? end > start : true)) {
      params.set("end", String(Math.floor(end)));
    }
    params.set("enablejsapi", "1");
    params.set("rel", "0");
    return `https://www.youtube.com/embed/${youtubeId}?${params.toString()}`;
  }, [youtubeId, bgmStart, bgmEnd]);

  const validateBgm = () => {
    if (!bgmUrl.trim()) {
      setBgmError(null);
      return true;
    }
    if (!youtubeId) {
      setBgmError("유효한 YouTube 주소가 아닙니다.");
      return false;
    }
    if (bgmStart !== "" || bgmEnd !== "") {
      const start = Number(bgmStart);
      const end = Number(bgmEnd);
      if (Number.isNaN(start) || start < 0 || Number.isNaN(end) || end <= 0 || end <= start) {
        setBgmError("시작 시간은 0초 이상, 종료 시간은 시작 시간보다 커야 합니다.");
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

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  const handleGenerate = async () => {
    if (!content.trim()) return;
    if (!validateBgm()) return;

    setIsGenerating(true);
    setGenerateError(null);
    const rateStr = speedToRatePercent(speed);

    try {
      const gp = GOOGLE_TTS_PRESETS.find((p) => p.id === googlePresetId) ?? GOOGLE_TTS_PRESETS[0];
      const body: Record<string, unknown> = {
        text: content,
        voice: gp.voice,
        rate: rateStr,
        breakSeconds: ttsBreakSeconds,
      };

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
      const session: Session = {
        id: sessionId,
        title: title.trim(),
        eventType: "FREE",
        customOpening: undefined,
        scheduledAt: null,
        scheduledEndAt: null,
        repeatMinutes: 5,
        itemSuffixIsnida: true,
        lastGeneratedAt: now,
        lastPlayedAt: null,
        latestAudioUrl: null,
        generatedText: content,
        bgmYoutubeUrl: bgmUrl.trim() || null,
        bgmStartSeconds: bgmStart ? Number(bgmStart) : null,
        bgmEndSeconds: bgmEnd ? Number(bgmEnd) : null,
        ttsProvider: "google",
        voice: gp.voice,
        ttsRate: rateStr,
        ttsBreakSeconds,
        createdAt: now,
        updatedAt: now,
      };

      saveSession(session, [], []);
      await refreshHasAudio();
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsGenerating(false);
    }
  };

  const play = useCallback(async () => {
    if (!audioRef.current) return;

    try {
      const blob = await getAudioBlob(sessionId);
      if (!blob) return;

      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      blobUrlRef.current = URL.createObjectURL(blob);
      audioRef.current.src = blobUrlRef.current;

      if (hasBgm && ytPlayer.ready) {
        if (musicMode === "background") {
          phaseRef.current = "tts";
          ytPlayer.setVolume(bgmVolume);
          ytPlayer.playSegment();

          audioRef.current.onended = async () => {
            if (phaseRef.current !== "tts") return;
            if (!repeatRef.current) {
              ytPlayer.stop();
              phaseRef.current = "idle";
              setIsPlaying(false);
              return;
            }
            await play();
          };
        } else {
          phaseRef.current = "tts";
          audioRef.current.onended = () => {
            if (modeRef.current !== "interval") return;
            if (!hasBgm || !ytPlayer.ready) {
              phaseRef.current = "idle";
              setIsPlaying(false);
              return;
            }
            phaseRef.current = "bgm";
            ytPlayer.setVolume(bgmVolume);
            ytPlayer.playSegment();
          };
        }
      } else {
        phaseRef.current = "tts";
        audioRef.current.onended = async () => {
          if (phaseRef.current !== "tts") return;
          if (!repeatRef.current) {
            phaseRef.current = "idle";
            setIsPlaying(false);
            return;
          }
          await play();
        };
      }

      await audioRef.current.play();
      setIsPlaying(true);
    } catch {
      phaseRef.current = "idle";
      setGenerateError("재생을 시작할 수 없습니다.");
    }
  }, [sessionId, hasBgm, ytPlayer, bgmVolume, musicMode]);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (hasBgm) {
      ytPlayer.pause();
    }
    setIsPlaying(false);
  }, [hasBgm, ytPlayer]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (hasBgm) {
      ytPlayer.stop();
    }
    phaseRef.current = "idle";
    setIsPlaying(false);
  }, [hasBgm, ytPlayer]);

  const disabled = !title.trim() || !content.trim() || overLimit;

  useEffect(() => {
    onBgmEndRef.current = () => {
      if (modeRef.current !== "interval") return;
      if (phaseRef.current !== "bgm") return;
      if (!repeatRef.current) {
        phaseRef.current = "idle";
        setIsPlaying(false);
        return;
      }
      phaseRef.current = "idle";
      void play();
    };
  }, [play]);

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link href="/" className="text-sm text-stone-500 hover:text-stone-700">
          ← 첫 화면으로
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-stone-800">새 방송 만들기</h1>
        <p className="mt-1 text-sm text-stone-500">
          제목과 방송 내용을 입력하고, 원하면 배경 음악 구간을 지정한 뒤 MP3를 생성합니다.
        </p>

        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-800">1. 방송 내용 입력</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="text-sm text-stone-600">방송 제목</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 오후 3시 행사 안내 방송"
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-stone-800"
              />
            </div>
            <div>
              <label className="flex items-center justify-between text-sm text-stone-600">
                <span>방송 내용</span>
                <span className="text-xs text-stone-400">
                  글자 수: {contentLength}
                  {maxChars != null && ` / ${maxChars.toLocaleString()} 자`}
                </span>
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="오늘 마트에서 안내하고 싶은 방송 멘트를 그대로 입력해 주세요."
                className="mt-1 min-h-[180px] w-full rounded-lg border border-stone-200 px-3 py-3 text-sm text-stone-800"
              />
              {overLimit && (
                <p className="mt-1 text-xs text-red-600">
                  이 계정의 글자 수 제한을 초과했습니다. 내용을 조금 줄여 주세요.
                </p>
              )}
              {maxChars == null && (
                <p className="mt-1 text-xs text-stone-400">
                  테스트 계정은 글자 수 제한 없이 자유롭게 입력할 수 있습니다.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-800">2. (선택) 음악</h2>
          <p className="mt-1 text-sm text-stone-500">
            방송 음성과 함께 사용할 YouTube 음악을 선택할 수 있습니다.
            <br />
            배경음악은 음성과 함께, 중간음악은 음성 뒤에 재생됩니다.
          </p>

          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm text-stone-600">
              <span className="text-xs font-medium text-stone-500">재생 방식</span>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="musicMode"
                  value="background"
                  checked={musicMode === "background"}
                  onChange={() => setMusicMode("background")}
                  className="h-4 w-4 border-stone-300 text-amber-600"
                />
                <span>배경음악</span>
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="musicMode"
                  value="interval"
                  checked={musicMode === "interval"}
                  onChange={() => setMusicMode("interval")}
                  className="h-4 w-4 border-stone-300 text-amber-600"
                />
                <span>중간음악</span>
              </label>
            </div>
            <div>
              <label className="text-sm text-stone-600">YouTube URL</label>
              <input
                type="text"
                value={bgmUrl}
                onChange={(e) => setBgmUrl(e.target.value)}
                placeholder="예: https://www.youtube.com/watch?v=..."
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-stone-800"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm text-stone-600">시작 시간 (초)</label>
                <input
                  type="number"
                  min={0}
                  value={bgmStart}
                  onChange={(e) => setBgmStart(e.target.value)}
                  placeholder="예: 10"
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-stone-800"
                />
              </div>
              <div>
                <label className="text-sm text-stone-600">종료 시간 (초)</label>
                <input
                  type="number"
                  min={1}
                  value={bgmEnd}
                  onChange={(e) => setBgmEnd(e.target.value)}
                  placeholder="예: 40"
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-stone-800"
                />
              </div>
            </div>
            {bgmError && <p className="text-xs text-red-600">{bgmError}</p>}
            {previewSrc && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-stone-500">
                  아래 미리듣기에서 지정한 구간이 제대로 재생되는지 확인해 보세요.
                  <br />
                  브라우저나 YouTube 정책에 따라 자동 재생이 제한될 수 있습니다.
                </p>
                <div className="aspect-video overflow-hidden rounded-xl border border-stone-200 bg-stone-900">
                  <iframe
                    src={previewSrc}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title="배경 음악 미리듣기"
                  />
                </div>
              </div>
            )}

            {hasBgm && (
              <div className="mt-3">
                <h4 className="text-sm font-medium text-stone-700">음악 볼륨</h4>
                <p className="mt-0.5 text-xs text-stone-500">
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
                  <span className="w-10 text-sm text-stone-600">{bgmVolume}%</span>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-800">3. 음성 파일 생성 및 재생</h2>
          {hasBgm && <div id={containerId} className="h-px w-px overflow-hidden opacity-0" aria-hidden />}

          <audio
            ref={audioRef}
            onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
            onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
            onDurationChange={() => setDuration(audioRef.current?.duration ?? 0)}
          />

          <div className="mt-6 border-t border-stone-100 pt-4">
            <h3 className="text-sm font-medium text-stone-700">목소리 선택</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {GOOGLE_TTS_PRESETS.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-2 text-sm has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50"
                >
                  <input
                    type="radio"
                    name="googlePreset"
                    value={p.id}
                    checked={googlePresetId === p.id}
                    onChange={() => setGooglePresetId(p.id)}
                    className="h-4 w-4 border-stone-300 text-amber-600"
                  />
                  {p.label}
                </label>
              ))}
            </div>

            <div className="mt-4">
              <span className="block text-xs text-stone-500">말하기 속도 {speed.toFixed(1)}x</span>
              <div className="mt-1 flex items-center gap-3">
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
                      className={`min-w-[2.25rem] rounded px-2 py-1 text-sm ${
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
              <label className="block text-xs text-stone-500">문장 사이 쉼 (초)</label>
              <input
                type="number"
                min={0.5}
                max={3}
                step={0.1}
                value={ttsBreakSeconds}
                onChange={(e) => setTtsBreakSeconds(parseFloat(e.target.value) || 0.5)}
                className="mt-1 w-full max-w-[8rem] rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800"
              />
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || disabled}
              className="mt-5 w-full max-w-xs rounded-xl bg-amber-500 px-6 py-2.5 font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {isGenerating ? "생성 중…" : "음성 파일 생성"}
            </button>
            {generateError && <p className="mt-2 text-sm text-red-600">{generateError}</p>}
            {hasAudio && !generateError && (
              <p className="mt-2 text-sm text-green-600">
                오디오가 준비되었습니다. 아래에서 바로 재생할 수 있습니다.
                <br />
                방송 내용이나 음악이 바뀌면 음성 파일을 다시 생성해야 합니다.
              </p>
            )}
          </div>

          <div className="mt-6 border-t border-stone-100 pt-4">
            <h3 className="text-sm font-medium text-stone-700">재생</h3>
            <div className="mt-3 flex flex-col items-center gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={isPlaying ? pause : play}
                  disabled={!hasAudio || (hasBgm && !ytPlayer.ready)}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-stone-800 text-white disabled:opacity-40"
                  aria-label={isPlaying ? "일시정지" : "재생"}
                >
                  {isPlaying ? "⏸" : "▶"}
                </button>
                <button
                  type="button"
                  onClick={pause}
                  disabled={!hasAudio || (hasBgm && !ytPlayer.ready)}
                  className="rounded-lg border border-stone-300 px-4 py-2 text-sm disabled:opacity-40"
                >
                  ⏸ 일시정지
                </button>
                <button
                  type="button"
                  onClick={stop}
                  disabled={!hasAudio || (hasBgm && !ytPlayer.ready)}
                  className="rounded-lg border border-stone-300 px-4 py-2 text-sm disabled:opacity-40"
                >
                  ⏹ 정지
                </button>
              </div>
              {hasBgm && !ytPlayer.ready && (
                <p className="mt-1 text-xs text-stone-500">중간 음악 로딩 중…</p>
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
                  <div className="mt-0.5 flex justify-between text-xs text-stone-500">
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
                <p className="mt-1 text-sm text-stone-500">먼저 위에서 MP3를 생성해 주세요.</p>
              )}

              <div className="mt-4 flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <input
                    id="repeat-enabled"
                    type="checkbox"
                    checked={repeatEnabled}
                    onChange={(e) => setRepeatEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-stone-300"
                  />
                  <label htmlFor="repeat-enabled" className="text-sm text-stone-600">
                    무한 반복
                  </label>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}