export type EventType = "TIME_SALE" | "CLEARANCE" | "TODAY_DISCOUNT" | "FREE";

export interface BroadcastItem {
  id: string;
  sessionId: string;
  isSelected: boolean;
  name: string;
  unit: string;
  /** 할인가 (필수) */
  price: number;
  /** 정상가 (선택, 있으면 멘트에 "정상가 N원 할인가 N원" 형태) */
  originalPrice?: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  title: string;
  eventType: EventType;
  customOpening?: string; // 자유입력 시 시작 문구
  scheduledAt: string | null;
  /** 예정 종료 (표시용) */
  scheduledEndAt?: string | null;
  repeatMinutes: number;
  itemSuffixIsnida: boolean;
  lastGeneratedAt: string | null;
  lastPlayedAt: string | null;
  latestAudioUrl: string | null;
  generatedText: string | null;
  /** TTS 제공자: azure | google. 없으면 azure */
  ttsProvider?: "azure" | "google";
  /** TTS 음성 설정 (방송별 저장) */
  ttsPresetId?: string;
  voice?: string;
  ttsStyle?: string;
  ttsStyleDegree?: number;
  ttsRate?: string;
  ttsPitch?: string;
  ttsBreakSeconds?: number;
  createdAt: string;
  updatedAt: string;
}

export type SessionWithItems = Session & {
  items: BroadcastItem[];
  /** 행사 상품 (초특가와 구분). 없으면 빈 배열로 간주 */
  eventItems?: BroadcastItem[];
};
