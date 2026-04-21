import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionStatusByUser, savePendingCheckout } from "@/lib/subscriptionServerStore";
import { computePaidPlanUpgradeChargeKrw } from "@/lib/subscriptionUpgrade";
import { getPlanAmount, getPlanOrderName, isPaidPlanId, isPaidPlanUpgrade } from "@/lib/subscriptionPlans";
import { isValidPublicUserId } from "@/lib/validation.shared";

export async function POST(request: NextRequest) {
  let body: { planId?: unknown; userId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  if (!isPaidPlanId(body.planId)) {
    return NextResponse.json({ error: "유료 플랜만 결제를 시작할 수 있습니다." }, { status: 400 });
  }
  const paidPlanId = body.planId;
  if (typeof body.userId !== "string" || !body.userId.trim()) {
    return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });
  }

  const userId = body.userId.trim();
  if (!isValidPublicUserId(userId)) {
    return NextResponse.json({ error: "userId 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const sub = await getSubscriptionStatusByUser(userId);
  const approvalIso = new Date().toISOString();
  let amount = getPlanAmount(paidPlanId);
  let newBillingCycle = false;
  if (sub && sub.planId !== "free" && isPaidPlanUpgrade(sub.planId, paidPlanId)) {
    newBillingCycle = true;
    if (sub.currentPeriodStart && sub.currentPeriodEnd) {
      const c = computePaidPlanUpgradeChargeKrw({
        fromPlanId: sub.planId,
        toPlanId: paidPlanId,
        currentPeriodStartIso: sub.currentPeriodStart,
        currentPeriodEndIso: sub.currentPeriodEnd,
        approvalIso,
      });
      amount = c.chargeKrw;
    }
  }

  const orderId = `sub_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  await savePendingCheckout({
    orderId,
    userId,
    planId: paidPlanId,
    amount,
    createdAt: new Date().toISOString(),
    newBillingCycle,
  });

  // 1단계: 결제 시작/검증 API 골격. 실제 토스 승인 검증은 confirm 단계에서 확장.
  return NextResponse.json({
    orderId,
    userId,
    planId: paidPlanId,
    amount,
    orderName: getPlanOrderName(paidPlanId),
  });
}

