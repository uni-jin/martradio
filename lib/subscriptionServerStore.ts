import { getSupabaseServerClient } from "@/lib/supabaseServer";
import {
  addCalendarDaysYmd,
  dayOfMonthFromYmd,
  endOfSeoulDayIso,
  periodBoundsFromApprovedAt,
  periodBoundsFromRenewalPayment,
  startOfSeoulDayIso,
  toSeoulYmd,
} from "@/lib/subscriptionPeriod";
import { recordAdminPaymentForSubscriptionCharge } from "@/lib/adminDataSupabase.server";
import { getPlanAmount, isPaidPlanDowngrade } from "@/lib/subscriptionPlans";

type PaidPlanId = "small" | "medium" | "large";

export type ServerSubscriptionStatus = {
  userId: string;
  planId: PaidPlanId | "free";
  cancelRequested: boolean;
  latestPaymentKey?: string | null;
  latestOrderId?: string | null;
  currentPeriodStart?: string | null;
  /** 플랜 혜택 종료 시각(서울 달력 만료일 끝). 다음 결제일 전날까지 이용 */
  currentPeriodEnd?: string | null;
  /** 다음 자동 결제 예정 시각(서울 달력 결제일 시작) */
  nextPaymentDueAt?: string | null;
  /** 매월 결제 기준일(1–31). 최초 결제일의 '일' */
  billingDayOfMonth?: number | null;
  /** 이번 이용 기간 종료 후 다음 결제부터 적용할 플랜(다운그레이드 예약). */
  scheduledPlanAfterPeriod?: PaidPlanId | null;
  updatedAt: string;
};

type PendingCheckout = {
  orderId: string;
  userId: string;
  planId: PaidPlanId;
  amount: number;
  createdAt: string;
  /** true: 업그레이드 등 — 승인 시각 기준으로 최초 구독과 동일한 만료·다음 결제 주기 */
  newBillingCycle?: boolean;
};

type BillingMethod = {
  userId: string;
  customerKey: string;
  billingKey: string;
  updatedAt: string;
};

type BillingChargeAttempt = {
  userId: string;
  dueAt: string;
  primaryFailedAt?: string | null;
  retryFailedAt?: string | null;
  lastError?: string | null;
  updatedAt: string;
};

export type WebhookLog = {
  receivedAt: string;
  eventType: string;
  orderId?: string;
  paymentKey?: string;
  status?: string;
  eventId?: string;
  duplicate?: boolean;
  processed?: boolean;
  raw: unknown;
};

const MAX_WEBHOOK_LOGS = 500;

function db() {
  return getSupabaseServerClient();
}

function rowToSubscription(row: Record<string, any>): ServerSubscriptionStatus {
  return {
    userId: row.user_id,
    planId: row.plan_id,
    cancelRequested: row.cancel_requested === true,
    latestPaymentKey: row.latest_payment_key ?? null,
    latestOrderId: row.latest_order_id ?? null,
    currentPeriodStart: row.current_period_start ?? null,
    currentPeriodEnd: row.current_period_end ?? null,
    nextPaymentDueAt: row.next_payment_due_at ?? null,
    billingDayOfMonth: row.billing_day_of_month ?? null,
    scheduledPlanAfterPeriod: row.scheduled_plan_after_period ?? null,
    updatedAt: row.updated_at,
  };
}

function rowToPendingCheckout(row: Record<string, any>): PendingCheckout {
  return {
    orderId: row.order_id,
    userId: row.user_id,
    planId: row.plan_id,
    amount: Number(row.amount),
    createdAt: row.created_at,
    newBillingCycle: row.new_billing_cycle === true,
  };
}

