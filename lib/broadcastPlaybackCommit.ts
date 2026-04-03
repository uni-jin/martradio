/** 음성 생성이 반영된 상태(방송 문구 + 2. 음악 + 3. 음성 생성) 스냅샷. 4. 재생 표시 여부 판별에 사용. */
export type BroadcastPlaybackCommitSnapshot = {
  content: string;
  bgmVolume: number;
  bgmUrlTrimmed: string;
  musicMode: "background" | "interval";
  bgmPlayRange: "full" | "segment";
  bgmStartMin: string;
  bgmStartSec: string;
  bgmEndMin: string;
  bgmEndSec: string;
  ttsGooglePresetId: string;
  ttsSpeed: number;
  ttsBreakSeconds: number;
};

export function buildBroadcastPlaybackCommitSnapshot(params: {
  content: string;
  bgmVolume: number;
  bgmUrl: string;
  musicMode: "background" | "interval";
  bgmPlayRange: "full" | "segment";
  bgmStartMin: string;
  bgmStartSec: string;
  bgmEndMin: string;
  bgmEndSec: string;
  ttsGooglePresetId: string;
  ttsSpeed: number;
  ttsBreakSeconds: number;
}): BroadcastPlaybackCommitSnapshot {
  return {
    content: params.content,
    bgmVolume: params.bgmVolume,
    bgmUrlTrimmed: params.bgmUrl.trim(),
    musicMode: params.musicMode,
    bgmPlayRange: params.bgmPlayRange,
    bgmStartMin: params.bgmStartMin,
    bgmStartSec: params.bgmStartSec,
    bgmEndMin: params.bgmEndMin,
    bgmEndSec: params.bgmEndSec,
    ttsGooglePresetId: params.ttsGooglePresetId,
    ttsSpeed: params.ttsSpeed,
    ttsBreakSeconds: params.ttsBreakSeconds,
  };
}

export function broadcastPlaybackCommitMatches(
  committed: BroadcastPlaybackCommitSnapshot | null,
  current: BroadcastPlaybackCommitSnapshot
): boolean {
  if (committed === null) return false;
  return (
    committed.content === current.content &&
    committed.bgmVolume === current.bgmVolume &&
    committed.bgmUrlTrimmed === current.bgmUrlTrimmed &&
    committed.musicMode === current.musicMode &&
    committed.bgmPlayRange === current.bgmPlayRange &&
    committed.bgmStartMin === current.bgmStartMin &&
    committed.bgmStartSec === current.bgmStartSec &&
    committed.bgmEndMin === current.bgmEndMin &&
    committed.bgmEndSec === current.bgmEndSec &&
    committed.ttsGooglePresetId === current.ttsGooglePresetId &&
    committed.ttsSpeed === current.ttsSpeed &&
    committed.ttsBreakSeconds === current.ttsBreakSeconds
  );
}
