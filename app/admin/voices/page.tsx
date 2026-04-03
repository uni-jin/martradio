"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AdminShell from "@/app/_components/AdminShell";
import { generateId } from "@/lib/utils";
import type { VoiceTemplate } from "@/lib/voiceTemplateTypes";
import { getVoiceTemplates, saveVoiceTemplates } from "@/lib/adminData";
import { GOOGLE_TTS_EFFECTS_PROFILE_OPTIONS } from "@/lib/googleTtsEffects";
import { buildGoogleTtsSynthesizeBody } from "@/lib/ttsGoogleRequest";
import { SELECT_CHEVRON_TAILWIND } from "@/app/_lib/selectChevron";

/** 미리듣기에 사용하는 고정 문구 */
const PREVIEW_TEXT = "안내 방송 테스트입니다.";

function clampForPreview(t: VoiceTemplate): VoiceTemplate {
  return {
    ...t,
    speakingRate: Math.min(4, Math.max(0.25, t.speakingRate)),
    pitch: Math.min(20, Math.max(-20, t.pitch)),
    volumeGainDb: Math.min(16, Math.max(-96, t.volumeGainDb)),
    sampleRateHertz:
      t.sampleRateHertz != null && t.sampleRateHertz > 0 ? Math.round(t.sampleRateHertz) : null,
    effectsProfileId: t.effectsProfileId?.length ? [...t.effectsProfileId] : null,
  };
}

type GoogleVoiceRow = {
  name: string;
  languageCodes: string[];
  ssmlGender?: string;
};

function newTemplate(): VoiceTemplate {
  const t = new Date().toISOString();
  return {
    id: generateId(),
    label: "새 음성 템플릿",
    voice: "ko-KR-Chirp3-HD-Charon",
    languageCode: "ko-KR",
    enabled: true,
    paidOnly: false,
    speakingRate: 1,
    pitch: 0,
    volumeGainDb: 0,
    sampleRateHertz: null,
    effectsProfileId: null,
    createdAt: t,
    updatedAt: t,
  };
}

