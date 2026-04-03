/**
 * enablejsapi=1 이 붙은 YouTube embed iframe에 IFrame API와 동일한 postMessage 명령을 보냅니다.
 * @see https://developers.google.com/youtube/iframe_api_reference
 */
export function setYoutubeEmbedIframeVolume(iframe: HTMLIFrameElement | null, volume0to100: number): void {
  if (!iframe?.contentWindow) return;
  const v = Math.max(0, Math.min(100, Math.round(volume0to100)));
  const payload = JSON.stringify({
    event: "command",
    func: "setVolume",
    args: [v],
  });
  try {
    iframe.contentWindow.postMessage(payload, "https://www.youtube.com");
  } catch {
    try {
      iframe.contentWindow.postMessage(payload, "*");
    } catch {
      // ignore
    }
  }
}
