"use client";

import { REFERRER_ADMIN_PASSWORD_HREF } from "@/lib/adminMenuCatalog";

export function normalizeAdminPath(p: string): string {
  const x = p.replace(/\/$/, "");
  return x || "/";
}

/** 메뉴 항목 href가 허용 목록에 포함되는지(정규화 후 동일 경로) */
export function adminMenuHrefAllowed(itemHref: string, allowed: string[]): boolean {
  const h = normalizeAdminPath(itemHref);
  return allowed.some((a) => normalizeAdminPath(a) === h);
}

/** 현재 경로가 추천인 관리자에게 허용된가(허용된 접두 경로 기준) */
export function adminPathAllowedForReferrer(
  pathname: string,
  allowed: string[] | null | undefined
): boolean {
  const list = allowed ?? [];
  const p = normalizeAdminPath(pathname);
  for (const raw of list) {
    const h = normalizeAdminPath(raw);
    if (h === "/admin") {
      if (p === "/admin") return true;
      continue;
    }
    if (p === h || p.startsWith(`${h}/`)) return true;
  }
  return false;
}

export function pickReferrerAdminFallbackPath(allowed: string[] | null | undefined): string {
  const a = allowed ?? [];
  if (a.some((x) => normalizeAdminPath(x) === "/admin")) return "/admin";
  const first = a.find((x) => normalizeAdminPath(x) !== normalizeAdminPath(REFERRER_ADMIN_PASSWORD_HREF));
  return first ?? REFERRER_ADMIN_PASSWORD_HREF;
}
