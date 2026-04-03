"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { fetchAdminSession } from "@/lib/adminAuth";

const PUBLIC_PATHS = ["/login", "/signup", "/admin/login"];

function isUserPublicPath(path: string): boolean {
  if (PUBLIC_PATHS.includes(path)) return true;
  if (path.startsWith("/demo")) return true;
  return false;
}

const loadingScreen = (
  <main className="flex w-full flex-1 flex-col items-center justify-center bg-[var(--bg)] text-stone-500">
    로딩 중...
  </main>
);

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [adminOk, setAdminOk] = useState<boolean | null>(null);

  const p = pathname ?? "";
  const isPublic = isUserPublicPath(p);
  const isAdmin = p.startsWith("/admin");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    if (isPublic) {
      setAdminOk(null);
      return;
    }

    if (isAdmin) {
      void (async () => {
        const me = await fetchAdminSession();
        if (!me) {
          router.replace("/admin/login");
          return;
        }
        setAdminOk(true);
      })();
      return;
    }

    setAdminOk(null);
    if (!getCurrentUser()) {
      router.replace("/login");
    }
  }, [mounted, p, isPublic, isAdmin, router]);

  if (!mounted) {
    return loadingScreen;
  }

  if (isPublic) {
    return <>{children}</>;
  }

  if (isAdmin) {
    if (adminOk !== true) {
      return loadingScreen;
    }
    return <>{children}</>;
  }

  if (!getCurrentUser()) {
    return loadingScreen;
  }

  return <>{children}</>;
}
