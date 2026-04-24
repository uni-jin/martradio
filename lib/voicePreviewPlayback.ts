/**
 * 미리듣기: 기본은 같은 출처 `/api/public/voice-preview`로 프록시해 Storage CORS 이슈를 피한다.
 * `voiceId` 없이 data: URL만 넘기는 경우에만 클라이언트에서 직접 로드한다.
 */

export function isAudioAutoplayBlockedError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "NotAllowedError";
}

async function loadBlobFromPreviewSource(
  source: string,
  options?: { voiceId?: string }
): Promise<Blob> {
  const voiceId = options?.voiceId?.trim();
  if (voiceId) {
    const res = await fetch(`/api/public/voice-preview?voiceId=${encodeURIComponent(voiceId)}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || `미리듣기 파일을 불러오지 못했습니다. (${res.status})`);
    }
    return res.blob();
  }
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
  objectUrlRef: { current: string | null },
  options?: { voiceId?: string }
): Promise<PlayPreviewFromSourceResult> {
  el.pause();
  if (objectUrlRef.current) {
    URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }
  try {
    const blob = await loadBlobFromPreviewSource(source, options);
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
