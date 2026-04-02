import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "mr_admin_session";

export function getAdminSessionSecret(): string | null {
  const s = process.env.ADMIN_SESSION_SECRET?.trim();
  if (s) return s;
  if (process.env.NODE_ENV !== "production") {
    return "dev-only-admin-session-secret-min-32-chars!!";
  }
  return null;
}

export function signAdminSessionPayload(username: string, secret: string): string {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = JSON.stringify({ u: username, exp });
  const b64 = Buffer.from(payload, "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export function verifyAdminSessionToken(token: string, secret: string): { username: string } | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!b64 || !sig) return null;
  const expected = createHmac("sha256", secret).update(b64).digest("base64url");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let parsed: { u?: unknown; exp?: unknown };
  try {
    const json = Buffer.from(b64, "base64url").toString("utf8");
    parsed = JSON.parse(json) as { u?: unknown; exp?: unknown };
  } catch {
    return null;
  }
  if (typeof parsed.u !== "string" || !parsed.u.trim()) return null;
  if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp) || parsed.exp <= Date.now()) {
    return null;
  }
  return { username: parsed.u.trim() };
}
