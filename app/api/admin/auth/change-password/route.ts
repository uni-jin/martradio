import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/requireAdminApi.server";
import { changeReferrerPassword } from "@/lib/referrerStore.server";

export async function POST(request: NextRequest) {
  const admin = await requireAdminApi();
  if (admin instanceof NextResponse) return admin;
  if (admin.role !== "referrer_admin" || !admin.referrerId) {
    return NextResponse.json({ error: "이 기능은 추천인 관리자만 사용할 수 있습니다." }, { status: 403 });
  }

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "현재 비밀번호와 새 비밀번호를 입력하세요." }, { status: 400 });
  }

  const res = await changeReferrerPassword({
    referrerId: admin.referrerId,
    loginId: admin.username,
    currentPassword,
    newPassword,
  });
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
