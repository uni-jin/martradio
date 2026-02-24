"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getSession, saveSession } from "@/lib/store";
import { saveAudio, getAudioBlob, hasStoredAudio } from "@/lib/audioStorage";
import {
  TTS_PRESETS,
  GOOGLE_TTS_PRESETS,
  MANUAL_VOICES,
  MANUAL_STYLES,
  SPEED_PRESETS,
  SPEED_MIN,
  SPEED_MAX,
  DEFAULT_TTS,
  speedToRatePercent,
  ratePercentToSpeed,
} from "@/lib/ttsOptions";
import type { SessionWithItems } from "@/lib/types";

export default function PlayBroadcastPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [session, setSession] = useState<SessionWithItems | null>(null);
  const [hasAudio, setHasAudio] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [repeatMinutes, setRepeatMinutes] = useState(5);
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [ttsProvider, setTtsProvider] = useState<"azure" | "google">("google");
  const [presetId, setPresetId] = useState<string>(DEFAULT_TTS.presetId);
  const [googlePresetId, setGooglePresetId] = useState<string>(GOOGLE_TTS_PRESETS[0].id);
  const [speed, setSpeed] = useState(DEFAULT_TTS.speed);
  const [ttsBreakSeconds, setTtsBreakSeconds] = useState(DEFAULT_TTS.breakSeconds);
  const [manualVoice, setManualVoice] = useState(MANUAL_VOICES[0].value);
  const [manualStyle, setManualStyle] = useState("default");
  const [manualPitch, setManualPitch] = useState("0%");
  const [manualStyleDegree, setManualStyleDegree] = useState(1.2);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const repeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;
    const s = getSession(id);
    setSession(s ?? null);
    if (s) {
      setRepeatMinutes(s.repeatMinutes);
      // 저장된 값이 명시적으로 azure일 때만 Azure, 그 외(undefined 포함)는 Google 기본
      setTtsProvider(s.ttsProvider === "azure" ? "azure" : "google");
      if (s.ttsProvider === "google") {
        const gp = GOOGLE_TTS_PRESETS.find((p) => p.voice === s.voice) ?? GOOGLE_TTS_PRESETS[0];
        setGooglePresetId(gp.id);
      } else if (s.ttsPresetId === "manual") {
        setPresetId("manual");
        if (s.voice) setManualVoice(s.voice);
        setManualStyle(s.ttsStyle ?? "default");
        setManualPitch(s.ttsPitch ?? "0%");
        if (s.ttsStyleDegree !== undefined) setManualStyleDegree(s.ttsStyleDegree);
      } else {
        const preset =
          TTS_PRESETS.find((p) => {
            if (p.id === "manual") return false;
            if (p.voice !== s.voice) return false;
            if ("rate" in p && p.rate != null) return s.ttsRate === p.rate;
            return ("style" in p ? p.style : "default") === (s.ttsStyle ?? "default");
          }) ?? TTS_PRESETS[0];
        setPresetId(preset.id);
      }
      setSpeed(ratePercentToSpeed(s.ttsRate));
      if (s.ttsBreakSeconds !== undefined) setTtsBreakSeconds(s.ttsBreakSeconds);
    }
  }, [id]);

  const refreshHasAudio = useCallback(async () => {
    if (!id) return;
    setHasAudio(await hasStoredAudio(id));
  }, [id]);

  useEffect(() => {
    refreshHasAudio();
  }, [id, refreshHasAudio]);

  // 재생 종료 시 반복 타이머
  const scheduleRepeat = useCallback(() => {
    if (!repeatEnabled || repeatMinutes < 1) return;
    repeatTimerRef.current = setTimeout(() => {
      repeatTimerRef.current = null;
      audioRef.current?.play().catch(() => {});
    }, repeatMinutes * 60 * 1000);
  }, [repeatEnabled, repeatMinutes]);

  useEffect(() => {
    return () => {
      if (repeatTimerRef.current) clearTimeout(repeatTimerRef.current);
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  const handleGenerate = async () => {
    if (!session?.generatedText || !id) return;
    setIsGenerating(true);
    setGenerateError(null);
    const rateStr = speedToRatePercent(speed);

    try {
      if (ttsProvider === "google") {
        const gp = GOOGLE_TTS_PRESETS.find((p) => p.id === googlePresetId) ?? GOOGLE_TTS_PRESETS[0];
        const body: Record<string, unknown> = {
          text: session.generatedText,
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
        await saveAudio(id, blob);
        const now = new Date().toISOString();
        const updatedSession = {
          ...session,
          lastGeneratedAt: now,
          updatedAt: now,
          ttsProvider: "google" as const,
          voice: gp.voice,
          ttsRate: rateStr,
          ttsBreakSeconds,
        };
        saveSession(updatedSession, session.items, session.eventItems ?? []);
        setSession(updatedSession);
      } else {
        const preset = TTS_PRESETS.find((p) => p.id === presetId) ?? TTS_PRESETS[0];
        const isManual = presetId === "manual";
        const ttsParams: Record<string, unknown> = {
          voice: isManual ? manualVoice : preset.voice,
          style: isManual
            ? (manualStyle === "default" ? undefined : manualStyle)
            : "style" in preset && preset.style !== undefined && preset.style !== "default"
              ? preset.style
              : undefined,
          rate: isManual ? rateStr : ("rate" in preset && preset.rate != null ? preset.rate : rateStr),
          breakSeconds: ttsBreakSeconds,
        };
        if (isManual) {
          if (manualPitch) ttsParams.pitch = manualPitch;
          ttsParams.styleDegree = manualStyleDegree;
        } else if ("pitch" in preset && preset.pitch != null) {
          ttsParams.pitch = preset.pitch;
        }
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: session.generatedText,
            ...ttsParams,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `오류 ${res.status}`);
        }
        const blob = await res.blob();
        await saveAudio(id, blob);
        const now = new Date().toISOString();
        const updatedSession = {
          ...session,
          lastGeneratedAt: now,
          updatedAt: now,
          ttsProvider: "azure" as const,
          ttsPresetId: presetId,
          voice: isManual ? manualVoice : preset.voice,
          ttsStyle: isManual ? manualStyle : ("style" in preset ? preset.style : undefined),
          ttsStyleDegree: isManual ? manualStyleDegree : undefined,
          ttsRate: isManual ? rateStr : ("rate" in preset && preset.rate != null ? preset.rate : rateStr),
          ttsPitch: isManual ? manualPitch : ("pitch" in preset ? preset.pitch : undefined),
          ttsBreakSeconds,
        };
        saveSession(updatedSession, session.items, session.eventItems ?? []);
        setSession(updatedSession);
      }
      await refreshHasAudio();
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsGenerating(false);
    }
  };

  const play = useCallback(async () => {
    if (!id || !audioRef.current) return;
    try {
      const blob = await getAudioBlob(id);
      if (!blob) return;
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = URL.createObjectURL(blob);
      audioRef.current.src = blobUrlRef.current;
      await audioRef.current.play();
      setIsPlaying(true);

      const s = getSession(id);
      if (s) {
        const now = new Date().toISOString();
        saveSession({ ...s, lastPlayedAt: now, updatedAt: now }, s.items, s.eventItems ?? []);
        setSession((prev) =>
          prev ? { ...prev, lastPlayedAt: now, updatedAt: now } : null
        );
      }
    } catch {
      setGenerateError("재생을 시작할 수 없습니다.");
    }
  }, [id]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const stop = useCallback(() => {
    if (repeatTimerRef.current) {
      clearTimeout(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setIsPlaying(false);
  }, []);

  const onEnded = useCallback(() => {
    setIsPlaying(false);
    scheduleRepeat();
  }, [scheduleRepeat]);

  const handleDownload = useCallback(async () => {
    if (!id) return;
    const blob = await getAudioBlob(id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(session?.title || "방송").replace(/[/\\?%*:|"<>]/g, "_")}.mp3`;
    a.click();
    URL.revokeObjectURL(url);
  }, [id, session?.title]);

  const saveRepeatSetting = useCallback(() => {
    if (!session) return;
    const updated = { ...session, repeatMinutes, updatedAt: new Date().toISOString() };
    saveSession(updated, session.items, session.eventItems ?? []);
    setSession(updated);
  }, [session, repeatMinutes]);

  if (!id) {
    return (
      <main className="min-h-screen bg-[var(--bg)] p-8">
        <p className="text-stone-500">잘못된 경로입니다.</p>
        <Link href="/" className="mt-2 inline-block text-amber-600 hover:underline">← 첫 화면</Link>
      </main>
    );
  }

  if (session === null) {
    return (
      <main className="min-h-screen bg-[var(--bg)] p-8">
        <p className="text-stone-500">방송을 찾을 수 없습니다.</p>
        <Link href="/" className="mt-2 inline-block text-amber-600 hover:underline">← 첫 화면</Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link href="/" className="text-sm text-stone-500 hover:text-stone-700">
          ← 첫 화면으로
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-stone-800">{session.title}</h1>
        <p className="mt-1 text-sm text-stone-500">방송 재생</p>

        <audio
          ref={audioRef}
          onEnded={onEnded}
          onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
          onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
          onDurationChange={() => setDuration(audioRef.current?.duration ?? 0)}
        />

        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-800">MP3 생성</h2>
          <p className="mt-1 text-sm text-stone-500">
            저장된 멘트로 음성 파일을 생성합니다.
          </p>

          <div className="mt-6 border-t border-stone-100 pt-4">
            <h3 className="text-sm font-medium text-stone-700">음성 설정</h3>
            <p className="mt-1 text-xs text-stone-500">프리셋(음성+스타일)과 말하기 속도만 설정합니다.</p>
            {ttsProvider === "google" ? (
              <div className="mt-3">
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {GOOGLE_TTS_PRESETS.map((p) => (
                    <label key={p.id} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-2 text-sm has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50">
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
              </div>
            ) : (
            <div className="mt-3">
              <span className="block text-xs text-stone-500">라디오 프리셋 (Azure)</span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {TTS_PRESETS.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-2 text-sm has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50">
                    <input
                      type="radio"
                      name="ttsPreset"
                      value={p.id}
                      checked={presetId === p.id}
                      onChange={() => setPresetId(p.id)}
                      className="h-4 w-4 border-stone-300 text-amber-600"
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
            )}

            {ttsProvider === "azure" && presetId === "manual" && (
              <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50/50 p-4">
                <span className="block text-xs font-medium text-stone-600">수동 설정</span>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs text-stone-500">목소리</label>
                    <select
                      value={manualVoice}
                      onChange={(e) => setManualVoice(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800"
                    >
                      {MANUAL_VOICES.map((v) => (
                        <option key={v.value} value={v.value}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500">분위기 (스타일)</label>
                    <select
                      value={manualStyle}
                      onChange={(e) => setManualStyle(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800"
                    >
                      {MANUAL_STYLES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500">피치 (예: 0%, +2%, -5%)</label>
                    <input
                      type="text"
                      value={manualPitch}
                      onChange={(e) => setManualPitch(e.target.value)}
                      placeholder="0%"
                      className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500">스타일 강도 (0.01~2)</label>
                    <input
                      type="number"
                      min={0.01}
                      max={2}
                      step={0.1}
                      value={manualStyleDegree}
                      onChange={(e) => setManualStyleDegree(parseFloat(e.target.value) || 1.2)}
                      className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800"
                    />
                  </div>
                </div>
              </div>
            )}

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
                      className={`min-w-[2.25rem] rounded px-2 py-1 text-sm ${speed === v ? "bg-amber-500 text-white" : "text-stone-600 hover:bg-stone-100"}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs text-stone-500">상품 사이 쉼 (초)</label>
              <p className="mt-0.5 text-xs text-stone-400">멘트 줄 사이에 쉬는 시간입니다.</p>
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
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !session.generatedText}
            className="mt-4 w-full max-w-xs rounded-xl bg-amber-500 px-6 py-2.5 font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {isGenerating ? "생성 중…" : "음성 파일 생성"}
          </button>
          <p className="mt-1 text-xs text-stone-500">
            음성 파일을 생성하고, 아래 재생 영역에서 방송을 틀 수 있습니다.
          </p>
          {generateError && (
            <p className="mt-2 text-sm text-red-600">{generateError}</p>
          )}
          {hasAudio && !generateError && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-sm text-green-600">오디오가 준비되었습니다. 아래에서 재생하거나 다운로드할 수 있습니다.</p>
              <button
                type="button"
                onClick={handleDownload}
                className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
              >
                MP3 다운로드
              </button>
            </div>
          )}
        </section>

        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-800">재생</h2>
          {hasAudio && (
            <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-sm text-stone-700">
              <p className="font-medium text-stone-800">재생될 MP3 생성 설정</p>
              <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
                <li>제공자: {session?.ttsProvider === "google" ? "Google (Chirp 3 HD)" : "Azure"}</li>
                <li>프리셋: {session?.ttsProvider === "google"
                  ? (GOOGLE_TTS_PRESETS.find((p) => p.voice === session?.voice)?.label ?? "—")
                  : session?.ttsPresetId === "manual"
                    ? "수동 설정"
                    : TTS_PRESETS.find((p) => {
                        if (p.id === "manual") return false;
                        if (p.voice !== session?.voice) return false;
                        if ("rate" in p && p.rate != null) return session?.ttsRate === p.rate;
                        return ("style" in p ? p.style : "default") === (session?.ttsStyle ?? "default");
                      })?.label ?? "—"}</li>
                {session?.ttsProvider === "azure" && session?.ttsPresetId === "manual" && (
                  <>
                    <li>목소리: {MANUAL_VOICES.find((v) => v.value === session?.voice)?.label ?? session?.voice ?? "—"}</li>
                    <li>분위기: {MANUAL_STYLES.find((s) => s.value === session?.ttsStyle)?.label ?? (session?.ttsStyle === "default" || !session?.ttsStyle ? "기본" : session?.ttsStyle)}</li>
                    <li>피치: {session?.ttsPitch ?? "0%"}</li>
                    <li>스타일 강도: {session?.ttsStyleDegree != null ? session.ttsStyleDegree : "—"}</li>
                  </>
                )}
                <li>말하기 속도: {session?.ttsRate ? `${ratePercentToSpeed(session.ttsRate).toFixed(1)}x` : "1.0x"}</li>
                <li>상품 사이 쉼: {session?.ttsBreakSeconds != null ? `${session.ttsBreakSeconds}초` : "—"}</li>
              </ul>
              <p className="mt-1.5 text-xs text-stone-500">설정을 바꾼 뒤에는 MP3를 다시 생성해야 반영됩니다.</p>
            </div>
          )}
          <div className="mt-4 flex flex-col items-center gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={isPlaying ? pause : play}
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
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm disabled:opacity-40"
              >
                ⏸ 일시정지
              </button>
              <button
                type="button"
                onClick={stop}
                disabled={!hasAudio}
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm disabled:opacity-40"
              >
                ⏹ 정지
              </button>
            </div>
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
                  <span>{Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, "0")}</span>
                  <span>{Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, "0")}</span>
                </div>
              </div>
            )}
          </div>
          {!hasAudio && (
            <p className="mt-2 text-sm text-stone-500">먼저 MP3를 생성해 주세요.</p>
          )}

          <div className="mt-6 border-t border-stone-100 pt-4">
            <h3 className="text-sm font-medium text-stone-700">반복 재생</h3>
            <label className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={repeatEnabled}
                onChange={(e) => setRepeatEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-stone-300"
              />
              <span className="text-sm text-stone-600">재생 종료 후 반복</span>
            </label>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm text-stone-600">간격</span>
              <input
                type="number"
                min={1}
                value={repeatMinutes}
                onChange={(e) => setRepeatMinutes(parseInt(e.target.value, 10) || 1)}
                onBlur={saveRepeatSetting}
                className="w-20 rounded border border-stone-200 px-2 py-1 text-sm"
              />
              <span className="text-sm text-stone-600">분</span>
            </div>
          </div>
        </section>

        <Link
          href={`/broadcast/${id}/edit`}
          className="mt-6 inline-block text-sm text-stone-500 hover:text-stone-700"
        >
          방송 수정하기 →
        </Link>
      </div>
    </main>
  );
}
