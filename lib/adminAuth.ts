"use client";

export type AdminSession = {
  username: string;
  role: "admin";
};

const ADMIN_STORAGE_KEY = "mart-radio-admin-session";

export function getCurrentAdmin(): AdminSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ADMIN_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AdminSession;
  } catch {
    return null;
  }
}

export async function loginAdmin(username: string, password: string): Promise<AdminSession> {
  if (username === "admin" && password === "123qwe") {
    const session: AdminSession = { username: "admin", role: "admin" };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(session));
    }
    return session;
  }
  throw new Error("관리자 아이디 또는 비밀번호가 올바르지 않습니다.");
}

export function logoutAdmin() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ADMIN_STORAGE_KEY);
}

