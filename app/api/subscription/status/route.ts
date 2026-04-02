import { NextRequest, NextResponse } from "next/server";
import {
  getSubscriptionBillingMethod,
  getSubscriptionStatusByUser,
} from "@/lib/subscriptionServerStore";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });
  }
  const trimmed = userId.trim();
  const subscription = getSubscriptionStatusByUser(trimmed);
  const hasBillingMethod = getSubscriptionBillingMethod(trimmed) !== null;
  return NextResponse.json({
    ok: true,
    userId: trimmed,
    subscription,
    hasBillingMethod,
  });
}

