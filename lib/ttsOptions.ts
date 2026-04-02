/** 음성+스타일 조합 프리셋 (라디오 선택용). rate/pitch 있으면 고정값 사용. manual은 수동 설정용 */
export const TTS_PRESETS = [
  { id: "energetic_male", label: "활기찬 남자", voice: "ko-KR-InJoonNeural", style: "excited" },
  { id: "energetic_female", label: "활기찬 여자", voice: "ko-KR-SunHiNeural", style: "excited" },
  { id: "bright_male", label: "밝은 남자", voice: "ko-KR-InJoonNeural", style: "cheerful" },
  { id: "bright_female", label: "밝은 여자", voice: "ko-KR-SunHiNeural", style: "cheerful" },
  { id: "calm_male", label: "차분한 남자", voice: "ko-KR-InJoonNeural", style: "newscast" },
  { id: "calm_female", label: "차분한 여자", voice: "ko-KR-SunHiNeural", style: "newscast" },
  { id: "friendly_male", label: "친근한 남자", voice: "ko-KR-HyunsuNeural", style: "friendly" },
  { id: "friendly_female", label: "친근한 여자", voice: "ko-KR-JiMinNeural", style: "friendly" },
  { id: "test_male", label: "테스트 남자", voice: "ko-KR-InJoonNeural", rate: "+7%", pitch: "+2%" },
  { id: "manual", label: "수동 설정", voice: "ko-KR-InJoonNeural" },
] as const;

/** 수동 설정용: 목소리(남/여) 선택 */
export const MANUAL_VOICES = [
  { value: "ko-KR-InJoonNeural", label: "남자 (인준)" },
  { value: "ko-KR-HyunsuNeural", label: "남자 (현수)" },
  { value: "ko-KR-SunHiNeural", label: "여자 (선히)" },
  { value: "ko-KR-JiMinNeural", label: "여자 (지민)" },
] as const;

/** 수동 설정용: 분위기(스타일) */
export const MANUAL_STYLES = [
  { value: "default", label: "기본" },
  { value: "cheerful", label: "밝은" },
  { value: "excited", label: "활기찬" },
  { value: "newscast", label: "차분한(뉴스)" },
  { value: "friendly", label: "친근한" },
] as const;

/** 말하기 속도: 1.0 = 기본, 슬라이더/토글용 */
export const SPEED_PRESETS = [0.8, 1.0, 1.2, 1.5] as const;
export const SPEED_MIN = 0.8;
export const SPEED_MAX = 2;
export const DEFAULT_SPEED = 1.0;

/** 속도 배율(1.0 등) → SSML rate 퍼센트 */
export function speedToRatePercent(speed: number): string {
  if (speed <= 0) return "0%";
  if (speed === 1) return "0%";
  if (speed < 1) return `${Math.round((speed - 1) * 100)}%`; // e.g. 0.8 → -20%
  return `+${Math.round((speed - 1) * 100)}%`; // e.g. 1.5 → +50%
}

/** SSML rate 퍼센트 → 속도 배율 */
export function ratePercentToSpeed(rate: string | undefined): number {
  if (!rate) return 1;
  const n = parseInt(rate.replace(/%|\+/g, ""), 10);
  if (Number.isNaN(n)) return 1;
  return 1 + n / 100;
}

/** "+10%" / "-20%" 등 → Google `speakingRate`에 대응하는 계수 (대략 0.25~4 구간에서 사용) */
export function ratePercentStringToSpeakingRate(rate: string | undefined): number {
  if (!rate) return 1;
  const n = parseInt(rate.replace(/%|\+/g, ""), 10);
  if (Number.isNaN(n)) return 1;
  return 1 + n / 100;
}

export const DEFAULT_TTS = {
  presetId: "bright_male" as const,
  speed: DEFAULT_SPEED,
  breakSeconds: 0.5,
} as const;

/** Google TTS (Chirp 3 HD) 프리셋. 무료 100만 글자/월. 스타일 기반 라벨 */
export const GOOGLE_TTS_PRESETS = [
  { id: "google_charon", label: "활기찬 남자 (Charon)", voice: "ko-KR-Chirp3-HD-Charon" },
  { id: "google_puck", label: "차분한 남자 (Puck)", voice: "ko-KR-Chirp3-HD-Puck" },
  { id: "google_enceladus", label: "친근한 남자 (Enceladus)", voice: "ko-KR-Chirp3-HD-Enceladus" },
  { id: "google_kore", label: "활기찬 여자 (Kore)", voice: "ko-KR-Chirp3-HD-Kore" },
  { id: "google_leda", label: "차분한 여자 (Leda)", voice: "ko-KR-Chirp3-HD-Leda" },
  { id: "google_aoede", label: "친근한 여자 (Aoede)", voice: "ko-KR-Chirp3-HD-Aoede" },
] as const;