export default function AdminVoicesPage() {
  const [list, setList] = useState<VoiceTemplate[]>([]);
  const [googleVoices, setGoogleVoices] = useState<GoogleVoiceRow[]>([]);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [editing, setEditing] = useState<VoiceTemplate | null>(null);
  const [isNew, setIsNew] = useState(false);
  /** 미리듣기 생성 중인 항목 id, 편집 폼은 "__editing__" */
  const [previewingKey, setPreviewingKey] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewBlobUrlRef = useRef<string | null>(null);

  const refresh = useCallback(() => {
    setList(getVoiceTemplates());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    void loadGoogleVoices();
  }, []);

  useEffect(() => {
    return () => {
      if (previewBlobUrlRef.current) {
        URL.revokeObjectURL(previewBlobUrlRef.current);
      }
    };
  }, []);

  const playPreviewBlob = useCallback(async (blob: Blob) => {
    if (previewBlobUrlRef.current) {
      URL.revokeObjectURL(previewBlobUrlRef.current);
      previewBlobUrlRef.current = null;
    }
    const url = URL.createObjectURL(blob);
    previewBlobUrlRef.current = url;
    const el = previewAudioRef.current;
    if (!el) return;
    el.src = url;
    try {
      await el.play();
    } catch {
      setPreviewError(
        "브라우저에서 자동 재생이 차단되었을 수 있습니다. 화면을 한 번 클릭한 뒤 다시 미리듣기를 눌러 주세요."
      );
    }
  }, []);

  const previewTemplate = useCallback(
    async (template: VoiceTemplate, key: string) => {
      if (!template.voice.trim()) {
        setPreviewError("음성(voice)이 필요합니다.");
        return;
      }
      setPreviewError(null);
      setPreviewingKey(key);
      try {
        const t = clampForPreview(template);
        const synth = buildGoogleTtsSynthesizeBody(PREVIEW_TEXT, t, 1, 0.5);
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
          throw new Error((data as { error?: string }).error || `오류 ${res.status}`);
        }
        const blob = await res.blob();
        await playPreviewBlob(blob);
      } catch (e) {
        setPreviewError(e instanceof Error ? e.message : String(e));
      } finally {
        setPreviewingKey(null);
      }
    },
    [playPreviewBlob]
  );

  const loadGoogleVoices = async () => {
    setLoadingVoices(true);
    setGoogleError(null);
    try {
      const res = await fetch("/api/tts-google/voices?languageCode=ko-KR");
      const data = (await res.json()) as { voices?: GoogleVoiceRow[]; error?: string };
      if (!res.ok) throw new Error(data.error || "목록을 불러오지 못했습니다.");
      setGoogleVoices(data.voices ?? []);
    } catch (e) {
      setGoogleError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingVoices(false);
    }
  };

  const persist = (next: VoiceTemplate[]) => {
    saveVoiceTemplates(next);
    setList(next);
    try {
      window.dispatchEvent(new CustomEvent("mart-voice-templates-updated"));
    } catch {
      // noop
    }
  };

  const startAdd = () => {
    setEditing(newTemplate());
    setIsNew(true);
  };

  const startEdit = (v: VoiceTemplate) => {
    setEditing({ ...v });
    setIsNew(false);
  };

  const saveEdit = () => {
    if (!editing) return;
    if (!editing.label.trim() || !editing.voice.trim()) {
      alert("표시 이름과 음성(voice)은 필수입니다.");
      return;
    }
    const t = new Date().toISOString();
    const nextItem: VoiceTemplate = {
      ...editing,
      label: editing.label.trim(),
      voice: editing.voice.trim(),
      languageCode: editing.languageCode.trim() || "ko-KR",
      speakingRate: Math.min(4, Math.max(0.25, editing.speakingRate)),
      pitch: Math.min(20, Math.max(-20, editing.pitch)),
      volumeGainDb: Math.min(16, Math.max(-96, editing.volumeGainDb)),
      sampleRateHertz:
        editing.sampleRateHertz != null && editing.sampleRateHertz > 0
          ? Math.round(editing.sampleRateHertz)
          : null,
      effectsProfileId:
        editing.effectsProfileId && editing.effectsProfileId.length > 0
          ? [...editing.effectsProfileId]
          : null,
      updatedAt: t,
      createdAt: isNew ? t : editing.createdAt,
    };
    if (isNew) {
      persist([nextItem, ...list]);
    } else {
      persist(list.map((x) => (x.id === nextItem.id ? nextItem : x)));
    }
    setEditing(null);
    setIsNew(false);
  };

  const remove = (id: string) => {
    if (!confirm("이 음성 템플릿을 삭제할까요? 사용자 화면에서도 사라집니다.")) return;
    persist(list.filter((x) => x.id !== id));
  };

  const toggleEnabled = (id: string, enabled: boolean) => {
    const t = new Date().toISOString();
    persist(list.map((x) => (x.id === id ? { ...x, enabled, updatedAt: t } : x)));
  };

  const toggleEffect = (value: string, checked: boolean) => {
    if (!editing) return;
    const cur = editing.effectsProfileId ?? [];
    const set = new Set(cur);
    if (checked) set.add(value);
    else set.delete(value);
    const arr = [...set];
    setEditing({
      ...editing,
      effectsProfileId: arr.length ? arr : null,
    });
  };

  const applyGoogleVoice = (name: string) => {
    const row = googleVoices.find((v) => v.name === name);
    if (!editing) return;
    setEditing({
      ...editing,
      voice: name,
      languageCode: row?.languageCodes?.[0] ?? editing.languageCode ?? "ko-KR",
    });
  };

  return (
    <AdminShell title="">
      <p className="mb-4 text-sm text-stone-500">
        사용자 화면에서 음성을 생성할 때 선택하는 목소리 목록을 그대로 보여주며, 노출/유료 여부를 제어합니다.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={startAdd}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
        >
          템플릿 추가
        </button>
      </div>
      {googleError && <p className="mb-3 text-sm text-red-600">{googleError}</p>}
      {previewError && (
        <p className="mb-3 text-sm text-red-600" role="alert">
          미리듣기: {previewError}
        </p>
      )}
      <audio ref={previewAudioRef} className="hidden" preload="auto" />

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-7xl overflow-y-auto rounded-2xl border border-slate-300 bg-slate-50 p-4 shadow-lg">
          <h2 className="text-sm font-semibold text-stone-800">{isNew ? "새 템플릿" : "템플릿 수정"}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-xs text-stone-600">표시 이름 *</span>
              <input
                value={editing.label}
                onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              />
            </label>
            {googleVoices.length > 0 && (
              <label className="block sm:col-span-2">
                <span className="text-xs text-stone-600">Google 음성 선택 (API 목록)</span>
                <select
                  value={googleVoices.some((v) => v.name === editing.voice) ? editing.voice : ""}
                  onChange={(e) => {
                    if (e.target.value) applyGoogleVoice(e.target.value);
                  }}
                  className={`mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 pr-10 text-sm ${SELECT_CHEVRON_TAILWIND}`}
                >
                  <option value="">— 직접 입력 —</option>
                  {googleVoices.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name}
                      {v.ssmlGender ? ` (${v.ssmlGender})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block sm:col-span-2">
              <span className="text-xs text-stone-600">voice (Google 보이스 이름) *</span>
              <input
                value={editing.voice}
                onChange={(e) => setEditing({ ...editing, voice: e.target.value })}
                placeholder="예: ko-KR-Chirp3-HD-Charon"
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs text-stone-600">languageCode</span>
              <input
                value={editing.languageCode}
                onChange={(e) => setEditing({ ...editing, languageCode: e.target.value })}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs text-stone-600">
                템플릿 말하기 속도 배율 (0.25~4) — 사용자 속도와 곱해짐
              </span>
              <input
                type="number"
                step={0.05}
                min={0.25}
                max={4}
                value={editing.speakingRate}
                onChange={(e) =>
                  setEditing({ ...editing, speakingRate: parseFloat(e.target.value) || 1 })
                }
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs text-stone-600">피치 (반음, -20 ~ 20)</span>
              <input
                type="number"
                step={0.5}
                min={-20}
                max={20}
                value={editing.pitch}
                onChange={(e) => setEditing({ ...editing, pitch: parseFloat(e.target.value) || 0 })}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs text-stone-600">볼륨 게인 (dB, -96 ~ 16)</span>
              <input
                type="number"
                step={1}
                min={-96}
                max={16}
                value={editing.volumeGainDb}
                onChange={(e) =>
                  setEditing({ ...editing, volumeGainDb: parseFloat(e.target.value) || 0 })
                }
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs text-stone-600">샘플레이트 (Hz, 선택)</span>
              <input
                type="number"
                min={8000}
                max={48000}
                step={1000}
                value={editing.sampleRateHertz ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditing({
                    ...editing,
                    sampleRateHertz: v === "" ? null : Math.round(Number(v)),
                  });
                }}
                placeholder="비우면 기본값"
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              />
            </label>
            <div className="sm:col-span-2">
              <span className="text-xs text-stone-600">음향 효과 프로필 (effectsProfileId, 다중 선택)</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {GOOGLE_TTS_EFFECTS_PROFILE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={editing.effectsProfileId?.includes(opt.value) ?? false}
                      onChange={(e) => toggleEffect(opt.value, e.target.checked)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={editing.enabled}
                onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
              />
              <span className="text-sm text-stone-700">사용자 화면에 노출</span>
            </label>
            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={editing.paidOnly === true}
                onChange={(e) => setEditing({ ...editing, paidOnly: e.target.checked })}
              />
              <span className="text-sm text-stone-700">유료 사용자 전용</span>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={saveEdit}
              className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
            >
              저장
            </button>
            <button
              type="button"
              onClick={() => {
                if (!editing) return;
                void previewTemplate(
                  {
                    ...editing,
                    label: editing.label.trim() || editing.id,
                    voice: editing.voice.trim(),
                    languageCode: editing.languageCode.trim() || "ko-KR",
                  },
                  "__editing__"
                );
              }}
              disabled={previewingKey === "__editing__" || !editing.voice.trim()}
              className="rounded-lg border border-slate-400 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200 disabled:opacity-50"
            >
              {previewingKey === "__editing__" ? "생성 중…" : "미리듣기"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setIsNew(false);
              }}
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700"
            >
              취소
            </button>
            <span className="text-xs text-stone-500">
              문구: &quot;{PREVIEW_TEXT}&quot; · 사용자 속도 1.0× 기준
            </span>
          </div>
          <p className="mt-3 text-xs text-stone-500">
            Google Cloud TTS 표준 API에는 LLM 스타일의 &quot;온도(temperature)&quot; 파라미터가 없습니다. 말하기 속도·피치·볼륨·샘플레이트·효과 프로필로 음색과 재생 환경을 조정할 수 있습니다.
          </p>
        </div>
        </div>
      )}

      <div className="space-y-2">
        {list.map((v) => (
          <div
            key={v.id}
            className="rounded-xl border border-stone-200 bg-white px-3 py-3 shadow-sm"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-800">{v.label}</p>
              <p className="mt-1 font-mono text-xs text-stone-500">{v.voice}</p>
              <p className="mt-1 text-xs text-stone-500">
                lang: {v.languageCode} · 속도×{v.speakingRate.toFixed(2)} · 피치 {v.pitch} · 볼륨{" "}
                {v.volumeGainDb}dB
                {v.sampleRateHertz ? ` · ${v.sampleRateHertz}Hz` : ""}
                {v.effectsProfileId?.length ? ` · 효과 ${v.effectsProfileId.join(", ")}` : ""}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3 text-sm text-stone-700">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={v.enabled}
                    onChange={(e) => toggleEnabled(v.id, e.target.checked)}
                  />
                  <span className="text-xs sm:text-sm">노출</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={v.paidOnly === true}
                    onChange={(e) => {
                      const t = new Date().toISOString();
                      persist(
                        list.map((x) =>
                          x.id === v.id ? { ...x, paidOnly: e.target.checked, updatedAt: t } : x
                        )
                      );
                    }}
                  />
                  <span className="text-xs sm:text-sm">유료 사용자 전용</span>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void previewTemplate(v, v.id)}
                  disabled={previewingKey === v.id}
                  className="rounded-lg border border-slate-400 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-200 disabled:opacity-50"
                >
                  {previewingKey === v.id ? "재생 중…" : "미리듣기"}
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(v)}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => remove(v.id)}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="text-sm text-stone-500">등록된 템플릿이 없습니다.</p>}
      </div>
    </AdminShell>
  );
}
