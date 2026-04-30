"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  getCurrentUser,
  getPlanLabel,
  getPricingCtaLabel,
  logout,
  refreshCurrentUser,
  type PlanId,
} from "@/lib/auth";
import { getCurrentAdmin, logoutAdmin } from "@/lib/adminAuth";
import { SELECT_CHEVRON_TAILWIND } from "@/app/_lib/selectChevron";

export default function ClientTopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [planId, setPlanId] = useState<PlanId | undefined>(undefined);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncFromStorage = async () => {
      const isAdminPath = (pathname ?? "").startsWith("/admin");
      if (isAdminPath) {
        const cached = getCurrentAdmin();
        setAdminId(cached?.username ?? null);
        setUserEmail(null);
        setPlanId(undefined);
        return;
      }
      const user = await refreshCurrentUser();
      setUserEmail(user?.email ?? null);
      setPlanId(user?.planId);
      setAdminId(null);
    };

    void syncFromStorage();

    const handler = () => {
      void syncFromStorage();
    };

    window.addEventListener("mart-plan-updated", handler as EventListener);

    return () => {
      window.removeEventListener("mart-plan-updated", handler as EventListener);
    };
  }, [pathname]);

  useEffect(() => {
    setUserMenuOpen(false);
  }, [pathname, userEmail]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenuOpen]);

  const isAdminPath = (pathname ?? "").startsWith("/admin");

  const barClass =
    "sticky top-0 z-40 flex shrink-0 min-h-[48px] items-center justify-between gap-3 border-b border-stone-200 bg-white/90 px-4 py-2 text-base text-stone-600 backdrop-blur sm:px-6";

  const BrandButton = (
    <button
      type="button"
      onClick={() => router.push("/")}
      className="shrink-0 text-left text-base font-semibold text-stone-800 hover:text-amber-700"
    >
      마트방송 시스템
    </button>
  );

  if (isAdminPath) {
    return (
      <div className={barClass}>
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="shrink-0 text-left text-base font-semibold text-stone-800 hover:text-amber-700"
          >
            마트방송 관리자
          </button>
        </div>
        {adminId ? (
          <div className="flex items-center gap-2">
            <span className="mr-1 text-base">
              로그인: <span className="font-medium text-stone-800">{adminId}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  await logoutAdmin();
                  router.push("/admin/login");
                })();
              }}
              className="rounded-full border border-stone-300 px-3 py-1.5 text-base font-medium text-stone-700 hover:border-amber-400 hover:text-amber-700"
            >
              로그아웃
            </button>
          </div>
        ) : (
          <div className="shrink-0" aria-hidden />
        )}
      </div>
    );
  }

  const handleGoPricing = () => {
    router.push("/pricing");
  };

  if (!userEmail) {
    const path = pathname ?? "";
    const hideGuestAuthButtons =
      path === "/login" || path === "/signup" || path.startsWith("/demo");

    return (
      <div className={barClass}>
        {BrandButton}
        {!hideGuestAuthButtons ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="rounded-full border border-stone-300 px-3 py-1.5 text-base font-medium text-stone-700 hover:border-amber-400 hover:text-amber-700"
            >
              로그인
            </button>
            <button
              type="button"
              onClick={() => router.push("/signup")}
              className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-base font-medium text-amber-800 hover:bg-amber-100"
            >
              회원가입
            </button>
          </div>
        ) : (
          <span className="shrink-0" aria-hidden />
        )}
      </div>
    );
  }

  const pricingCtaLabel = getPricingCtaLabel(planId);
  const planText = getPlanLabel(planId, false);

  return (
    <div className={barClass}>
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        {BrandButton}
      </div>
      <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
        <span className="hidden text-base text-stone-500 sm:inline sm:whitespace-nowrap">
          현재 구독: <span className="font-medium text-stone-800">{planText}</span>
        </span>
        <button
          type="button"
          onClick={handleGoPricing}
          className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-base font-medium text-amber-700 hover:bg-amber-100"
        >
          {pricingCtaLabel}
        </button>
        <div className="relative shrink-0" ref={userMenuRef}>
          <button
            type="button"
            id="user-menu-trigger"
            aria-label="사용자 메뉴"
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            aria-controls="user-menu-panel"
            className={`inline-flex max-w-[min(220px,48vw)] min-w-[7.25rem] cursor-pointer items-center truncate rounded-full border border-stone-300 bg-white py-1.5 pl-3 pr-10 text-left text-base font-medium text-stone-800 hover:border-amber-400 sm:max-w-[260px] ${SELECT_CHEVRON_TAILWIND}`}
            onClick={() => setUserMenuOpen((o) => !o)}
          >
            {userEmail}
          </button>
          {userMenuOpen ? (
            <div
              id="user-menu-panel"
              role="menu"
              aria-labelledby="user-menu-trigger"
              className="absolute right-0 top-[calc(100%+4px)] z-50 min-w-[11.5rem] overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full px-3 py-2.5 text-left text-base text-stone-800 hover:bg-stone-50"
                onClick={() => {
                  setUserMenuOpen(false);
                  router.push("/account");
                }}
              >
                정보 수정
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full px-3 py-2.5 text-left text-base text-stone-800 hover:bg-stone-50"
                onClick={() => {
                  setUserMenuOpen(false);
                  router.push("/subscription");
                }}
              >
                구독 관리
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full px-3 py-2.5 text-left text-base text-red-700 hover:bg-red-50"
                onClick={() => {
                  setUserMenuOpen(false);
                  void logout();
                  router.push("/login");
                }}
              >
                로그아웃
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
