"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AdminSessionProvider } from "@/app/_components/AdminSessionProvider";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
    return <>{children}</>;
  }
  return <AdminSessionProvider>{children}</AdminSessionProvider>;
}
