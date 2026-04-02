import { describe, expect, it } from "vitest";
import { checkRateLimit, pruneRateLimitStore, type RateBucket } from "./rateLimit.shared";

describe("checkRateLimit", () => {
  it("allows up to max within window", () => {
    const store = new Map<string, RateBucket>();
    const now = 1_000_000;
    expect(checkRateLimit(store, "a", now, 60_000, 3)).toEqual({ ok: true, remaining: 2 });
    expect(checkRateLimit(store, "a", now + 1000, 60_000, 3)).toEqual({ ok: true, remaining: 1 });
    expect(checkRateLimit(store, "a", now + 2000, 60_000, 3)).toEqual({ ok: true, remaining: 0 });
    const blocked = checkRateLimit(store, "a", now + 3000, 60_000, 3);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it("prune removes stale keys", () => {
    const store = new Map<string, RateBucket>();
    store.set("old", { count: 1, resetAt: 100 });
    pruneRateLimitStore(store, 500_000, 10_000);
    expect(store.has("old")).toBe(false);
  });
});
