import { NextRequest, NextResponse } from "next/server";
import {
  deletePendingCheckout,
  getSubscriptionBillingMethod,
  getSubscriptionStatusByUser,
  savePendingCheckout,
  setScheduledPlanAfterCurrentPeriod,
  setSubscriptionBillingMethod,
  upsertSubscriptionAfterConfirm,
} from "@/lib/subscriptionServerStore";
import {
  getPlanAmount,
  getPlanOrderName,
  isPaidPlanId,
  isPaidPlanDowngrade,
  isPaidPlanUpgrade,
} from "@/lib/subscriptionPlans";
import { computePaidPlanUpgradeChargeKrw } from "@/lib/subscriptionUpgrade";
import { isValidPublicUserId } from "@/lib/validation.shared";

function getTossSecret(): string | null {
  const key = process.env.TOSS_SECRET_KEY?.trim();
  return key || null;
}

function newRecurringOrderId(userId: string): string {
  return `rec_${userId}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function chargeUpgradeOrInitialWithBillingKey(params: {
  userId: string;
  planId: "small" | "medium" | "large";
  customerKey: string;
  billingKey: string;
  authHeader: string;
}): Promise<
  | { ok: true; paymentKey: string; orderId: string; amount: number; approvedAt: string; newBillingCycle: boolean }
  | { ok: false; status: number; error: string }
> {
  const prev = getSubscriptionStatusByUser(params.userId);
  const approvalIso = new Date().toISOString();
  let amount = getPlanAmount(params.planId);
  let newBillingCycle = false;
  if (prev && prev.planId !== "free" && isPaidPlanUpgrade(prev.planId, params.planId)) {
    newBillingCycle = true;
    if (prev.currentPeriodStart && prev.currentPeriodEnd) {
      const c = computePaidPlanUpgradeChargeKrw({
        fromPlanId: prev.planId,
        toPlanId: params.planId,
        currentPeriodStartIso: prev.currentPeriodStart,
        currentPeriodEndIso: prev.currentPeriodEnd,
        approvalIso,
      });
      amount = c.chargeKrw;
    }
  }

  const orderId = newRecurringOrderId(params.userId);
  savePendingCheckout({
    orderId,
    userId: params.userId,
    planId: params.planId,
    amount,
    createdAt: new Date().toISOString(),
    newBillingCycle,
  });

  if (amount < 1) {
    const approvedAt = approvalIso;
    const noChargeKey = `upgrade_nocharge_${orderId}`;
    upsertSubscriptionAfterConfirm({
      userId: params.userId,
      planId: params.planId,
      paymentKey: noChargeKey,
      orderId,
      approvedAt,
      newBillingCycle: true,
    });
    deletePendingCheckout(orderId);
    return {
      ok: true,
      paymentKey: noChargeKey,
      orderId,
      amount: 0,
      approvedAt,
      newBillingCycle: true,
    };
  }

  let billRes: Response;
  let billData: unknown;
  try {
    billRes = await fetch(
      `https://api.tosspayments.com/v1/billing/${encodeURIComponent(params.billingKey)}`,
      {
        method: "POST",
        headers: {
          Authorization: params.authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerKey: params.customerKey,
          amount,
          orderId,
          orderName: getPlanOrderName(params.planId),
        }),
      }
    );
    billData = await billRes.json().catch(() => ({}));
  } catch (e) {
    deletePendingCheckout(orderId);
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 502, error: `토스 정기결제 승인 요청 실패: ${msg}` };
  }
  const typedBillData = billData as any;
  if (!billRes.ok || typeof typedBillData.paymentKey !== "string" || !typedBillData.paymentKey) {
    deletePendingCheckout(orderId);
    const msg =
      typeof typedBillData.message === "string" ? typedBillData.message : "정기결제 승인에 실패했습니다.";
    return { ok: false, status: billRes.status >= 500 ? 502 : billRes.status, error: msg };
  }

  const approvedAt =
    typeof typedBillData.approvedAt === "string" && typedBillData.approvedAt
      ? typedBillData.approvedAt
      : new Date().toISOString();
  upsertSubscriptionAfterConfirm({
    userId: params.userId,
    planId: params.planId,
    paymentKey: typedBillData.paymentKey,
    orderId: typeof typedBillData.orderId === "string" ? typedBillData.orderId : orderId,
    approvedAt,
    newBillingCycle,
  });
  deletePendingCheckout(orderId);

  return {
    ok: true,
    paymentKey: typedBillData.paymentKey,
    orderId: typeof typedBillData.orderId === "string" ? typedBillData.orderId : orderId,
    amount,
    approvedAt,
    newBillingCycle,
  };
}

