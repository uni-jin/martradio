import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let resolvedDataDir: string | null = null;

function computeDataDir(): string {
  const raw = process.env.MARTRADIO_DATA_DIR?.trim();
  if (raw) {
    const dir = resolve(raw);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }
  const preferred = join(process.cwd(), ".martradio-data");
  try {
    if (!existsSync(preferred)) mkdirSync(preferred, { recursive: true });
    return preferred;
  } catch {
    const fallback = join(tmpdir(), ".martradio-data");
    if (!existsSync(fallback)) mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

/**
 * 서버 런타임 JSON 등 파일 저장 루트(모듈 내 1회 결정 후 재사용).
 * - MARTRADIO_DATA_DIR: 쓰기 가능 경로(운영 볼륨 등).
 * - 미설정: `process.cwd()/.martradio-data` — 로컬·단일 노드에서 tmpdir와 달리 안정적으로 유지.
 * - cwd가 읽기 전용인 서버리스 등에서는 mkdir 실패 시 `os.tmpdir()/.martradio-data`로 폴백.
 */
export function getMartradioDataDir(): string {
  if (!resolvedDataDir) resolvedDataDir = computeDataDir();
  return resolvedDataDir;
}

export function ensureMartradioDataDir(): string {
  return getMartradioDataDir();
}
