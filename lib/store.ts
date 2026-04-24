"use client";

import type { Session, SessionWithItems, BroadcastItem } from "./types";

let sessionsCache: SessionWithItems[] = [];
let loading = false;
let loaded = false;
/** `GET /api/user/sessions`에 해당하는 `owner_user_id`. 로그아웃·불일치 시 null */
let cacheOwnerUserId: string | null = null;
let loadGeneration = 0;

function notifySessionsUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("mart-sessions-updated"));
}

/** 로그인/로그아웃·세션 갱신으로 사용자가 바뀌었을 때 캐시를 비우고 다시 불러오게 한다. */
export function resetBroadcastSessionsCache() {
  loadGeneration += 1;
  sessionsCache = [];
  loaded = false;
  cacheOwnerUserId = null;
  loading = false;
  notifySessionsUpdated();
}

async function refreshFromServer() {
  const myGen = loadGeneration;
  if (loading) return;
  loading = true;
  try {
    const res = await fetch("/api/user/sessions", { cache: "no-store" });
    if (myGen !== loadGeneration) return;
    if (!res.ok) {
      sessionsCache = [];
      cacheOwnerUserId = null;
      loaded = true;
      notifySessionsUpdated();
      return;
    }
    const data = (await res.json().catch(() => ({}))) as {
      sessions?: SessionWithItems[];
      userId?: string;
    };
    if (myGen !== loadGeneration) return;
    const uid = typeof data.userId === "string" && data.userId ? data.userId : null;
    sessionsCache = data.sessions ?? [];
    cacheOwnerUserId = uid;
    loaded = true;
    notifySessionsUpdated();
  } finally {
    if (myGen === loadGeneration) {
      loading = false;
    }
  }
}

export function getAllSessions(): SessionWithItems[] {
  if (!loaded) void refreshFromServer();
  return sessionsCache;
}

export function getSession(id: string): SessionWithItems | null {
  if (!loaded) void refreshFromServer();
  return sessionsCache.find((s) => s.id === id) ?? null;
}

export function saveSession(
  session: Session,
  items: BroadcastItem[],
  eventItems: BroadcastItem[] = []
) {
  const withItems: SessionWithItems = { ...session, items, eventItems };
  const idx = sessionsCache.findIndex((s) => s.id === session.id);
  if (idx >= 0) sessionsCache[idx] = withItems;
  else sessionsCache.unshift(withItems);
  sessionsCache.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  notifySessionsUpdated();
  void fetch("/api/user/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session: withItems, items, eventItems }),
  });
}

export function deleteSession(id: string) {
  sessionsCache = sessionsCache.filter((s) => s.id !== id);
  notifySessionsUpdated();
  void fetch("/api/user/sessions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: id }),
  });
}
