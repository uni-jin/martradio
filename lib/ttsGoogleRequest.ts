import type { VoiceTemplate } from "./voiceTemplateTypes";
import { ratePercentStringToSpeakingRate, speedToRatePercent } from "./ttsOptions";

export type GoogleTtsSynthesizeBody = {
  text: string;
  voice: string;
  languageCode: string;
  /** 사용자 화면 속도 슬라이더와 템플릿의 speakingRate를 곱한 최종 값 (0.25~4) */
  speakingRate: number;
  /** -20 ~ 20 */
  pitch: number;
  /** -96 ~ 16 dB */
  volumeGainDb: number;
  sampleRateHertz?: number | null;
  effectsProfileId?: string[] | null;
  breakSeconds: number;
};

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

/**
 * 사용자 속도(배율) + 템플릿 기본 말하기 속도 배율을 곱해 Google speakingRate로 클램프.
 */
export function computeFinalSpeakingRate(
  userSpeed: number,
  templateSpeakingRate: number
): number {
  const rateStr = speedToRatePercent(userSpeed);
  const userFactor = ratePercentStringToSpeakingRate(rateStr);
  const combined = userFactor * templateSpeakingRate;
  return Math.min(4, Math.max(0.25, combined));
}

export function buildGoogleTtsSynthesizeBody(
  text: string,
  template: VoiceTemplate,
  userSpeed: number,
  breakSeconds: number
): GoogleTtsSynthesizeBody {
  return {
    text,
    voice: template.voice,
    languageCode: template.languageCode,
    speakingRate: computeFinalSpeakingRate(userSpeed, template.speakingRate),
    pitch: template.pitch,
    volumeGainDb: template.volumeGainDb,
    sampleRateHertz: template.sampleRateHertz ?? null,
    effectsProfileId: template.effectsProfileId?.length ? template.effectsProfileId : null,
    breakSeconds,
  };
}
