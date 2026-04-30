import crypto from "crypto";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

const USER_SESSION_COOKIE = "mart-radio-user-session";
const USER_SESSION_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const USER_SESSION_LAST_SEEN_WRITE_INTERVAL_MS = 60 * 1000;

type SessionTokenPayload = {
  userId: string;
  sessionId: string;
  issuedAt: number;
};

export type UserSessionFailureCode =
  | "login_required"
  | "invalid_session"
  | "session_replaced"
  | "session_expired";

export type UserSessionValidationResult =
  | { ok: true; userId: string; sessionId: string }
  | { ok: false; code: UserSessionFailureCode; message: string };

function getSessionSecret(): string {
  return process.env.USER_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET || "dev-user-secret";
}

function sign(value: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(value).digest("hex");
}

function encodePayload(payload: SessionTokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = sign(body);
  return `${body}.${sig}`;
}

function decodePayload(token: string): SessionTokenPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  if (expected !== sig) return null;
  try {
    const json = Buffer.from(body, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as {
      userId?: unknown;
      sessionId?: unknown;
      issuedAt?: unknown;
    };
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.sessionId !== "string" ||
      typeof parsed.issuedAt !== "number"
    ) {
      return null;
    }
    return { userId: parsed.userId, sessionId: parsed.sessionId, issuedAt: parsed.issuedAt };
  } catch {
    return null;
  }
}

export async function getSessionUserId(): Promise<string | null> {
  const validated = await getValidatedUserSession();
  if (!validated.ok) return null;
  return validated.userId;
}

function failure(code: UserSessionFailureCode, message: string): UserSessionValidationResult {
  return { ok: false, code, message };
}

export async function getValidatedUserSession(): Promise<UserSessionValidationResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(USER_SESSION_COOKIE)?.value;
  if (!token) return failure("login_required", "로그인이 필요합니다.");
  const payload = decodePayload(token);
  if (!payload) {
    await clearSessionCookie();
    return failure("invalid_session", "세션 정보가 올바르지 않습니다. 다시 로그인해 주세요.");
  }

  const supabase = getSupabaseServerClient();
  const found = await supabase
    .from("app_user_sessions")
    .select("user_id,last_seen_at,revoked_at,revoked_reason")
    .eq("session_id", payload.sessionId)
    .limit(1)
    .maybeSingle();
  if (found.error || !found.data) {
    await clearSessionCookie();
    return failure("invalid_session", "세션을 확인할 수 없습니다. 다시 로그인해 주세요.");
  }
  if (found.data.user_id !== payload.userId) {
    await clearSessionCookie();
    return failure("invalid_session", "세션 정보가 일치하지 않습니다. 다시 로그인해 주세요.");
  }
  if (found.data.revoked_at) {
    await clearSessionCookie();
    if (found.data.revoked_reason === "replaced_by_new_login") {
      return failure("session_replaced", "중복 로그인으로 로그아웃되었습니다. 다시 로그인해 주세요.");
    }
    return failure("invalid_session", "세션이 종료되었습니다. 다시 로그인해 주세요.");
  }
  const lastSeenAt = new Date(found.data.last_seen_at).getTime();
  if (!Number.isFinite(lastSeenAt) || Date.now() - lastSeenAt > USER_SESSION_IDLE_TIMEOUT_MS) {
    await supabase
      .from("app_user_sessions")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_reason: "idle_timeout",
      })
      .eq("session_id", payload.sessionId)
      .is("revoked_at", null);
    await clearSessionCookie();
    return failure("session_expired", "세션이 만료되었습니다. 다시 로그인해 주세요.");
  }

  if (Date.now() - lastSeenAt >= USER_SESSION_LAST_SEEN_WRITE_INTERVAL_MS) {
    await supabase
      .from("app_user_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("session_id", payload.sessionId)
      .is("revoked_at", null);
  }

  return { ok: true, userId: payload.userId, sessionId: payload.sessionId };
}

export async function setSessionCookie(userId: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const sessionId = `sess_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await supabase
    .from("app_user_sessions")
    .update({
      revoked_at: now,
      revoked_reason: "replaced_by_new_login",
      replaced_by_session_id: sessionId,
    })
    .eq("user_id", userId)
    .is("revoked_at", null);
  const inserted = await supabase.from("app_user_sessions").insert({
    session_id: sessionId,
    user_id: userId,
    created_at: now,
    last_seen_at: now,
    revoked_at: null,
    revoked_reason: null,
    replaced_by_session_id: null,
  });
  if (inserted.error) {
    const code = (inserted.error as { code?: string }).code;
    if (code !== "23505") {
      throw new Error(inserted.error.message);
    }
    const fallbackSessionId = `sess_${crypto.randomUUID()}`;
    const fallbackNow = new Date().toISOString();
    await supabase
      .from("app_user_sessions")
      .update({
        revoked_at: fallbackNow,
        revoked_reason: "replaced_by_new_login",
        replaced_by_session_id: fallbackSessionId,
      })
      .eq("user_id", userId)
      .is("revoked_at", null);
    const retry = await supabase.from("app_user_sessions").insert({
      session_id: fallbackSessionId,
      user_id: userId,
      created_at: fallbackNow,
      last_seen_at: fallbackNow,
      revoked_at: null,
      revoked_reason: null,
      replaced_by_session_id: null,
    });
    if (retry.error) throw new Error(retry.error.message);
    const retryCookieStore = await cookies();
    const retryToken = encodePayload({ userId, sessionId: fallbackSessionId, issuedAt: Date.now() });
    retryCookieStore.set(USER_SESSION_COOKIE, retryToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return;
  }

  const cookieStore = await cookies();
  const token = encodePayload({ userId, sessionId, issuedAt: Date.now() });
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

export async function revokeSessionFromCookie(
  reason: "logout" | "replaced_by_new_login" | "idle_timeout" = "logout"
): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(USER_SESSION_COOKIE)?.value;
  const payload = token ? decodePayload(token) : null;
  if (payload) {
    const supabase = getSupabaseServerClient();
    await supabase
      .from("app_user_sessions")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_reason: reason,
      })
      .eq("session_id", payload.sessionId)
      .is("revoked_at", null);
  }
  await clearSessionCookie();
}

