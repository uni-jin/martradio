"use client";

import type { Session, SessionWithItems, BroadcastItem } from "./types";
import { getCurrentUser } from "./auth";

const STORAGE_KEY = "mart-radio-sessions";

function loadSessions(): SessionWithItems[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveSessions(sessions: SessionWithItems[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function shouldSyncToSupabase(): boolean {
  return typeof window !== "undefined" && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

async function syncSessionToSupabase(session: SessionWithItems): Promise<void> {
  if (!shouldSyncToSupabase()) return;
  const user = getCurrentUser();
  if (!user?.id) return;
  try {
    await fetch("/api/supabase/sessions/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        session,
      }),
      keepalive: true,
    });
  } catch {
    // 동기화 실패 시에도 로컬 저장은 유지한다.
  }
}

async function deleteSessionFromSupabase(sessionId: string): Promise<void> {
  if (!shouldSyncToSupabase()) return;
  const user = getCurrentUser();
  if (!user?.id) return;
  try {
    await fetch("/api/supabase/sessions/sync", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        sessionId,
      }),
      keepalive: true,
    });
  } catch {
    // 동기화 실패 시에도 로컬 삭제는 유지한다.
  }
}

export function getAllSessions(): SessionWithItems[] {
  return loadSessions();
}

export function getSession(id: string): SessionWithItems | null {
  return loadSessions().find((s) => s.id === id) ?? null;
}

export function saveSession(
  session: Session,
  items: BroadcastItem[],
  eventItems: BroadcastItem[] = []
) {
  const list = loadSessions();
  const idx = list.findIndex((s) => s.id === session.id);
  const withItems: SessionWithItems = { ...session, items, eventItems };
  if (idx >= 0) list[idx] = withItems;
  else list.unshift(withItems);
  list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  saveSessions(list);
  void syncSessionToSupabase(withItems);
}

export function deleteSession(id: string) {
  const list = loadSessions().filter((s) => s.id !== id);
  saveSessions(list);
  void deleteSessionFromSupabase(id);
}
