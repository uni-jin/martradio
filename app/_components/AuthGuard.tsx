"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentAdmin } from "@/lib/adminAuth";

const PUBLIC_PATHS = ["/login", "/signup", "/admin/login"];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const currentPath = pathname ?? "";

    // 로그인 페이지 등은 가드 없이 통과
    if (PUBLIC_PATHS.includes(currentPath)) {
      setChecked(true);
      return;
    }

    const isAdminPath = currentPath.startsWith("/admin");
    if (isAdminPath) {
      const admin = getCurrentAdmin();
      if (!admin) {
        router.replace("/admin/login");
        return;
      }
      setChecked(true);
      return;
    }

    const user = getCurrentUser();
    if (!user) {
      router.replace("/login");
      return;
    }

    setChecked(true);
  }, [pathname, router]);

  if (!checked) {
    return (
      <main className="min-h-screen bg-[var(--bg)]">
        <div className="flex min-h-screen items-center justify-center text-stone-500">
          로딩 중...
        </div>
      </main>
    );
  }

  return <>{children}</>;
}

