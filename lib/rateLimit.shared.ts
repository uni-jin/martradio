/** Edge/Node 공용 — IP+경로별 슬라이딩 카운터 (테스트 가능한 순수 로직). */

export type RateBucket = { count: number; resetAt: number };

export function checkRateLimit(
  store: Map<string, RateBucket>,
  key: string,
  now: number,
  windowMs: number,
  max: number
): { ok: true; remaining: number } | { ok: false; retryAfterMs: number } {
  const existing = store.get(key);
  if (!existing || now >= existing.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: max - 1 };
  }
  if (existing.count >= max) {
    return { ok: false, retryAfterMs: Math.max(0, existing.resetAt - now) };
  }
  existing.count += 1;
  return { ok: true, remaining: max - existing.count };
}

export function pruneRateLimitStore(store: Map<string, RateBucket>, now: number, olderThanMs: number): void {
  for (const [k, v] of store) {
    if (now - v.resetAt > olderThanMs) store.delete(k);
  }
}
