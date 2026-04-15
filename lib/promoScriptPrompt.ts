export const RAW_TEXT_PLACEHOLDER = "{{RAW_TEXT}}";

const LEGACY_STYLE_PLACEHOLDER = "{{STYLE_INSTRUCTION}}";

/** 관리자 미저장 시·검증 실패 시 폴백 */
export const DEFAULT_PROMO_SCRIPT_TEMPLATE = [
  "당신은 한국 마트 매장 방송문을 작성하는 어시스턴트입니다.",
  "입력된 원문(프로모션 문자)을 분석해, 실제 매장 방송에 바로 사용할 한국어 멘트 1개를 작성하세요.",
  "",
  "반드시 지킬 규칙:",
  "1) 원문에 없는 사실(가격, 기간, 수량, 할인 조건)을 절대 만들어내지 말 것.",
  "2) 원문 정보가 불명확하면 모호한 일반 표현으로 처리하고 단정하지 말 것.",
  "3) 결과는 아래 순서를 따를 것: 인사 -> 핵심 안내 -> 마무리, 핵심 안내에는 행사 품목명과 단위와 가격을 명확하게 안내. 그리고 핵심 안내 내용에서 품목별로 앞 뒤에 해당 품목을 자연스럽게 꾸며주는 문장을 추가해서 소비자가 구매하고 싶게 해. 예를 들어서 돼지고기면 노릇노릇하게 구워먹으면 좋을 삼겹살 이런식으로.",
  "4) 고객이 듣기 쉬운 짧은 문장 중심으로 작성할 것.",
  "5) 출력은 방송 멘트 본문 텍스트만 반환할 것(제목, 불릿, JSON, 설명 금지). 가격이나 단위에 있는 숫자 모두 한글로 표현하고 단위에 g같은 걸 사용하지말고 한글로 그람 이라고 표시해. 그리고 내용이 바뀔 때 한 줄씩 줄바꿈 해. 상품 단위(g, kg, 팩 등) 앞에 숫자도 한글로 표현해.",
  "",
  "[원문 시작]",
  RAW_TEXT_PLACEHOLDER,
  "[원문 끝]",
].join("\n");

function stripLegacyStylePlaceholders(template: string): string {
  let t = template;
  if (t.includes(LEGACY_STYLE_PLACEHOLDER)) {
    t = t.replace(/\r?\n[^\n]*\{\{STYLE_INSTRUCTION\}\}[^\n]*/g, "");
    t = t.split(LEGACY_STYLE_PLACEHOLDER).join("");
  }
  return t;
}

export function applyPromoScriptTemplate(template: string, rawText: string): string {
  let t = stripLegacyStylePlaceholders(template);
  if (!t.includes(RAW_TEXT_PLACEHOLDER)) {
    throw new Error(`프롬프트에 ${RAW_TEXT_PLACEHOLDER} 가 없습니다.`);
  }
  t = t.split(RAW_TEXT_PLACEHOLDER).join(rawText);
  return t;
}

export function validatePromoScriptTemplate(template: string): string | null {
  const trimmed = template.trim();
  if (!trimmed) return "프롬프트 내용이 비어 있습니다.";
  if (!trimmed.includes(RAW_TEXT_PLACEHOLDER)) {
    return `프롬프트에 ${RAW_TEXT_PLACEHOLDER}를 포함해 주세요.`;
  }
  return null;
}
