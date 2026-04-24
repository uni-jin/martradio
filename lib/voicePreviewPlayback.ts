/**
 * 관리자 음성 미리듣기와 동일하게: 원격/데이터 URL → Blob → createObjectURL → audio 재생.
 * `<audio src="https://...">`에 직접 넣은 뒤 바로 `play()`할 때 생기는 로딩/비교 이슈를 피한다.
 */

export function isAudioAutoplayBlockedError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "NotAllowedError";
}

async function loadBlobFromPreviewSource(source: string): Promise<Blob> {
  const trimmed = source.trim();
  if (trimmed.toLowerCase().startsWith("data:")) {
    const res = await fetch(trimmed);
    if (!res.ok) throw new Error("미리듣기 데이터를 읽지 못했습니다.");
    return res.blob();
  }
  const res = await fetch(trimmed, { mode: "cors", cache: "no-store", credentials: "omit" });
  if (!res.ok) {
    throw new Error(`미리듣기 파일을 불러오지 못했습니다. (${res.status})`);
  }
  return res.blob();
}

function waitForAudioCanPlay(el: HTMLAudioElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      resolve();
      return;
    }
    const onCanPlay = () => {
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("error", onError);
      reject(new Error("오디오를 불러오지 못했습니다."));
    };
    el.addEventListener("canplay", onCanPlay, { once: true });
    el.addEventListener("error", onError, { once: true });
  });
}

export type PlayPreviewFromSourceResult =
  | { kind: "played" }
  | { kind: "autoplay_blocked" }
  | { kind: "error"; message: string };

export async function playAudioFromPreviewSource(
  el: HTMLAudioElement,
  source: string,
  objectUrlRef: { current: string | null }
): Promise<PlayPreviewFromSourceResult> {
  el.pause();
  if (objectUrlRef.current) {
    URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }
  try {
    const blob = await loadBlobFromPreviewSource(source);
    const objectUrl = URL.createObjectURL(blob);
    objectUrlRef.current = objectUrl;
    el.src = objectUrl;
    el.currentTime = 0;
    await waitForAudioCanPlay(el);
    try {
      await el.play();
      return { kind: "played" };
    } catch (e) {
      if (isAudioAutoplayBlockedError(e)) return { kind: "autoplay_blocked" };
      return {
        kind: "error",
        message: e instanceof Error ? e.message : "미리듣기 재생에 실패했습니다.",
      };
    }
  } catch (e) {
    return {
      kind: "error",
      message: e instanceof Error ? e.message : "미리듣기를 불러오지 못했습니다.",
    };
  }
}
