"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useAdminSession } from "@/app/_components/AdminSessionProvider";
import {
  ADMIN_MENU_GROUPS,
  ADMIN_PERMISSION_MANAGEMENT_HREF,
  REFERRER_ADMIN_PASSWORD_HREF,
} from "@/lib/adminMenuCatalog";
import { adminMenuHrefAllowed } from "@/lib/adminPathAccess.client";
import type { AdminSession } from "@/lib/adminAuth";

type MenuGroup = {
  title: string;
  items: { href: string; label: string }[];
  /** 메뉴에 없어도 이 그룹으로 활성 표시할 경로 접두사 */
  hiddenPathPrefixes?: string[];
};

function normalizePath(p: string): string {
  const x = p.replace(/\/$/, "");
  return x || "/";
}

/** `/admin`은 정확히 일치할 때만(하위 경로는 제외) */
function pathMatchesMenu(pathname: string, itemHref: string): boolean {
  const p = normalizePath(pathname);
  const h = normalizePath(itemHref);
  if (h === "/admin") return p === "/admin";
  return p === h || p.startsWith(`${h}/`);
}

function dedupeItems(items: { href: string; label: string }[]): { href: string; label: string }[] {
  const seen = new Set<string>();
  const out: { href: string; label: string }[] = [];
  for (const it of items) {
    const k = normalizePath(it.href);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

function buildMenuGroups(session: AdminSession): MenuGroup[] {
  const base: MenuGroup[] = ADMIN_MENU_GROUPS.map((g) => ({
    title: g.groupTitle,
    items: g.items.map((it) => ({ href: it.href, label: it.label })),
  }));

  if (session.role === "super") {
    return base.map((g) => {
      if (g.title !== "설정") {
        return { ...g, items: g.items.filter((i) => i.href !== REFERRER_ADMIN_PASSWORD_HREF) };
      }
      return {
        ...g,
        items: dedupeItems([
          ...g.items.filter((i) => i.href !== REFERRER_ADMIN_PASSWORD_HREF),
          { href: ADMIN_PERMISSION_MANAGEMENT_HREF, label: "관리자 권한 관리" },
        ]),
      };
    });
  }

  if (session.role === "admin") {
    const allowed = session.allowedHrefs ?? [];
    const out: MenuGroup[] = [];
    for (const g of base) {
      let items = g.items.filter((it) => adminMenuHrefAllowed(it.href, allowed));
      if (g.title === "설정" && adminMenuHrefAllowed(ADMIN_PERMISSION_MANAGEMENT_HREF, allowed)) {
        items = dedupeItems([...items, { href: ADMIN_PERMISSION_MANAGEMENT_HREF, label: "관리자 권한 관리" }]);
      }
      if (items.length === 0) continue;
      out.push({ ...g, items });
    }
    return out;
  }

  const allowed = session.allowedHrefs ?? [];
  const out: MenuGroup[] = [];
  for (const g of base) {
    let items = g.items.filter((it) => adminMenuHrefAllowed(it.href, allowed));
    if (g.title === "설정") {
      items = dedupeItems([
        ...items,
        { href: REFERRER_ADMIN_PASSWORD_HREF, label: "비밀번호 변경" },
      ]);
    }
    if (items.length === 0) continue;
    out.push({ ...g, items });
  }
  return out;
}

/** 동일 URL로의 이동처럼 보일 때만 새로고침(하위 경로는 일반 링크 이동) */
function handleSameHrefReload(
  e: React.MouseEvent<HTMLAnchorElement>,
  pathname: string,
  href: string
): void {
  if (normalizePath(pathname) === normalizePath(href)) {
    e.preventDefault();
    window.location.reload();
  }
}

function groupMatchesPathname(group: MenuGroup, pathname: string): boolean {
  if (group.items.some((item) => pathMatchesMenu(pathname, item.href))) return true;
  const p = normalizePath(pathname);
  for (const prefix of group.hiddenPathPrefixes ?? []) {
    const h = normalizePath(prefix);
    if (p === h || p.startsWith(`${h}/`)) return true;
  }
  return false;
}

export default function AdminShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const { session, refreshing } = useAdminSession();

  const menus = useMemo(() => (session ? buildMenuGroups(session) : []), [session]);
  const activeGroup = menus.find((group) => groupMatchesPathname(group, pathname));

  if (!session) {
    if (refreshing) {
      return (
        <main className="min-h-full bg-[var(--bg)]">
          <div className="flex min-h-[40vh] items-center justify-center text-stone-500">메뉴를 불러오는 중…</div>
        </main>
      );
    }
    return null;
  }

  return (
    <main className="min-h-full bg-[var(--bg)]">
      <div className="w-full border-t border-stone-200">
        <div className="grid w-full grid-cols-2 border-b border-stone-200 bg-white text-sm font-medium text-stone-700 sm:grid-cols-3 lg:grid-cols-5">
          {menus.map((group) => {
            const isActive = activeGroup?.title === group.title;
            return (
              <Link
                key={group.title}
                href={group.items[0]?.href ?? "/admin"}
                onClick={(e) => handleSameHrefReload(e, pathname, group.items[0]?.href ?? "/admin")}
                className={`flex min-h-12 items-center justify-center px-3 py-3 text-sm sm:text-base ${
                  isActive
                    ? "bg-[#28579d] font-semibold text-white"
                    : "bg-white text-stone-600 hover:bg-stone-50"
                }`}
              >
                {group.title}
              </Link>
            );
          })}
        </div>

        <div className="grid w-full min-w-0 bg-white md:grid-cols-[220px_1fr]">
          <aside className="border-b border-r-0 border-stone-200 p-4 md:border-b-0 md:border-r">
            <nav className="space-y-1">
              {(activeGroup?.items ?? menus[0]?.items ?? []).map((item) => {
                const active = pathMatchesMenu(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={(e) => handleSameHrefReload(e, pathname, item.href)}
                    className={`block rounded-lg px-3 py-2 text-sm ${
                      active
                        ? "bg-slate-100 font-medium text-slate-800"
                        : "text-stone-700 hover:bg-stone-50"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>

          <section className="min-w-0 p-4 sm:p-6">
            {title.trim() ? <h1 className="mb-4 text-xl font-bold text-stone-800">{title}</h1> : null}
            {children}
          </section>
        </div>
      </div>
    </main>
  );
}
