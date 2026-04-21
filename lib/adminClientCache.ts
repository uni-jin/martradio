"use client";

type CacheEntry = {
  data: unknown;
  expiresAt: number;
};

const responseCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();

function readCache(key: string): unknown | null {
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return hit.data;
}

function writeCache(key: string, data: unknown, cacheMs: number): void {
  responseCache.set(key, { data, expiresAt: Date.now() + cacheMs });
}

export function invalidateAdminClientCache(key?: string): void {
  if (!key) {
    responseCache.clear();
    inFlight.clear();
    return;
  }
  responseCache.delete(key);
  inFlight.delete(key);
}

export async function fetchAdminJsonCached<T>(
  url: string,
  opts?: { cacheMs?: number; force?: boolean }
): Promise<T> {
  const cacheMs = opts?.cacheMs ?? 15000;
  if (opts?.force) {
    responseCache.delete(url);
  }
  const cached = readCache(url);
  if (cached != null) return cached as T;

  const pending = inFlight.get(url);
  if (pending) return (await pending) as T;

  const req = (async () => {
    const res = await fetch(url, { credentials: "include", cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg =
        typeof data.error === "string" && data.error.trim()
          ? data.error
          : `요청 실패 (${res.status})`;
      throw new Error(msg);
    }
    writeCache(url, data, cacheMs);
    return data as T;
  })();

  inFlight.set(url, req);
  try {
    return (await req) as T;
  } finally {
    inFlight.delete(url);
  }
}
