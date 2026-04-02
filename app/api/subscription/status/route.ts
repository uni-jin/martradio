import { NextRequest, NextResponse } from "next/server";
import {
  getSubscriptionBillingMethod,
  getSubscriptionStatusByUser,
} from "@/lib/subscriptionServerStore";
import { isValidPublicUserId } from "@/lib/validation.shared";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });
  }
  const trimmed = userId.trim();
  if (!isValidPublicUserId(trimmed)) {
    return NextResponse.json({ error: "userId 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const subscription = getSubscriptionStatusByUser(trimmed);
  const hasBillingMethod = getSubscriptionBillingMethod(trimmed) !== null;
  return NextResponse.json({
    ok: true,
    userId: trimmed,
    subscription,
    hasBillingMethod,
  });
}

