import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, getAdminSessionSecret, verifyAdminSessionToken } from "@/lib/adminSession.server";

export async function requireAdminApi(): Promise<{ username: string } | NextResponse> {
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
