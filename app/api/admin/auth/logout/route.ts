import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/adminSession.server";
import { appendSecurityAudit } from "@/lib/securityAudit.server";
import { requireAdminApi } from "@/lib/requireAdminApi.server";

export async function POST() {
  const admin = await requireAdminApi();
  if ("username" in admin) {
    appendSecurityAudit({ type: "admin_logout", username: admin.username });
  }
  const jar = await cookies();
  jar.delete(ADMIN_SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
