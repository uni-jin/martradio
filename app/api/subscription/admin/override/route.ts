import { NextRequest, NextResponse } from "next/server";
import { adminOverrideSubscription } from "@/lib/subscriptionServerStore";

type PaidPlanId = "small" | "medium" | "large";

function normalizePlanId(planId: unknown): PaidPlanId | "free" | null {
  if (planId === "free" || planId === "small" || planId === "medium" || planId === "large") {
    return planId;
  }
  return null;
}

export async function POST(request: NextRequest) {
  let body: {
    userId?: unknown;
    planId?: unknown;
    cancelRequested?: unknown;
    currentPeriodStart?: unknown;
    currentPeriodEnd?: unknown;
    nextPaymentDueAt?: unknown;
    billingDayOfMonth?: unknown;
    latestOrderId?: unknown;
    latestPaymentKey?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  if (typeof body.userId !== "string" || !body.userId.trim()) {
    return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });
  }
  const normalizedPlanId =
    body.planId === undefined ? undefined : normalizePlanId(body.planId);
  if (normalizedPlanId === null) {
    return NextResponse.json({ error: "planId 값이 올바르지 않습니다." }, { status: 400 });
  }
  if (body.cancelRequested !== undefined && typeof body.cancelRequested !== "boolean") {
    return NextResponse.json({ error: "cancelRequested는 boolean이어야 합니다." }, { status: 400 });
  }
  if (body.currentPeriodStart !== undefined && body.currentPeriodStart !== null && typeof body.currentPeriodStart !== "string") {
    return NextResponse.json({ error: "currentPeriodStart는 문자열 또는 null이어야 합니다." }, { status: 400 });
  }
  if (body.currentPeriodEnd !== undefined && body.currentPeriodEnd !== null && typeof body.currentPeriodEnd !== "string") {
    return NextResponse.json({ error: "currentPeriodEnd는 문자열 또는 null이어야 합니다." }, { status: 400 });
  }
  if (body.nextPaymentDueAt !== undefined && body.nextPaymentDueAt !== null && typeof body.nextPaymentDueAt !== "string") {
    return NextResponse.json({ error: "nextPaymentDueAt는 문자열 또는 null이어야 합니다." }, { status: 400 });
  }
  if (
    body.billingDayOfMonth !== undefined &&
    body.billingDayOfMonth !== null &&
    (typeof body.billingDayOfMonth !== "number" ||
      !Number.isInteger(body.billingDayOfMonth) ||
      body.billingDayOfMonth < 1 ||
      body.billingDayOfMonth > 31)
  ) {
    return NextResponse.json({ error: "billingDayOfMonth는 1–31 정수 또는 null이어야 합니다." }, { status: 400 });
  }

  const subscription = adminOverrideSubscription({
    userId: body.userId.trim(),
    planId: normalizedPlanId,
    cancelRequested: body.cancelRequested as boolean | undefined,
    currentPeriodStart: body.currentPeriodStart as string | null | undefined,
    currentPeriodEnd: body.currentPeriodEnd as string | null | undefined,
    nextPaymentDueAt: body.nextPaymentDueAt as string | null | undefined,
    billingDayOfMonth:
      body.billingDayOfMonth === undefined
        ? undefined
        : (body.billingDayOfMonth as number | null),
    latestOrderId:
      body.latestOrderId === undefined ? undefined : (body.latestOrderId as string | null),
    latestPaymentKey:
      body.latestPaymentKey === undefined
        ? undefined
        : (body.latestPaymentKey as string | null),
  });

  return NextResponse.json({ ok: true, subscription });
}
