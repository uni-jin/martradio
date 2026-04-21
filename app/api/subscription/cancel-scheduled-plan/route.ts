import { NextRequest, NextResponse } from "next/server";
import { cancelScheduledPlanChange } from "@/lib/subscriptionServerStore";
import { isValidPublicUserId } from "@/lib/validation.shared";

export async function POST(request: NextRequest) {
  let body: { userId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  if (typeof body.userId !== "string" || !body.userId.trim()) {
    return NextResponse.json({ error: "userId 값이 필요합니다." }, { status: 400 });
  }
  const uid = body.userId.trim();
  if (!isValidPublicUserId(uid)) {
    return NextResponse.json({ error: "userId 형식이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const subscription = await cancelScheduledPlanChange(uid);
    return NextResponse.json({ ok: true, userId: uid, subscription });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "예약 취소에 실패했습니다.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
