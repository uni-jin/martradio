"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

const MENUS: MenuGroup[] = [
  {
    title: "대시보드",
    items: [{ href: "/admin", label: "대시보드" }],
  },
  {
    title: "회원관리",
    items: [
      { href: "/admin/users", label: "회원관리" },
      { href: "/admin/referrers", label: "추천인관리" },
    ],
  },
  {
    title: "콘텐츠 관리",
    items: [
      { href: "/admin/templates", label: "방송 템플릿 관리" },
      { href: "/admin/voices", label: "음성 템플릿 관리" },
    ],
  },
  {
    title: "결제내역/통계",
    items: [
      { href: "/admin/payments", label: "결제 상세 내역" },
      { href: "/admin/referrer-payments", label: "추천인 결제 통계" },
    ],
    hiddenPathPrefixes: ["/admin/products", "/admin/webhooks/toss"],
  },
];

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
  const activeGroup = MENUS.find((group) => groupMatchesPathname(group, pathname));

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <div className="w-full border-t border-stone-200">
        <div className="grid w-full grid-cols-2 border-b border-stone-200 bg-white text-sm font-medium text-stone-700 sm:grid-cols-4">
          {MENUS.map((group) => {
            const isActive = activeGroup?.title === group.title;
            return (
              <Link
                key={group.title}
                href={group.items[0].href}
                onClick={(e) => handleSameHrefReload(e, pathname, group.items[0].href)}
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
              {(activeGroup?.items ?? MENUS[0].items).map((item) => {
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

