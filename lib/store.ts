"use client";

import type { Session, SessionWithItems, BroadcastItem } from "./types";
let sessionsCache: SessionWithItems[] = [];
let loading = false;
let loaded = false;

function notifySessionsUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("mart-sessions-updated"));
}

async function refreshFromServer() {
  if (loading) return;
  loading = true;
  try {
    const res = await fetch("/api/user/sessions", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json().catch(() => ({}))) as { sessions?: SessionWithItems[] };
    sessionsCache = data.sessions ?? [];
    loaded = true;
    notifySessionsUpdated();
  } finally {
    loading = false;
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
