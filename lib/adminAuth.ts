"use client";

export type AdminSession = {
  username: string;
  role: "admin" | "referrer_admin";
  referrerId?: string | null;
  mustChangePassword?: boolean;
  allowedHrefs?: string[] | null;
};

const ADMIN_CLIENT_CACHE_KEY = "mart-radio-admin-session";
const ADMIN_ME_CACHE_TTL_MS = 15000;
let adminMeInFlight: Promise<AdminSession | null> | null = null;
let adminMeFetchedAt = 0;

function clearLegacyLocalStorage(): void {
  try {
    window.localStorage.removeItem("mart-radio-admin-session");
  } catch {
    /* ignore */
  }
}

function parseMePayload(data: Record<string, unknown>): AdminSession {
  const username = typeof data.username === "string" ? data.username : "";
  const role = data.role === "referrer_admin" ? "referrer_admin" : "admin";
  const referrerId =
    typeof data.referrerId === "string" && data.referrerId.trim() ? data.referrerId.trim() : null;
  const mustChangePassword = data.mustChangePassword === true;
  let allowedHrefs: string[] | null | undefined;
  if (Array.isArray(data.allowedHrefs)) {
    allowedHrefs = data.allowedHrefs.filter((x): x is string => typeof x === "string");
  } else if (data.allowedHrefs === null) {
    allowedHrefs = null;
  } else {
    allowedHrefs = undefined;
  }
  return {
    username,
    role,
    referrerId,
    mustChangePassword,
    allowedHrefs,
  };
}

export async function loginAdmin(username: string, password: string): Promise<AdminSession> {
  clearLegacyLocalStorage();
  const res = await fetch("/api/admin/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username: username.trim(), password }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof data.error === "string" ? data.error : "로그인에 실패했습니다.";
    throw new Error(msg);
  }
  const u = typeof data.username === "string" ? data.username : "";
  if (!u) {
    throw new Error("로그인 응답이 올바르지 않습니다.");
  }
  const session = parseMePayload(data);
  try {
    window.sessionStorage.setItem(ADMIN_CLIENT_CACHE_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
  adminMeFetchedAt = Date.now();
  return session;
}

/** httpOnly 세션과 동기화된 표시용 캐시. 실제 권한은 서버 쿠키로만 검증됩니다. */
export function getCurrentAdmin(): AdminSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ADMIN_CLIENT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parseMePayload(parsed);
  } catch {
    return null;
  }
}

export async function fetchAdminSession(): Promise<AdminSession | null> {
  const cached = getCurrentAdmin();
  if (cached && Date.now() - adminMeFetchedAt < ADMIN_ME_CACHE_TTL_MS) {
    return cached;
  }
  if (adminMeInFlight) {
    return adminMeInFlight;
  }
  adminMeInFlight = (async () => {
    const res = await fetch("/api/admin/auth/me", { credentials: "include", cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const u = typeof data.username === "string" ? data.username : "";
    if (!u) return null;
    const session = parseMePayload(data);
    try {
      window.sessionStorage.setItem(ADMIN_CLIENT_CACHE_KEY, JSON.stringify(session));
    } catch {
      /* ignore */
    }
    adminMeFetchedAt = Date.now();
    return session;
  })();
  try {
    return await adminMeInFlight;
  } finally {
    adminMeInFlight = null;
  }
}

export async function logoutAdmin(): Promise<void> {
  try {
    await fetch("/api/admin/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    /* ignore */
  }
  clearLegacyLocalStorage();
  try {
    window.sessionStorage.removeItem(ADMIN_CLIENT_CACHE_KEY);
  } catch {
    /* ignore */
  }
  adminMeFetchedAt = 0;
  adminMeInFlight = null;
}
