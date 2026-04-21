import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSuperAdminUsernameNormalized, verifyAdminCredentials } from "@/lib/adminCredentials.server";
import { ADMIN_SESSION_COOKIE, getAdminSessionSecret, signAdminSessionPayload } from "@/lib/adminSession.server";
import { appendSecurityAudit } from "@/lib/securityAudit.server";
import { verifyReferrerCredentials } from "@/lib/referrerStore.server";

function clientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(request: NextRequest) {
  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password) {
    return NextResponse.json({ error: "아이디와 비밀번호를 입력하세요." }, { status: 400 });
  }

  const secret = getAdminSessionSecret();
  if (!secret) {
    return NextResponse.json({ error: "서버 설정 오류(ADMIN_SESSION_SECRET)" }, { status: 500 });
  }

  const ip = clientIp(request);

  const superOk = verifyAdminCredentials(username, password);
  if (superOk) {
    const u = getSuperAdminUsernameNormalized();
    const token = signAdminSessionPayload({ username: u, role: "admin", referrerId: null }, secret);
    const jar = await cookies();
    jar.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    await appendSecurityAudit({ type: "admin_login_ok", username: u, ip });
    return NextResponse.json({
      ok: true,
      username: u,
      role: "admin" as const,
      mustChangePassword: false,
      allowedHrefs: null,
    });
  }

  const ref = await verifyReferrerCredentials(username, password);
  if (ref) {
    const token = signAdminSessionPayload(
      { username: ref.loginId, role: "referrer_admin", referrerId: ref.id },
      secret
    );
    const jar = await cookies();
    jar.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    await appendSecurityAudit({ type: "admin_login_ok", username: ref.loginId, ip });
    return NextResponse.json({
      ok: true,
      username: ref.loginId,
      role: "referrer_admin" as const,
      mustChangePassword: ref.usesDefaultPassword,
      allowedHrefs: null,
    });
  }

  await appendSecurityAudit({
    type: "admin_login_failed",
    username: username.trim(),
    ip,
  });
  return NextResponse.json({ error: "관리자 아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
}
