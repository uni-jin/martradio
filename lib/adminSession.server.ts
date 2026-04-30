import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "mr_admin_session";

export type AdminSessionRole = "super" | "admin" | "referrer_admin";

export type VerifiedAdminSession = {
  username: string;
  role: AdminSessionRole;
  referrerId: string | null;
};

export function getAdminSessionSecret(): string | null {
  const s = process.env.ADMIN_SESSION_SECRET?.trim();
  if (s) return s;
  if (process.env.NODE_ENV !== "production") {
    return "dev-only-admin-session-secret-min-32-chars!!";
  }
  return null;
}

type SessionPayload = {
  u: string;
  exp: number;
  r?: AdminSessionRole;
  rid?: string;
};

export function signAdminSessionPayload(
  params: { username: string; role: AdminSessionRole; referrerId: string | null },
  secret: string
): string {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload: SessionPayload = {
    u: params.username,
    exp,
    r: params.role,
    rid: params.referrerId ?? "",
  };
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export function verifyAdminSessionToken(token: string, secret: string): VerifiedAdminSession | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!b64 || !sig) return null;
  const expected = createHmac("sha256", secret).update(b64).digest("base64url");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let parsed: SessionPayload;
  try {
    const json = Buffer.from(b64, "base64url").toString("utf8");
    parsed = JSON.parse(json) as SessionPayload;
  } catch {
    return null;
  }
  if (typeof parsed.u !== "string" || !parsed.u.trim()) return null;
  if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp) || parsed.exp <= Date.now()) {
    return null;
  }
  const role: AdminSessionRole =
    parsed.r === "super" || parsed.r === "admin" || parsed.r === "referrer_admin" ? parsed.r : "admin";
  const referrerId =
    role === "referrer_admin" && typeof parsed.rid === "string" && parsed.rid.trim() ? parsed.rid.trim() : null;
  return { username: parsed.u.trim(), role, referrerId };
}