function migrateLegacySubscription(s: ServerSubscriptionStatus): ServerSubscriptionStatus {
  let row: ServerSubscriptionStatus = { ...s };
  if (
    typeof row.billingDayOfMonth !== "number" ||
    row.billingDayOfMonth < 1 ||
    row.billingDayOfMonth > 31
  ) {
    if (typeof row.currentPeriodStart === "string" && row.currentPeriodStart.trim()) {
      const ymd = toSeoulYmd(new Date(row.currentPeriodStart));
      row = { ...row, billingDayOfMonth: dayOfMonthFromYmd(ymd) };
    }
  }

  if (typeof row.nextPaymentDueAt === "string" && row.nextPaymentDueAt.trim()) {
    return row;
  }
  if (!row.currentPeriodEnd) return { ...row, nextPaymentDueAt: row.nextPaymentDueAt ?? null };
  const nextDueYmd = toSeoulYmd(new Date(row.currentPeriodEnd));
  const planExpiresYmd = addCalendarDaysYmd(nextDueYmd, -1);
  return {
    ...row,
    nextPaymentDueAt: startOfSeoulDayIso(nextDueYmd),
    currentPeriodEnd: endOfSeoulDayIso(planExpiresYmd),
  };
}

async function getSubscriptionRow(userId: string): Promise<ServerSubscriptionStatus | null> {
  const found = await db()
    .from("subscription_statuses")
    .select("*")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (found.error || !found.data) return null;
  return migrateLegacySubscription(rowToSubscription(found.data));
}

async function upsertPaymentLink(params: {
  userId: string;
  orderId?: string | null;
  paymentKey?: string | null;
}): Promise<void> {
  if (!params.orderId && !params.paymentKey) return;
  const now = new Date().toISOString();
  if (params.orderId) {
    await db().from("subscription_payment_links").upsert(
      {
        order_id: params.orderId,
        user_id: params.userId,
        payment_key: params.paymentKey ?? null,
        created_at: now,
      },
      { onConflict: "order_id" }
    );
  }
  if (params.paymentKey) {
    await db().from("subscription_payment_links").upsert(
      {
        payment_key: params.paymentKey,
        user_id: params.userId,
        order_id: params.orderId ?? null,
        created_at: now,
      },
      { onConflict: "payment_key" }
    );
  }
}

export async function savePendingCheckout(item: PendingCheckout): Promise<void> {
  await db().from("subscription_pending_checkouts").upsert(
    {
      order_id: item.orderId,
      user_id: item.userId,
      plan_id: item.planId,
      amount: item.amount,
      created_at: item.createdAt,
      new_billing_cycle: item.newBillingCycle === true,
    },
    { onConflict: "order_id" }
  );
}

export async function getPendingCheckout(orderId: string): Promise<PendingCheckout | null> {
  const found = await db()
    .from("subscription_pending_checkouts")
    .select("*")
    .eq("order_id", orderId)
    .limit(1)
    .maybeSingle();
  if (found.error || !found.data) return null;
  return rowToPendingCheckout(found.data);
}

export async function deletePendingCheckout(orderId: string): Promise<void> {
  await db().from("subscription_pending_checkouts").delete().eq("order_id", orderId);
}

