/** 관리자가 정의하는 Google Cloud TTS 음성 템플릿 (localStorage) */
export type VoiceTemplate = {
  id: string;
  /** 사용자에게 보이는 이름 */
  label: string;
  /** Google voice name (예: ko-KR-Chirp3-HD-Charon) */
  voice: string;
  /** 언어 코드 (예: ko-KR) */
  languageCode: string;
  enabled: boolean;
  /** true면 유료 플랜에만 노출 */
  paidOnly?: boolean;
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
