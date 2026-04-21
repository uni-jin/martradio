import { NextRequest, NextResponse } from "next/server";
import {
  deletePendingCheckout,
  getPendingCheckout,
  upsertSubscriptionAfterConfirm,
} from "@/lib/subscriptionServerStore";
import { isPaidPlanId } from "@/lib/subscriptionPlans";
import { isValidPublicUserId } from "@/lib/validation.shared";

function tossSecretKeyFromEnv(): string | null {
  const key = process.env.TOSS_SECRET_KEY?.trim();
  if (!key) return null;
  return key;
}

export async function POST(request: NextRequest) {
  let body: {
    userId?: unknown;
    planId?: unknown;
    orderId?: unknown;
    paymentKey?: unknown;
    amount?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  if (!isPaidPlanId(body.planId)) {
    return NextResponse.json({ error: "유료 플랜만 결제를 확정할 수 있습니다." }, { status: 400 });
  }
  const paidPlanId = body.planId;

  if (typeof body.orderId !== "string" || !body.orderId.trim()) {
    return NextResponse.json({ error: "orderId가 필요합니다." }, { status: 400 });
  }
  if (typeof body.userId !== "string" || !body.userId.trim()) {
    return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });
  }
  if (!isValidPublicUserId(body.userId.trim())) {
    return NextResponse.json({ error: "userId 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (typeof body.paymentKey !== "string" || !body.paymentKey.trim()) {
    return NextResponse.json({ error: "paymentKey가 필요합니다." }, { status: 400 });
  }

  if (typeof body.amount !== "number" || !Number.isFinite(body.amount)) {
    return NextResponse.json({ error: "amount가 필요합니다." }, { status: 400 });
  }

  const pending = await getPendingCheckout(body.orderId);
  if (!pending) {
    return NextResponse.json({ error: "유효한 결제 시작 정보가 없습니다." }, { status: 400 });
  }
  if (pending.userId !== body.userId || pending.planId !== paidPlanId || pending.amount !== body.amount) {
    return NextResponse.json({ error: "결제 시작 정보와 요청 값이 일치하지 않습니다." }, { status: 400 });
  }

  const secretKey = tossSecretKeyFromEnv();
  if (!secretKey) {
    return NextResponse.json({ error: "TOSS_SECRET_KEY가 설정되지 않았습니다." }, { status: 500 });
  }

  const auth = Buffer.from(`${secretKey}:`).toString("base64");
  const tossRes = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      paymentKey: body.paymentKey,
      orderId: body.orderId,
      amount: body.amount,
    }),
  });

  const tossData = await tossRes.json().catch(() => ({}));
  if (!tossRes.ok) {
    const tossMsg =
      typeof tossData.message === "string"
        ? tossData.message
        : typeof tossData.code === "string"
          ? tossData.code
          : "토스 결제 승인에 실패했습니다.";
    return NextResponse.json({ error: tossMsg }, { status: tossRes.status >= 500 ? 502 : tossRes.status });
  }

  const approvedAt =
    typeof tossData.approvedAt === "string" ? tossData.approvedAt : new Date().toISOString();
  const status = await upsertSubscriptionAfterConfirm({
    userId: body.userId.trim(),
    planId: paidPlanId,
    paymentKey: body.paymentKey,
    orderId: body.orderId,
    approvedAt,
    newBillingCycle: pending.newBillingCycle === true,
    chargedAmountKrw: body.amount,
  });
  await deletePendingCheckout(body.orderId);

  return NextResponse.json({
    ok: true,
    userId: body.userId.trim(),
    planId: paidPlanId,
    orderId: body.orderId,
    paymentKey: body.paymentKey,
    amount: body.amount,
    approvedAt,
    subscription: status,
  });
}

