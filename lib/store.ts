"use client";

import type { Session, SessionWithItems, BroadcastItem } from "./types";

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
}

export function deleteSession(id: string) {
  const list = loadSessions().filter((s) => s.id !== id);
  saveSessions(list);
}
