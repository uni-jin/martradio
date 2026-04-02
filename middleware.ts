import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit, pruneRateLimitStore, type RateBucket } from "@/lib/rateLimit.shared";

const store = new Map<string, RateBucket>();
let pruneCounter = 0;

function clientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (!path.startsWith("/api/")) {
    return NextResponse.next();
  }

  pruneCounter += 1;
  if (pruneCounter % 300 === 0) {
    pruneRateLimitStore(store, Date.now(), 180_000);
  }

  const addr = clientIp(request);
  const isWebhook = path.startsWith("/api/webhooks/");
  const isLogin = path === "/api/admin/auth/login";
  const windowMs = 60_000;
  const max = isWebhook ? 400 : isLogin ? 25 : 150;
  const bucketKey = `${addr}:${isWebhook ? "wh" : isLogin ? "login" : "api"}`;
  const now = Date.now();
  const result = checkRateLimit(store, bucketKey, now, windowMs, max);
  if (!result.ok) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))),
        },
      }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
