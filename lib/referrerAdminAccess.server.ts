import { REFERRER_ADMIN_PASSWORD_HREF } from "@/lib/adminMenuCatalog";
import { getAllowedHrefsForReferrerAdmins } from "@/lib/referrerStore.server";
import type { VerifiedAdminSession } from "@/lib/adminSession.server";

export async function getEffectiveAllowedHrefsForReferrerSession(): Promise<string[]> {
  const base = await getAllowedHrefsForReferrerAdmins();
  return [...new Set([...base, REFERRER_ADMIN_PASSWORD_HREF])];
}

export async function referrerSessionCanAccessHref(
  session: VerifiedAdminSession,
  href: string
): Promise<boolean> {
  if (session.role === "admin") return true;
  const normalized = href.replace(/\/$/, "") || "/";
  const allowed = await getEffectiveAllowedHrefsForReferrerSession();
  return allowed.some((h) => {
    const x = h.replace(/\/$/, "") || "/";
    if (x === "/admin") return normalized === "/admin";
    return normalized === x || normalized.startsWith(`${x}/`);
  });
}