export async function setSubscriptionBillingMethod(params: {
  userId: string;
  customerKey: string;
  billingKey: string;
}): Promise<void> {
  await db().from("subscription_billing_methods").upsert(
    {
      user_id: params.userId,
      customer_key: params.customerKey,
      billing_key: params.billingKey,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
}

export async function getSubscriptionBillingMethod(userId: string): Promise<BillingMethod | null> {
  const found = await db()
    .from("subscription_billing_methods")
    .select("*")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (found.error || !found.data) return null;
  return {
    userId: found.data.user_id,
    customerKey: found.data.customer_key,
    billingKey: found.data.billing_key,
    updatedAt: found.data.updated_at,
  };
}

export async function hasPrimaryBillingFailure(userId: string, dueAt: string): Promise<boolean> {
  const found = await db()
    .from("subscription_billing_charge_attempts")
    .select("primary_failed_at,retry_failed_at,due_at")
    .eq("user_id", userId)
    .eq("due_at", dueAt)
    .limit(1)
    .maybeSingle();
  if (found.error || !found.data) return false;
  return Boolean(found.data.primary_failed_at && !found.data.retry_failed_at);
}

export async function markPrimaryBillingFailure(
  userId: string,
  dueAt: string,
  errorMessage: string
): Promise<void> {
  await db().from("subscription_billing_charge_attempts").upsert(
    {
      user_id: userId,
      due_at: dueAt,
      primary_failed_at: new Date().toISOString(),
      retry_failed_at: null,
      last_error: errorMessage,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
}

export async function markRetryBillingFailure(
  userId: string,
  dueAt: string,
  errorMessage: string
): Promise<void> {
  const prev = await db()
    .from("subscription_billing_charge_attempts")
    .select("primary_failed_at")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  await db().from("subscription_billing_charge_attempts").upsert(
    {
      user_id: userId,
      due_at: dueAt,
      primary_failed_at: prev.data?.primary_failed_at ?? new Date().toISOString(),
      retry_failed_at: new Date().toISOString(),
      last_error: errorMessage,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
}

export async function clearBillingFailureAttempt(userId: string): Promise<void> {
  await db().from("subscription_billing_charge_attempts").delete().eq("user_id", userId);
}

export async function getDueRecurringBillingTargets(nowIso: string): Promise<
  Array<{
    userId: string;
    planId: PaidPlanId;
    customerKey: string;
    billingKey: string;
    nextPaymentDueAt: string;
  }>
> {
  const subsRes = await db()
    .from("subscription_statuses")
    .select("user_id,plan_id,cancel_requested,next_payment_due_at,scheduled_plan_after_period")
    .in("plan_id", ["small", "medium", "large"])
    .eq("cancel_requested", false)
    .lte("next_payment_due_at", nowIso);
  if (subsRes.error) return [];
  const rows = subsRes.data ?? [];
  if (rows.length === 0) return [];
  const userIds = rows.map((x) => x.user_id as string);
  const billingRes = await db()
    .from("subscription_billing_methods")
    .select("user_id,customer_key,billing_key")
    .in("user_id", userIds);
  if (billingRes.error) return [];
  const methodByUser = new Map<string, { customerKey: string; billingKey: string }>();
  for (const row of billingRes.data ?? []) {
    methodByUser.set(row.user_id, {
      customerKey: row.customer_key,
      billingKey: row.billing_key,
    });
  }
  const due: Array<{
  userId: string;
  planId: PaidPlanId;
  customerKey: string;
  billingKey: string;
  nextPaymentDueAt: string;
  }> = [];
  for (const sub of rows) {
    const userId = sub.user_id as string;
    const method = methodByUser.get(userId);
    if (!method) continue;
    const billPlanId = (sub.scheduled_plan_after_period ?? sub.plan_id) as PaidPlanId;
    due.push({
      userId,
      planId: billPlanId,
      customerKey: method.customerKey,
      billingKey: method.billingKey,
      nextPaymentDueAt: sub.next_payment_due_at as string,
    });
  }
  return due;
}

export async function upsertSubscriptionAfterConfirm(params: {
  userId: string;
  planId: PaidPlanId;
  paymentKey: string;
  orderId: string;
  approvedAt: string;
  /** 업그레이드: 최초 구독과 동일하게 승인 시각 기준 새 주기(만료일·다음 결제일). */
  newBillingCycle?: boolean;
  /** 실제 청구 금액(원). 없으면 플랜 기본 월 요금으로 관리자 결제 기록. */
  chargedAmountKrw?: number;
}): Promise<ServerSubscriptionStatus> {
  const prev = await getSubscriptionRow(params.userId);
  if (prev?.latestPaymentKey && prev.latestPaymentKey === params.paymentKey) {
    await upsertPaymentLink({
      userId: params.userId,
      orderId: params.orderId,
      paymentKey: params.paymentKey,
    });
    return prev;
  }

  const approved = new Date(params.approvedAt);
  const start = Number.isNaN(approved.getTime()) ? new Date() : approved;
  const approvalIso = start.toISOString();
  const prevNext = prev?.nextPaymentDueAt;
  const renewalAnchor =
    !params.newBillingCycle &&
    prev &&
    prev.planId !== "free" &&
    typeof prevNext === "string" &&
    prevNext.trim();
  const bounds = renewalAnchor
    ? periodBoundsFromRenewalPayment({
        previousNextPaymentDueAt: prevNext,
        approvalInstantIso: approvalIso,
        billingDayOfMonth:
          typeof prev.billingDayOfMonth === "number" && prev.billingDayOfMonth >= 1 && prev.billingDayOfMonth <= 31
            ? prev.billingDayOfMonth
            : dayOfMonthFromYmd(toSeoulYmd(new Date(prevNext))),
      })
    : periodBoundsFromApprovedAt(approvalIso);

  const status: ServerSubscriptionStatus = {
    userId: params.userId,
    planId: params.planId,
    cancelRequested: false,
    scheduledPlanAfterPeriod: null,
    latestPaymentKey: params.paymentKey,
    latestOrderId: params.orderId,
    currentPeriodStart: bounds.currentPeriodStart,
    currentPeriodEnd: bounds.currentPeriodEnd,
    nextPaymentDueAt: bounds.nextPaymentDueAt,
    billingDayOfMonth: bounds.billingDayOfMonth,
    updatedAt: new Date().toISOString(),
  };
  await db().from("subscription_statuses").upsert(
    {
      user_id: status.userId,
      plan_id: status.planId,
      cancel_requested: status.cancelRequested,
      scheduled_plan_after_period: status.scheduledPlanAfterPeriod ?? null,
      latest_payment_key: status.latestPaymentKey ?? null,
      latest_order_id: status.latestOrderId ?? null,
      current_period_start: status.currentPeriodStart ?? null,
      current_period_end: status.currentPeriodEnd ?? null,
      next_payment_due_at: status.nextPaymentDueAt ?? null,
      billing_day_of_month: status.billingDayOfMonth ?? null,
      updated_at: status.updatedAt,
    },
    { onConflict: "user_id" }
  );
  await upsertPaymentLink({
    userId: params.userId,
    orderId: params.orderId,
    paymentKey: params.paymentKey,
  });
  const chargeKrw =
    typeof params.chargedAmountKrw === "number" && Number.isFinite(params.chargedAmountKrw)
      ? Math.floor(params.chargedAmountKrw)
      : getPlanAmount(params.planId);
  if (chargeKrw > 0) {
    void recordAdminPaymentForSubscriptionCharge({
      userId: params.userId,
      planId: params.planId,
      orderId: params.orderId,
      paymentKey: params.paymentKey,
      amountKrw: chargeKrw,
      paidAtIso: approvalIso,
    }).catch(() => {});
  }
  return status;
}

export async function setCancelRequested(
  userId: string,
  cancelRequested: boolean
): Promise<ServerSubscriptionStatus> {
  const prev = await getSubscriptionRow(userId);
  const next: ServerSubscriptionStatus = {
    userId,
    planId: prev?.planId ?? "free",
    cancelRequested,
    scheduledPlanAfterPeriod: cancelRequested ? null : (prev?.scheduledPlanAfterPeriod ?? null),
    latestPaymentKey: prev?.latestPaymentKey ?? null,
    latestOrderId: prev?.latestOrderId ?? null,
    currentPeriodStart: prev?.currentPeriodStart ?? null,
    currentPeriodEnd: prev?.currentPeriodEnd ?? null,
    nextPaymentDueAt: prev?.nextPaymentDueAt ?? null,
    billingDayOfMonth: prev?.billingDayOfMonth ?? null,
    updatedAt: new Date().toISOString(),
  };
  await db().from("subscription_statuses").upsert(
    {
      user_id: next.userId,
      plan_id: next.planId,
      cancel_requested: next.cancelRequested,
      scheduled_plan_after_period: next.scheduledPlanAfterPeriod ?? null,
      latest_payment_key: next.latestPaymentKey ?? null,
      latest_order_id: next.latestOrderId ?? null,
      current_period_start: next.currentPeriodStart ?? null,
      current_period_end: next.currentPeriodEnd ?? null,
      next_payment_due_at: next.nextPaymentDueAt ?? null,
      billing_day_of_month: next.billingDayOfMonth ?? null,
      updated_at: next.updatedAt,
    },
    { onConflict: "user_id" }
  );
  return migrateLegacySubscription(next);
}

/** 다음 결제 주기부터 하위 플랜 적용 예약. 해지 신청이 있으면 해제한다. */
export async function setScheduledPlanAfterCurrentPeriod(
  userId: string,
  targetPlanId: PaidPlanId
): Promise<ServerSubscriptionStatus> {
  const prev = await getSubscriptionRow(userId);
  if (!prev || (prev.planId !== "small" && prev.planId !== "medium" && prev.planId !== "large")) {
    throw new Error("활성 유료 구독이 없습니다.");
  }
  if (!isPaidPlanDowngrade(prev.planId, targetPlanId)) {
    throw new Error("하위 플랜으로만 예약할 수 있습니다.");
  }
  if (prev.planId === targetPlanId) {
    throw new Error("이미 해당 플랜입니다.");
  }
  const next: ServerSubscriptionStatus = {
    ...prev,
    scheduledPlanAfterPeriod: targetPlanId,
    cancelRequested: false,
    updatedAt: new Date().toISOString(),
  };
  await db().from("subscription_statuses").upsert(
    {
      user_id: next.userId,
      plan_id: next.planId,
      cancel_requested: next.cancelRequested,
      scheduled_plan_after_period: next.scheduledPlanAfterPeriod ?? null,
      latest_payment_key: next.latestPaymentKey ?? null,
      latest_order_id: next.latestOrderId ?? null,
      current_period_start: next.currentPeriodStart ?? null,
      current_period_end: next.currentPeriodEnd ?? null,
      next_payment_due_at: next.nextPaymentDueAt ?? null,
      billing_day_of_month: next.billingDayOfMonth ?? null,
      updated_at: next.updatedAt,
    },
    { onConflict: "user_id" }
  );
  return migrateLegacySubscription(next);
}

/** 다음 결제일부터 적용 예정이던 하위 플랜 예약만 취소한다. */
export async function cancelScheduledPlanChange(userId: string): Promise<ServerSubscriptionStatus> {
  const prev = await getSubscriptionRow(userId);
  if (!prev) {
    throw new Error("구독 정보를 찾을 수 없습니다.");
  }
  if (prev.planId !== "small" && prev.planId !== "medium" && prev.planId !== "large") {
    throw new Error("활성 유료 구독이 없습니다.");
  }
  if (prev.scheduledPlanAfterPeriod == null) {
    throw new Error("예약된 플랜 변경이 없습니다.");
  }
  const next: ServerSubscriptionStatus = {
    ...prev,
    scheduledPlanAfterPeriod: null,
    updatedAt: new Date().toISOString(),
  };
  await db().from("subscription_statuses").upsert(
    {
      user_id: next.userId,
      plan_id: next.planId,
      cancel_requested: next.cancelRequested,
      scheduled_plan_after_period: null,
      latest_payment_key: next.latestPaymentKey ?? null,
      latest_order_id: next.latestOrderId ?? null,
      current_period_start: next.currentPeriodStart ?? null,
      current_period_end: next.currentPeriodEnd ?? null,
      next_payment_due_at: next.nextPaymentDueAt ?? null,
      billing_day_of_month: next.billingDayOfMonth ?? null,
      updated_at: next.updatedAt,
    },
    { onConflict: "user_id" }
  );
  return migrateLegacySubscription(next);
}

export async function getSubscriptionStatusByUser(userId: string): Promise<ServerSubscriptionStatus | null> {
  const row = await getSubscriptionRow(userId);
  return row ? migrateLegacySubscription(row) : null;
}

/** 관리자 목록 등: 서버에 저장된 구독 스냅샷 전체 */
export async function getAllSubscriptionStatuses(): Promise<ServerSubscriptionStatus[]> {
  const res = await db().from("subscription_statuses").select("*");
  if (res.error) return [];
  return (res.data ?? []).map((row) => migrateLegacySubscription(rowToSubscription(row)));
}

export async function applyPaymentStatusWebhook(params: {
  eventId?: string;
  orderId?: string;
  paymentKey?: string;
  status?: string;
  approvedAt?: string;
}): Promise<ServerSubscriptionStatus | null> {
  if (params.eventId && (await isWebhookEventProcessed(params.eventId))) {
    return null;
  }
  const st = (params.status ?? "").toUpperCase();
  const userIdByOrder = params.orderId
    ? (
        await db()
          .from("subscription_payment_links")
          .select("user_id")
          .eq("order_id", params.orderId)
          .limit(1)
          .maybeSingle()
      ).data?.user_id
    : undefined;
  const userIdByPayment = params.paymentKey
    ? (
        await db()
          .from("subscription_payment_links")
          .select("user_id")
          .eq("payment_key", params.paymentKey)
          .limit(1)
          .maybeSingle()
      ).data?.user_id
    : undefined;
  const targetUserId = userIdByOrder ?? userIdByPayment;

  // If we receive DONE before confirm flow finalized, try pending checkout mapping.
  if (!targetUserId && st === "DONE" && params.orderId) {
    const pending = await getPendingCheckout(params.orderId);
    if (pending) {
      const approvedAt = params.approvedAt ?? new Date().toISOString();
      const next = await upsertSubscriptionAfterConfirm({
        userId: pending.userId,
        planId: pending.planId,
        paymentKey: params.paymentKey ?? `wh_${params.orderId}`,
        orderId: pending.orderId,
        approvedAt,
        newBillingCycle: pending.newBillingCycle === true,
        chargedAmountKrw: pending.amount,
      });
      await deletePendingCheckout(params.orderId);
      if (params.eventId) {
        await db().from("subscription_processed_events").upsert(
          {
            event_id: params.eventId,
            processed_at: new Date().toISOString(),
          },
          { onConflict: "event_id" }
        );
      }
      return next;
    }
  }

  if (!targetUserId) return null;
  const prev = await getSubscriptionRow(targetUserId);
  if (!prev) return null;

  if (st === "DONE") {
    const pk = params.paymentKey?.trim();
    if (pk && prev.latestPaymentKey && prev.latestPaymentKey === pk) {
      if (params.eventId) {
        await db().from("subscription_processed_events").upsert(
          {
            event_id: params.eventId,
            processed_at: new Date().toISOString(),
          },
          { onConflict: "event_id" }
        );
      }
      return prev;
    }

    const approved = new Date(params.approvedAt ?? new Date().toISOString());
    const start = Number.isNaN(approved.getTime()) ? new Date() : approved;
    const approvalIso = start.toISOString();
    const prevNext = prev.nextPaymentDueAt;
    const renewalAnchor =
      prev.planId !== "free" && typeof prevNext === "string" && prevNext.trim();
    const bounds = renewalAnchor
      ? periodBoundsFromRenewalPayment({
          previousNextPaymentDueAt: prevNext,
          approvalInstantIso: approvalIso,
          billingDayOfMonth:
            typeof prev.billingDayOfMonth === "number" && prev.billingDayOfMonth >= 1 && prev.billingDayOfMonth <= 31
              ? prev.billingDayOfMonth
              : dayOfMonthFromYmd(toSeoulYmd(new Date(prevNext))),
        })
      : periodBoundsFromApprovedAt(approvalIso);
    const paidNow = prev.planId === "small" || prev.planId === "medium" || prev.planId === "large";
    const nextPlanId: PaidPlanId | "free" =
      renewalAnchor && paidNow ? prev.scheduledPlanAfterPeriod ?? prev.planId : prev.planId;
    const next: ServerSubscriptionStatus = {
      ...prev,
      planId: nextPlanId,
      scheduledPlanAfterPeriod: renewalAnchor && paidNow ? null : (prev.scheduledPlanAfterPeriod ?? null),
      cancelRequested: false,
      currentPeriodStart: bounds.currentPeriodStart,
      currentPeriodEnd: bounds.currentPeriodEnd,
      nextPaymentDueAt: bounds.nextPaymentDueAt,
      billingDayOfMonth: bounds.billingDayOfMonth,
      latestOrderId: params.orderId ?? prev.latestOrderId ?? null,
      latestPaymentKey: params.paymentKey ?? prev.latestPaymentKey ?? null,
      updatedAt: new Date().toISOString(),
    };
    await db().from("subscription_statuses").upsert(
      {
        user_id: next.userId,
        plan_id: next.planId,
        cancel_requested: next.cancelRequested,
        scheduled_plan_after_period: next.scheduledPlanAfterPeriod ?? null,
        latest_payment_key: next.latestPaymentKey ?? null,
        latest_order_id: next.latestOrderId ?? null,
        current_period_start: next.currentPeriodStart ?? null,
        current_period_end: next.currentPeriodEnd ?? null,
        next_payment_due_at: next.nextPaymentDueAt ?? null,
        billing_day_of_month: next.billingDayOfMonth ?? null,
        updated_at: next.updatedAt,
      },
      { onConflict: "user_id" }
    );
    await upsertPaymentLink({
      userId: targetUserId,
      orderId: next.latestOrderId ?? null,
      paymentKey: next.latestPaymentKey ?? null,
    });
    if (params.eventId) {
      await db().from("subscription_processed_events").upsert(
        {
          event_id: params.eventId,
          processed_at: new Date().toISOString(),
        },
        { onConflict: "event_id" }
      );
    }
    return next;
  }

  if (st === "CANCELED" || st === "PARTIAL_CANCELED" || st === "ABORTED" || st === "EXPIRED") {
    const next: ServerSubscriptionStatus = {
      ...prev,
      planId: "free",
      cancelRequested: false,
      scheduledPlanAfterPeriod: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      nextPaymentDueAt: null,
      billingDayOfMonth: null,
      updatedAt: new Date().toISOString(),
    };
    await db().from("subscription_statuses").upsert(
      {
        user_id: next.userId,
        plan_id: "free",
        cancel_requested: false,
        scheduled_plan_after_period: null,
        latest_payment_key: next.latestPaymentKey ?? null,
        latest_order_id: next.latestOrderId ?? null,
        current_period_start: null,
        current_period_end: null,
        next_payment_due_at: null,
        billing_day_of_month: null,
        updated_at: next.updatedAt,
      },
      { onConflict: "user_id" }
    );
    await db().from("subscription_billing_methods").delete().eq("user_id", targetUserId);
    await db().from("subscription_billing_charge_attempts").delete().eq("user_id", targetUserId);
    if (params.eventId) {
      await db().from("subscription_processed_events").upsert(
        {
          event_id: params.eventId,
          processed_at: new Date().toISOString(),
        },
        { onConflict: "event_id" }
      );
    }
    return next;
  }

  if (params.eventId) {
    await db().from("subscription_processed_events").upsert(
      {
        event_id: params.eventId,
        processed_at: new Date().toISOString(),
      },
      { onConflict: "event_id" }
    );
  }
  return prev;
}

export async function appendWebhookLog(log: WebhookLog): Promise<void> {
  await db().from("subscription_webhook_logs").insert({
    received_at: log.receivedAt,
    event_type: log.eventType,
    order_id: log.orderId ?? null,
    payment_key: log.paymentKey ?? null,
    status: log.status ?? null,
    event_id: log.eventId ?? null,
    duplicate: log.duplicate === true,
    processed: log.processed === true,
    raw: log.raw ?? {},
  });
  const old = await db()
    .from("subscription_webhook_logs")
    .select("id")
    .order("id", { ascending: false })
    .range(MAX_WEBHOOK_LOGS, MAX_WEBHOOK_LOGS + 2000);
  if (!old.error && old.data && old.data.length > 0) {
    const ids = old.data.map((row) => row.id);
    await db().from("subscription_webhook_logs").delete().in("id", ids);
  }
}

export async function getWebhookLogs(): Promise<WebhookLog[]> {
  const res = await db()
    .from("subscription_webhook_logs")
    .select("*")
    .order("id", { ascending: false })
    .limit(MAX_WEBHOOK_LOGS);
  if (res.error || !res.data) return [];
  return res.data.map((row) => ({
    receivedAt: row.received_at,
    eventType: row.event_type,
    orderId: row.order_id ?? undefined,
    paymentKey: row.payment_key ?? undefined,
    status: row.status ?? undefined,
    eventId: row.event_id ?? undefined,
    duplicate: row.duplicate === true,
    processed: row.processed === true,
    raw: row.raw ?? {},
  }));
}

export async function isWebhookEventProcessed(eventId: string): Promise<boolean> {
  const found = await db()
    .from("subscription_processed_events")
    .select("event_id")
    .eq("event_id", eventId)
    .limit(1)
    .maybeSingle();
  return Boolean(found.data);
}

export async function adminOverrideSubscription(params: {
  userId: string;
  planId?: PaidPlanId | "free";
  cancelRequested?: boolean;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  nextPaymentDueAt?: string | null;
  billingDayOfMonth?: number | null;
  latestOrderId?: string | null;
  latestPaymentKey?: string | null;
}): Promise<ServerSubscriptionStatus> {
  const prev = await getSubscriptionRow(params.userId);
  const next: ServerSubscriptionStatus = {
    userId: params.userId,
    planId: params.planId ?? prev?.planId ?? "free",
    cancelRequested: params.cancelRequested ?? prev?.cancelRequested ?? false,
    scheduledPlanAfterPeriod: prev?.scheduledPlanAfterPeriod ?? null,
    latestPaymentKey:
      params.latestPaymentKey === undefined ? prev?.latestPaymentKey ?? null : params.latestPaymentKey,
    latestOrderId: params.latestOrderId === undefined ? prev?.latestOrderId ?? null : params.latestOrderId,
    currentPeriodStart:
      params.currentPeriodStart === undefined ? prev?.currentPeriodStart ?? null : params.currentPeriodStart,
    currentPeriodEnd:
      params.currentPeriodEnd === undefined ? prev?.currentPeriodEnd ?? null : params.currentPeriodEnd,
    nextPaymentDueAt:
      params.nextPaymentDueAt === undefined ? prev?.nextPaymentDueAt ?? null : params.nextPaymentDueAt,
    billingDayOfMonth:
      params.billingDayOfMonth === undefined ? prev?.billingDayOfMonth ?? null : params.billingDayOfMonth,
    updatedAt: new Date().toISOString(),
  };
  const finalNext =
    next.planId === "free" ? { ...next, scheduledPlanAfterPeriod: null } : next;
  await db().from("subscription_statuses").upsert(
    {
      user_id: finalNext.userId,
      plan_id: finalNext.planId,
      cancel_requested: finalNext.cancelRequested,
      scheduled_plan_after_period: finalNext.scheduledPlanAfterPeriod ?? null,
      latest_payment_key: finalNext.latestPaymentKey ?? null,
      latest_order_id: finalNext.latestOrderId ?? null,
      current_period_start: finalNext.currentPeriodStart ?? null,
      current_period_end: finalNext.currentPeriodEnd ?? null,
      next_payment_due_at: finalNext.nextPaymentDueAt ?? null,
      billing_day_of_month: finalNext.billingDayOfMonth ?? null,
      updated_at: finalNext.updatedAt,
    },
    { onConflict: "user_id" }
  );
  if (finalNext.planId === "free") {
    await db().from("subscription_billing_methods").delete().eq("user_id", finalNext.userId);
    await db().from("subscription_billing_charge_attempts").delete().eq("user_id", finalNext.userId);
  }
  await upsertPaymentLink({
    userId: finalNext.userId,
    orderId: finalNext.latestOrderId ?? null,
    paymentKey: finalNext.latestPaymentKey ?? null,
  });
  return finalNext;
}

export async function terminateSubscriptionAfterBillingFailure(
  userId: string
): Promise<ServerSubscriptionStatus | null> {
  const prev = await getSubscriptionRow(userId);
  if (!prev) return null;
  const next: ServerSubscriptionStatus = {
    ...prev,
    planId: "free",
    cancelRequested: false,
    scheduledPlanAfterPeriod: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    nextPaymentDueAt: null,
    billingDayOfMonth: null,
    updatedAt: new Date().toISOString(),
  };
  await db().from("subscription_statuses").upsert(
    {
      user_id: next.userId,
      plan_id: "free",
      cancel_requested: false,
      scheduled_plan_after_period: null,
      latest_payment_key: next.latestPaymentKey ?? null,
      latest_order_id: next.latestOrderId ?? null,
      current_period_start: null,
      current_period_end: null,
      next_payment_due_at: null,
      billing_day_of_month: null,
      updated_at: next.updatedAt,
    },
    { onConflict: "user_id" }
  );
  await db().from("subscription_billing_methods").delete().eq("user_id", userId);
  await db().from("subscription_billing_charge_attempts").delete().eq("user_id", userId);
  return next;
}

