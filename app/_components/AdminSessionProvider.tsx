"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchAdminSession, getCurrentAdmin, type AdminSession } from "@/lib/adminAuth";

type AdminSessionContextValue = {
  session: AdminSession | null;
  /** 서버와 동기화 중 */
  refreshing: boolean;
  refresh: () => Promise<AdminSession | null>;
};

const AdminSessionContext = createContext<AdminSessionContextValue | null>(null);

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<AdminSession | null>(() =>
    typeof window !== "undefined" ? getCurrentAdmin() : null
  );
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (): Promise<AdminSession | null> => {
    setRefreshing(true);
    try {
      const s = await fetchAdminSession();
      setSession(s);
      if (!s) {
        router.replace("/admin/login");
      }
      return s;
    } finally {
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    const cached = getCurrentAdmin();
    if (cached?.username) {
      setSession(cached);
    }
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      session,
      refreshing,
      refresh,
    }),
    [session, refreshing, refresh]
  );

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession(): AdminSessionContextValue {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) {
    throw new Error("useAdminSession은 AdminSessionProvider 안에서만 사용할 수 있습니다.");
  }
  return ctx;
}
