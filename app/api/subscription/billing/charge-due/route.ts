import { NextRequest, NextResponse } from "next/server";
import {
  appendWebhookLog,
  clearBillingFailureAttempt,
  getDueRecurringBillingTargets,
  hasPrimaryBillingFailure,
  markPrimaryBillingFailure,
  markRetryBillingFailure,
  terminateSubscriptionAfterBillingFailure,
  upsertSubscriptionAfterConfirm,
} from "@/lib/subscriptionServerStore";
import { getPlanAmount, getPlanOrderName } from "@/lib/subscriptionPlans";

function getTossSecret(): string | null {
  const key = process.env.TOSS_SECRET_KEY?.trim();
  return key || null;
}

function isCronAuthorized(request: NextRequest): boolean {
  const required = process.env.SUBSCRIPTION_BILLING_CRON_SECRET?.trim();
  if (!required) return false;
  const token = request.headers.get("x-cron-secret")?.trim();
  return token === required;
}

function newRecurringOrderId(userId: string): string {
  return `rec_${userId}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function nowSeoulHour(isoNow: string): number {
  const d = new Date(isoNow);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  return Number.isFinite(h) ? h : -1;
}

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }
  const secret = getTossSecret();
  if (!secret) {
    return NextResponse.json({ error: "TOSS_SECRET_KEY가 설정되지 않았습니다." }, { status: 500 });
  }
  const auth = Buffer.from(`${secret}:`).toString("base64");
  const nowIso = new Date().toISOString();
  const seoulHour = nowSeoulHour(nowIso);
  const stage = seoulHour === 10 ? "primary" : seoulHour === 13 ? "retry" : "skip";
  if (stage === "skip") {
    return NextResponse.json({
      ok: true,
      nowIso,
      seoulHour,
      skipped: true,
      reason: "허용된 자동청구 실행 시각(10시/13시 KST)이 아닙니다.",
    });
  }
  const due = getDueRecurringBillingTargets(nowIso);

  const results: Array<{ userId: string; ok: boolean; message: string }> = [];
  for (const target of due) {
    if (stage === "primary" && hasPrimaryBillingFailure(target.userId, target.nextPaymentDueAt)) {
      results.push({ userId: target.userId, ok: false, message: "already_failed_primary" });
      continue;
    }
    if (stage === "retry" && !hasPrimaryBillingFailure(target.userId, target.nextPaymentDueAt)) {
      continue;
    }
    const orderId = newRecurringOrderId(target.userId);
    const amount = getPlanAmount(target.planId);
    try {
      const res = await fetch(`https://api.tosspayments.com/v1/billing/${encodeURIComponent(target.billingKey)}`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerKey: target.customerKey,
          amount,
          orderId,
          orderName: getPlanOrderName(target.planId),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.paymentKey !== "string" || !data.paymentKey) {
        const message =
          typeof data.message === "string" ? data.message : "자동청구 승인 실패";
        if (stage === "primary") {
          markPrimaryBillingFailure(target.userId, target.nextPaymentDueAt, message);
        } else {
          markRetryBillingFailure(target.userId, target.nextPaymentDueAt, message);
          terminateSubscriptionAfterBillingFailure(target.userId);
        }
        appendWebhookLog({
          receivedAt: new Date().toISOString(),
          eventType: stage === "primary" ? "BILLING_CHARGE_FAILED" : "BILLING_CHARGE_RETRY_FAILED",
          orderId,
          status: "FAILED",
          processed: false,
          raw: { userId: target.userId, amount, response: data, stage },
        });
        results.push({ userId: target.userId, ok: false, message });
        continue;
      }
      const approvedAt =
        typeof data.approvedAt === "string" && data.approvedAt
          ? data.approvedAt
          : new Date().toISOString();
      upsertSubscriptionAfterConfirm({
        userId: target.userId,
        planId: target.planId,
        paymentKey: data.paymentKey,
        orderId: typeof data.orderId === "string" ? data.orderId : orderId,
        approvedAt,
      });
      clearBillingFailureAttempt(target.userId);
      results.push({ userId: target.userId, ok: true, message: "charged" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (stage === "primary") {
        markPrimaryBillingFailure(target.userId, target.nextPaymentDueAt, message);
      } else {
        markRetryBillingFailure(target.userId, target.nextPaymentDueAt, message);
        terminateSubscriptionAfterBillingFailure(target.userId);
      }
      results.push({
        userId: target.userId,
        ok: false,
        message,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    nowIso,
    seoulHour,
    stage,
    dueCount: due.length,
    successCount: results.filter((r) => r.ok).length,
    failCount: results.filter((r) => !r.ok).length,
    results,
  });
}
