import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminPermissions } from "@/lib/adminPermissions.server";
import {
  ADMIN_SESSION_COOKIE,
  getAdminSessionSecret,
  verifyAdminSessionToken,
  type VerifiedAdminSession,
} from "@/lib/adminSession.server";

export type { VerifiedAdminSession };

export async function requireAdminApi(): Promise<VerifiedAdminSession | NextResponse> {
  const secret = getAdminSessionSecret();
  if (!secret) {
    return NextResponse.json({ error: "서버 설정 오류(ADMIN_SESSION_SECRET)" }, { status: 500 });
  }
  const jar = await cookies();
  const token = jar.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const v = verifyAdminSessionToken(token, secret);
  if (!v) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  return v;
}

export async function requireSuperAdminApi(): Promise<{ username: string } | NextResponse> {
  const v = await requireAdminApi();
  if (v instanceof NextResponse) return v;
  if (v.role !== "super") {
    return NextResponse.json({ error: "최고 관리자 권한이 필요합니다." }, { status: 403 });
  }
  return { username: v.username };
}

export async function adminHasPathAccess(role: VerifiedAdminSession["role"], href: string): Promise<boolean> {
  if (role === "super") return true;
  if (role === "referrer_admin") return false;
  const permissions = await getAdminPermissions();
  const normalized = href.replace(/\/$/, "") || "/";
  return permissions.allowedHrefs.some((x) => {
    const menuHref = x.replace(/\/$/, "") || "/";
    if (menuHref === "/admin") return normalized === "/admin";
    return normalized === menuHref || normalized.startsWith(`${menuHref}/`);
  });
}

export async function requireAdminPathAccessApi(
  href: string
): Promise<{ username: string; role: VerifiedAdminSession["role"] } | NextResponse> {
  const v = await requireAdminApi();
  if (v instanceof NextResponse) return v;
  const ok = await adminHasPathAccess(v.role, href);
  if (!ok) {
    return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });
  }
  return { username: v.username, role: v.role };
}

export async function requireVoiceTemplateWriteApi(): Promise<{ username: string } | NextResponse> {
  const v = await requireAdminApi();
  if (v instanceof NextResponse) return v;
  if (v.role === "super") return { username: v.username };
  if (v.role !== "admin") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  const permissions = await getAdminPermissions();
  if (!permissions.canManageVoiceTemplates) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  return { username: v.username };
}
