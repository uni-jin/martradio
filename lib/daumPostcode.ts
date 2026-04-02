/** Daum 우편번호 스크립트 — 도로명/지번 검색 (https://postcode.map.daum.net/guide) */

export type DaumPostcodeData = {
  zonecode: string;
  roadAddress: string;
  jibunAddress: string;
  buildingName?: string;
  apartment?: string;
};

type DaumWindow = Window & {
  daum?: {
    Postcode: new (options: { oncomplete: (data: DaumPostcodeData) => void; width?: string }) => {
      open: () => void;
    };
  };
};

export function loadDaumPostcodeScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));

  const w = window as DaumWindow;
  if (w.daum?.Postcode) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("주소 스크립트 로드 실패")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("주소 스크립트를 불러오지 못했습니다."));
    document.body.appendChild(script);
  });
}

/** 우편번호 검색 팝업. 완료 시 `oncomplete`에 도로명·지번 등이 전달됩니다. */
export async function openDaumPostcode(
  onComplete: (data: DaumPostcodeData) => void
): Promise<void> {
  await loadDaumPostcodeScript();
  const w = window as DaumWindow;
  const Postcode = w.daum?.Postcode;
  if (!Postcode) {
    throw new Error("주소 검색을 초기화하지 못했습니다.");
  }
  new Postcode({
    oncomplete: onComplete,
  }).open();
}
