import type { VoiceTemplate } from "./voiceTemplateTypes";
import { ratePercentStringToSpeakingRate, speedToRatePercent } from "./ttsOptions";

const GEMINI_MODEL_ID = "gemini-3.1-flash-tts-preview" as const;

export type GoogleTtsSynthesizeBodyChirp = {
  ttsEngine: "chirp3-hd";
  text: string;
  voice: string;
  languageCode: string;
  speakingRate: number;
  pitch: number;
  volumeGainDb: number;
  sampleRateHertz?: number | null;
  effectsProfileId?: string[] | null;
  breakSeconds: number;
};

export type GoogleTtsSynthesizeBodyGemini = {
  ttsEngine: "gemini-3.1-flash-tts-preview";
  text: string;
  voice: string;
  languageCode: string;
  geminiPrompt: string;
  modelName: typeof GEMINI_MODEL_ID;
  speakingRate: number;
  pitch: number;
  volumeGainDb: number;
  sampleRateHertz?: number | null;
  breakSeconds: number;
};

export type GoogleTtsSynthesizeBody = GoogleTtsSynthesizeBodyChirp | GoogleTtsSynthesizeBodyGemini;

/** Enter로 나눈 줄 사이에 [pause short] / [pause long] 삽입 (Chirp 3 HD markup) */
export function buildMarkupWithBreaks(text: string, breakSeconds: number): string {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  if (lines.length === 1) return lines[0];
  const tag = breakSeconds > 1 ? "[pause long]" : "[pause short]";
  return lines.join(` ${tag} `);
}

/** Gemini-TTS input.text: 마크업 대신 줄바꿈으로 구간 구분 */
export function buildGeminiPlainTextWithBreaks(text: string, breakSeconds: number): string {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  if (lines.length === 1) return lines[0];
  const sep = breakSeconds > 1 ? "\n\n" : "\n";
  return lines.join(sep);
}

/**
 * 사용자 속도(배율) + 템플릿 기본 말하기 속도 배율을 곱해 Google speakingRate로 클램프.
 */
export function computeFinalSpeakingRate(userSpeed: number, templateSpeakingRate: number): number {
  const rateStr = speedToRatePercent(userSpeed);
  const userFactor = ratePercentStringToSpeakingRate(rateStr);
  const combined = userFactor * templateSpeakingRate;
  return Math.min(4, Math.max(0.25, combined));
}

function resolveTtsEngine(template: VoiceTemplate): VoiceTemplate["ttsEngine"] {
  return template.ttsEngine ?? "chirp3-hd";
}

export function buildGoogleTtsSynthesizeBody(
  text: string,
  template: VoiceTemplate,
  userSpeed: number,
  breakSeconds: number
): GoogleTtsSynthesizeBody {
  const engine = resolveTtsEngine(template);
  const speakingRate = computeFinalSpeakingRate(userSpeed, template.speakingRate);
  const pitch = template.pitch;
  const volumeGainDb = template.volumeGainDb;
  const sampleRateHertz = template.sampleRateHertz ?? null;

  if (engine === "gemini-3.1-flash-tts-preview") {
    const geminiPrompt = (template.geminiPrompt ?? "").trim();
    return {
      ttsEngine: "gemini-3.1-flash-tts-preview",
      text: buildGeminiPlainTextWithBreaks(text, breakSeconds),
      voice: template.voice.trim(),
      languageCode: (template.languageCode || "ko-KR").trim(),
      geminiPrompt,
      modelName: GEMINI_MODEL_ID,
      speakingRate,
      pitch,
      volumeGainDb,
      sampleRateHertz,
      breakSeconds,
    };
  }

  return {
    ttsEngine: "chirp3-hd",
    text,
    voice: template.voice,
    languageCode: template.languageCode,
    speakingRate,
    pitch,
    volumeGainDb,
    sampleRateHertz,
    effectsProfileId: template.effectsProfileId?.length ? template.effectsProfileId : null,
    breakSeconds,
  };
}

/** `/api/tts-google` POST JSON — 클라이언트에서 공통으로 사용 */
export function googleTtsApiJsonBody(synth: GoogleTtsSynthesizeBody): Record<string, unknown> {
  if (synth.ttsEngine === "gemini-3.1-flash-tts-preview") {
    const body: Record<string, unknown> = {
      ttsEngine: synth.ttsEngine,
      text: synth.text,
      voice: synth.voice,
      languageCode: synth.languageCode,
      geminiPrompt: synth.geminiPrompt,
      modelName: synth.modelName,
      speakingRate: synth.speakingRate,
      pitch: synth.pitch,
      volumeGainDb: synth.volumeGainDb,
      breakSeconds: synth.breakSeconds,
    };
    if (synth.sampleRateHertz != null) body.sampleRateHertz = synth.sampleRateHertz;
    return body;
  }

  const body: Record<string, unknown> = {
    ttsEngine: "chirp3-hd",
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
  return body;
}
