"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getCurrentUser,
  getLastSessionErrorCode,
  refreshCurrentUser,
} from "@/lib/auth";
import { fetchPlanCatalog } from "@/lib/adminData";
import { fetchAdminSession, getCurrentAdmin } from "@/lib/adminAuth";
import {
  adminPathAllowedByMenu,
  adminPathAllowedForReferrer,
  pickReferrerAdminFallbackPath,
} from "@/lib/adminPathAccess.client";

const PUBLIC_PATHS = ["/login", "/signup", "/admin/login"];

function isUserPublicPath(path: string): boolean {
  if (PUBLIC_PATHS.includes(path)) return true;
  if (path.startsWith("/demo")) return true;
  if (path.startsWith("/legal")) return true;
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
  const [userResolved, setUserResolved] = useState(false);

  const p = pathname ?? "";
  const isPublic = isUserPublicPath(p);
  const isAdmin = p.startsWith("/admin");
  const isAdminLogin = p === "/admin/login" || p.startsWith("/admin/login/");

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || isPublic) return;
    void fetchPlanCatalog();
  }, [mounted, isPublic]);

  useLayoutEffect(() => {
    if (!mounted) return;
    if (!isAdmin || isPublic || isAdminLogin) return;
    if (getCurrentAdmin()) {
      setAdminOk(true);
    }
  }, [mounted, isAdmin, isPublic, isAdminLogin, p]);

  useEffect(() => {
    if (!mounted) return;

    if (isPublic) {
      setAdminOk(null);
      setUserResolved(true);
      return;
    }

    if (isAdmin) {
      if (isAdminLogin) {
        setAdminOk(null);
        return;
      }
      const cachedAdmin = getCurrentAdmin();
      if (cachedAdmin) {
        if (cachedAdmin.mustChangePassword && p !== "/admin/settings/password") {
          router.replace("/admin/settings/password");
          return;
        }
        if (
          cachedAdmin.role === "referrer_admin" &&
          !adminPathAllowedForReferrer(p, cachedAdmin.allowedHrefs)
        ) {
          router.replace(pickReferrerAdminFallbackPath(cachedAdmin.allowedHrefs));
          return;
        }
        if (cachedAdmin.role === "admin" && !adminPathAllowedByMenu(p, cachedAdmin.allowedHrefs)) {
          router.replace("/admin");
          return;
        }
        setAdminOk(true);
        setUserResolved(true);
        return;
      }
      void (async () => {
        const me = await fetchAdminSession();
        if (!me) {
          setAdminOk(false);
          router.replace("/admin/login");
          return;
        }
        if (me.mustChangePassword && p !== "/admin/settings/password") {
          router.replace("/admin/settings/password");
          return;
        }
        if (me.role === "referrer_admin" && !adminPathAllowedForReferrer(p, me.allowedHrefs)) {
          router.replace(pickReferrerAdminFallbackPath(me.allowedHrefs));
          return;
        }
        if (me.role === "admin" && !adminPathAllowedByMenu(p, me.allowedHrefs)) {
          router.replace("/admin");
          return;
        }
        setAdminOk(true);
        setUserResolved(true);
      })();
      return;
    }

    setAdminOk(null);
    setUserResolved(false);
    void (async () => {
      const user = await refreshCurrentUser({ force: true });
      if (!user) {
        const code = getLastSessionErrorCode();
        if (code) router.replace(`/login?reason=${encodeURIComponent(code)}`);
        else router.replace("/login");
        return;
      }
      setUserResolved(true);
    })();
  }, [mounted, p, isPublic, isAdmin, isAdminLogin, router]);

  if (!mounted) {
    return loadingScreen;
  }

  if (isPublic) {
    return <>{children}</>;
  }

  if (isAdmin) {
    if (isAdminLogin) {
      return <>{children}</>;
    }
    if (adminOk !== true) {
      return loadingScreen;
    }
    const me = getCurrentAdmin();
    if (me?.mustChangePassword && p !== "/admin/settings/password") {
      return loadingScreen;
    }
    return <>{children}</>;
  }

  if (!getCurrentUser()) {
    return loadingScreen;
  }
  if (!userResolved) {
    return loadingScreen;
  }

  return <>{children}</>;
}
