import { NextRequest, NextResponse } from "next/server";
import { setCancelRequested } from "@/lib/subscriptionServerStore";

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

  const subscription = setCancelRequested(body.userId.trim(), body.cancelRequested);
  return NextResponse.json({
    ok: true,
    userId: body.userId.trim(),
    cancelRequested: body.cancelRequested,
    updatedAt: subscription.updatedAt,
    subscription,
  });
}

