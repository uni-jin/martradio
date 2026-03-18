export function extractYoutubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const parts = u.pathname.split("/");
      const idx = parts.indexOf("embed");
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    }
    return null;
  } catch {
    return null;
  }
}

export function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "id-" + Date.now() + "-" + Math.random().toString(36).slice(2, 11);
}

export function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const min = Math.floor(diff / 60000);
  const hour = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  if (hour < 24) return `${hour}시간 전`;
  if (day < 7) return `${day}일 전`;
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export function formatScheduled(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatScheduledRange(startIso: string | null, endIso?: string | null): string | null {
  if (!startIso) return null;
  const start = formatScheduled(startIso);
  if (!start) return null;
  if (endIso) {
    const end = formatScheduled(endIso);
    if (end) return `${start} ~ ${end}`;
  }
  return start;
}
