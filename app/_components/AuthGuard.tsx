"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { fetchAdminSession } from "@/lib/adminAuth";

const PUBLIC_PATHS = ["/login", "/signup", "/admin/login"];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const currentPath = pathname ?? "";

    if (PUBLIC_PATHS.includes(currentPath)) {
      setChecked(true);
      return;
    }

    const isAdminPath = currentPath.startsWith("/admin");
    if (isAdminPath) {
      void (async () => {
        const me = await fetchAdminSession();
        if (!me) {
          router.replace("/admin/login");
          return;
        }
        setChecked(true);
      })();
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
        <div className="flex min-h-screen items-center justify-center text-stone-500">로딩 중...</div>
      </main>
    );
  }

  return <>{children}</>;
}
