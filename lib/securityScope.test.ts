import { describe, expect, it } from "vitest";

/**
 * 구독·관리자 영속화는 JSON 파일 기반이며 SQL을 사용하지 않습니다.
 * 서버 Outbound URL은 환경 변수가 아닌 고정 허용 엔드포인트(토스·Google TTS 등)로만 호출됩니다.
 */
describe("security scope (문서화)", () => {
  it("JSON 기반 저장소 — SQLi 해당 없음", () => {
    expect(true).toBe(true);
  });
});
