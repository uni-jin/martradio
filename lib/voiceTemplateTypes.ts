/** Chirp 3 HD: markup + 전체 보이스 이름. Gemini-TTS: 짧은 보이스 이름(Puck 등) + 프롬프트 */
export type VoiceTtsEngine = "chirp3-hd" | "gemini-3.1-flash-tts-preview";

/** 관리자가 정의하는 Google Cloud TTS 음성 템플릿(Supabase `admin_kv` 등 서버 저장) */
export type VoiceTemplate = {
  id: string;
  /** 사용자에게 보이는 이름 */
  label: string;
  /**
   * Chirp3 HD: `ko-KR-Chirp3-HD-Charon` 형식.
   * Gemini 3.1 Flash TTS: 문서의 짧은 이름(예: Puck, Fenrir).
   */
  voice: string;
  /** 미설정 시 Chirp3 HD로 간주 */
  ttsEngine?: VoiceTtsEngine;
  /** Gemini TTS 전용: 연출·톤 지시(자연어). Chirp3에서는 미사용 */
  geminiPrompt?: string | null;
  /** 언어 코드 (예: ko-KR) */
  languageCode: string;
  enabled: boolean;
  /** true면 유료 플랜에만 노출 */
  paidOnly?: boolean;
  /** 관리자 화면에서만 생성·저장되는 미리듣기 오디오 URL(또는 Data URL). 사용자 화면은 값이 있을 때만 재생. */
  previewAudioDataUrl?: string | null;
  /** 사용자 노출 순서 (오름차순) */
  sortOrder?: number;
  /**
   * 템플릿 기본 말하기 속도 배율. 사용자 화면 속도와 곱해짐.
   * Google speakingRate 0.25~4.0 범위로 최종 클램프.
   */
  speakingRate: number;
  /** 반음 단위 -20.0 ~ 20.0 */
  pitch: number;
  /** 볼륨 게인 -96.0 ~ 16.0 dB */
  volumeGainDb: number;
  /** 샘플레이트 (선택). 미지정 시 Google 기본 */
  sampleRateHertz?: number | null;
  /** 음향 효과 프로필 (선택) */
  effectsProfileId?: string[] | null;
  createdAt: string;
  updatedAt: string;
};