export async function POST(request: NextRequest) {
  try {
  let body: {
    userId?: unknown;
    planId?: unknown;
    customerKey?: unknown;
    authKey?: unknown;
    useExistingBilling?: unknown;
    /** 클라이언트 프로필의 planId (서버 구독과 불일치 시 잘못된 과금 방지) */
    profilePlanId?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  if (typeof body.userId !== "string" || !body.userId.trim()) {
    return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });
  }
  if (!isPaidPlanId(body.planId)) {
    return NextResponse.json({ error: "유료 플랜만 정기결제를 시작할 수 있습니다." }, { status: 400 });
  }
  const paidPlanId = body.planId;
  if (typeof body.customerKey !== "string" || !body.customerKey.trim()) {
    return NextResponse.json({ error: "customerKey가 필요합니다." }, { status: 400 });
  }
  const customerKey = body.customerKey.trim();
  const authKey = typeof body.authKey === "string" ? body.authKey.trim() : "";
  const useExistingBilling = body.useExistingBilling === true;
  const profilePlanIdRaw =
    typeof body.profilePlanId === "string" ? body.profilePlanId.trim() : "";
  const userId = body.userId.trim();
  if (!isValidPublicUserId(userId)) {
    return NextResponse.json({ error: "userId 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const secret = getTossSecret();
  if (!secret) {
    return NextResponse.json({ error: "TOSS_SECRET_KEY가 설정되지 않았습니다." }, { status: 500 });
  }
  const authHeader = `Basic ${Buffer.from(`${secret}:`).toString("base64")}`;

  if (useExistingBilling) {
    const method = getSubscriptionBillingMethod(userId);
    if (!method || method.customerKey !== customerKey) {
      return NextResponse.json(
        { error: "등록된 결제 수단이 없거나 customerKey가 일치하지 않습니다." },
        { status: 400 }
      );
    }
    const prev = getSubscriptionStatusByUser(userId);
    if (!prev || prev.planId === "free") {
      return NextResponse.json(
        { error: "먼저 카드 등록을 위해 토스에서 카드 정보를 입력해 주세요." },
        { status: 400 }
      );
    }
    if (prev.planId === paidPlanId) {
      return NextResponse.json({ error: "이미 해당 플랜입니다." }, { status: 400 });
    }
    if (isPaidPlanDowngrade(prev.planId, paidPlanId)) {
      try {
        const sub = setScheduledPlanAfterCurrentPeriod(userId, paidPlanId);
        return NextResponse.json({
          ok: true,
          kind: "scheduled_downgrade",
          amount: 0,
          paymentKey: null,
          orderId: null,
          approvedAt: sub.updatedAt,
          subscription: sub,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }
    if (!isPaidPlanUpgrade(prev.planId, paidPlanId)) {
      return NextResponse.json({ error: "지원하지 않는 플랜 변경입니다." }, { status: 400 });
    }
    const charged = await chargeUpgradeOrInitialWithBillingKey({
      userId,
      planId: paidPlanId,
      customerKey: method.customerKey,
      billingKey: method.billingKey,
      authHeader,
    });
    if (!charged.ok) {
      return NextResponse.json({ error: charged.error }, { status: charged.status });
    }
    const sub = getSubscriptionStatusByUser(userId);
    return NextResponse.json({
      ok: true,
      kind: "upgrade",
      paymentKey: charged.paymentKey,
      orderId: charged.orderId,
      amount: charged.amount,
      approvedAt: charged.approvedAt,
      subscription: sub,
    });
  }

  if (!authKey) {
    return NextResponse.json(
      { error: "최초 카드 등록 시 authKey가 필요합니다. 기존 카드로 변경하려면 useExistingBilling: true를 보내세요." },
      { status: 400 }
    );
  }

  let issueRes: Response;
  let issueData: unknown;
  try {
    issueRes = await fetch("https://api.tosspayments.com/v1/billing/authorizations/issue", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customerKey,
        authKey,
      }),
    });
    issueData = await issueRes.json().catch(() => ({}));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `토스 billing 인증 발급 요청 실패: ${msg}` }, { status: 502 });
  }
  const typedIssueData = issueData as any;
  if (!issueRes.ok || typeof typedIssueData.billingKey !== "string" || !typedIssueData.billingKey) {
    const msg =
      typeof typedIssueData.message === "string" ? typedIssueData.message : "빌링키 발급에 실패했습니다.";
    return NextResponse.json({ error: msg }, { status: issueRes.status >= 500 ? 502 : issueRes.status });
  }

  setSubscriptionBillingMethod({
    userId,
    customerKey,
    billingKey: typedIssueData.billingKey,
  });

  const prev = getSubscriptionStatusByUser(userId);
  const profilePlanForGuard =
    profilePlanIdRaw && isPaidPlanId(profilePlanIdRaw) ? profilePlanIdRaw : null;
  if (
    profilePlanForGuard &&
    isPaidPlanDowngrade(profilePlanForGuard, paidPlanId) &&
    (!prev || prev.planId === "free")
  ) {
    return NextResponse.json(
      {
        error:
          "서버에 유료 구독 기록이 없어 하위 구독으로의 변경을 처리할 수 없습니다. 구독 관리 화면을 새로고침한 뒤 다시 시도해 주세요.",
      },
      { status: 409 }
    );
  }
  if (prev && prev.planId !== "free" && isPaidPlanDowngrade(prev.planId, paidPlanId)) {
    try {
      const sub = setScheduledPlanAfterCurrentPeriod(userId, paidPlanId);
      return NextResponse.json({
        ok: true,
        kind: "scheduled_downgrade",
        amount: 0,
        paymentKey: null,
        orderId: null,
        approvedAt: sub.updatedAt,
        subscription: sub,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  if (prev && prev.planId !== "free" && prev.planId === paidPlanId) {
    return NextResponse.json({ error: "이미 해당 플랜입니다." }, { status: 400 });
  }

  const charged = await chargeUpgradeOrInitialWithBillingKey({
    userId,
    planId: paidPlanId,
    customerKey,
    billingKey: typedIssueData.billingKey,
    authHeader,
  });
  if (!charged.ok) {
    return NextResponse.json({ error: charged.error }, { status: charged.status });
  }
  const sub = getSubscriptionStatusByUser(userId);
  return NextResponse.json({
    ok: true,
    kind: prev && prev.planId !== "free" && isPaidPlanUpgrade(prev.planId, paidPlanId) ? "upgrade" : "subscribe",
    paymentKey: charged.paymentKey,
    orderId: charged.orderId,
    amount: charged.amount,
    approvedAt: charged.approvedAt,
    subscription: sub,
  });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `서버 처리 중 오류: ${msg}` }, { status: 500 });
  }
}
