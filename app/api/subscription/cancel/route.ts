import { NextRequest, NextResponse } from "next/server";
import { setCancelRequested } from "@/lib/subscriptionServerStore";
import { isValidPublicUserId } from "@/lib/validation.shared";

export async function POST(request: NextRequest) {
  let body: { cancelRequested?: unknown; userId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  if (typeof body.cancelRequested !== "boolean") {
    return NextResponse.json({ error: "cancelRequested(boolean) 값이 필요합니다." }, { status: 400 });
  }

  if (typeof body.userId !== "string" || !body.userId.trim()) {
    return NextResponse.json({ error: "userId 값이 필요합니다." }, { status: 400 });
  }
  const uid = body.userId.trim();
  if (!isValidPublicUserId(uid)) {
    return NextResponse.json({ error: "userId 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const subscription = await setCancelRequested(uid, body.cancelRequested);
  return NextResponse.json({
    ok: true,
    userId: uid,
    cancelRequested: body.cancelRequested,
    updatedAt: subscription.updatedAt,
    subscription,
  });
}

