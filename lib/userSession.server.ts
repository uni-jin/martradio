import crypto from "crypto";
import { cookies } from "next/headers";

const USER_SESSION_COOKIE = "mart-radio-user-session";

function getSessionSecret(): string {
  return process.env.USER_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET || "dev-user-secret";
}

function sign(value: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(value).digest("hex");
}

function encodePayload(payload: { userId: string; issuedAt: number }): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = sign(body);
  return `${body}.${sig}`;
}

function decodePayload(token: string): { userId: string; issuedAt: number } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  if (expected !== sig) return null;
  try {
    const json = Buffer.from(body, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { userId?: unknown; issuedAt?: unknown };
    if (typeof parsed.userId !== "string" || typeof parsed.issuedAt !== "number") return null;
    return { userId: parsed.userId, issuedAt: parsed.issuedAt };
  } catch {
    return null;
  }
}

export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(USER_SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = decodePayload(token);
  return payload?.userId ?? null;
}

export async function setSessionCookie(userId: string): Promise<void> {
  const cookieStore = await cookies();
  const token = encodePayload({ userId, issuedAt: Date.now() });
  cookieStore.set(USER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(USER_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

