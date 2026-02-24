import type { EventType } from "./types";

const OPENING: Record<EventType, string> = {
  TIME_SALE: "지금부터 타임세일 상품 안내드립니다.",
  CLEARANCE: "마감 임박 재고정리 상품 안내드립니다.",
  TODAY_DISCOUNT: "오늘 할인 상품을 안내드립니다.",
  FREE: "", // 사용자 직접 입력
};

const ENDING = "지금 바로 신선코너에서 만나보세요!";

export function getOpeningLine(eventType: EventType, customOpening?: string): string {
  if (eventType === "FREE" && customOpening?.trim()) return customOpening.trim();
  return OPENING[eventType] || "";
}

type ScriptItem = {
  name: string;
  unit: string;
  price: number;
  originalPrice?: number | null;
  isSelected: boolean;
};

function itemLines(items: ScriptItem[], suffixIsnida: boolean): string[] {
  const selected = items.filter((i) => i.isSelected);
  // 마트 방송 톤에 가깝게 살짝 올려서 끝나는 느낌
  const suffix = suffixIsnida ? "입니다!" : "!";
  return selected.map((item) => {
    const hasOriginal = item.originalPrice != null && item.originalPrice > 0;
    return hasOriginal
      ? `${item.name} ${item.unit}에 정상까 ${item.originalPrice}원, 할인까 ${item.price}원${suffix}`
      : `${item.name} ${item.unit}에 ${item.price}원${suffix}`;
  });
}

export function buildScript(
  eventType: EventType,
  customOpening: string | undefined,
  superItems: ScriptItem[],
  eventItems: ScriptItem[],
  suffixIsnida: boolean
): string {
  const opening = getOpeningLine(eventType, customOpening);
  const lines: string[] = [];
  if (opening) lines.push(opening);
  const superSelected = superItems.filter((i) => i.isSelected);
  const eventSelected = eventItems.filter((i) => i.isSelected);
  if (superSelected.length > 0) {
    lines.push("초특가 상품");
    lines.push(...itemLines(superItems, suffixIsnida));
  }
  if (eventSelected.length > 0) {
    lines.push("할인 상품");
    lines.push(...itemLines(eventItems, suffixIsnida));
  }
  lines.push(ENDING);
  return lines.join("\n");
}
