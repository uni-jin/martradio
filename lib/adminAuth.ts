"use client";

export type AdminSession = {
  username: string;
  role: "admin";
};

const ADMIN_CLIENT_CACHE_KEY = "mart-radio-admin-session";

function clearLegacyLocalStorage(): void {
  try {
    window.localStorage.removeItem("mart-radio-admin-session");
  } catch {
    /* ignore */
  }
}

export async function loginAdmin(username: string, password: string): Promise<AdminSession> {
  clearLegacyLocalStorage();
  const res = await fetch("/api/admin/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username: username.trim(), password }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: unknown; username?: unknown; ok?: unknown };
  if (!res.ok) {
    const msg = typeof data.error === "string" ? data.error : "로그인에 실패했습니다.";
    throw new Error(msg);
  }
  const u = typeof data.username === "string" ? data.username : "";
  if (!u) {
    throw new Error("로그인 응답이 올바르지 않습니다.");
  }
  const session: AdminSession = { username: u, role: "admin" };
  try {
    window.sessionStorage.setItem(ADMIN_CLIENT_CACHE_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
  return session;
}

/** httpOnly 세션과 동기화된 표시용 캐시. 실제 권한은 서버 쿠키로만 검증됩니다. */
export function getCurrentAdmin(): AdminSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ADMIN_CLIENT_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AdminSession;
  } catch {
    return null;
  }
}

export async function fetchAdminSession(): Promise<AdminSession | null> {
  const res = await fetch("/api/admin/auth/me", { credentials: "include", cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { username?: unknown };
  const u = typeof data.username === "string" ? data.username : "";
  if (!u) return null;
  const session: AdminSession = { username: u, role: "admin" };
  try {
    window.sessionStorage.setItem(ADMIN_CLIENT_CACHE_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
  return session;
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
}
