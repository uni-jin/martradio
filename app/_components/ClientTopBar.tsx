"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentUser, getPlanLabel, logout } from "@/lib/auth";

export default function ClientTopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [planText, setPlanText] = useState<string>("");

  useEffect(() => {
    const syncFromStorage = () => {
      const user = getCurrentUser();
      setUserEmail(user?.email ?? null);
      setPlanText(getPlanLabel(user?.planId, user?.isUnlimited));
    };

    syncFromStorage();

    const handler = () => {
      syncFromStorage();
    };

    window.addEventListener("mart-plan-updated", handler as EventListener);

    return () => {
      window.removeEventListener("mart-plan-updated", handler as EventListener);
    };
  }, [pathname]);

  if (!userEmail) return null;

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const handleGoPricing = () => {
    router.push("/pricing");
  };

  return (
    <div className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-stone-200 bg-white/90 px-4 py-2 text-xs text-stone-600 backdrop-blur sm:px-6">
      <div className="flex items-center gap-2">
        <span className="hidden text-[11px] text-stone-500 sm:inline">
          현재 플랜: <span className="font-medium text-stone-800">{planText}</span>
        </span>
        <button
          type="button"
          onClick={handleGoPricing}
          className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-100"
        >
          플랜 구독 / 변경
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="mr-1 truncate max-w-[120px] text-[11px] sm:max-w-xs sm:text-xs">
          로그인: <span className="font-medium text-stone-800">{userEmail}</span>
        </span>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-full border border-stone-300 px-3 py-1 text-[11px] font-medium text-stone-700 hover:border-amber-400 hover:text-amber-700"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}

