import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  addCalendarDaysYmd,
  dayOfMonthFromYmd,
  endOfSeoulDayIso,
  periodBoundsFromApprovedAt,
  periodBoundsFromRenewalPayment,
  startOfSeoulDayIso,
  toSeoulYmd,
} from "@/lib/subscriptionPeriod";
import { isPaidPlanDowngrade } from "@/lib/subscriptionPlans";

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

type PersistedState = {
  subscriptions: Record<string, ServerSubscriptionStatus>;
  pendingCheckouts: Record<string, PendingCheckout>;
  webhookLogs: WebhookLog[];
  orderToUser: Record<string, string>;
  paymentToUser: Record<string, string>;
  processedEventIds: string[];
  billingMethods: Record<string, BillingMethod>;
  billingChargeAttempts: Record<string, BillingChargeAttempt>;
};

const STORE_PATH = join(process.cwd(), ".martradio-data", "subscription-server-store.json");
const MAX_WEBHOOK_LOGS = 500;

const subscriptions = new Map<string, ServerSubscriptionStatus>();
const pendingCheckouts = new Map<string, PendingCheckout>();
const webhookLogs: WebhookLog[] = [];
const orderToUser = new Map<string, string>();
const paymentToUser = new Map<string, string>();
const processedEventIds = new Set<string>();
const billingMethods = new Map<string, BillingMethod>();
const billingChargeAttempts = new Map<string, BillingChargeAttempt>();

function persistState(): void {
  const dir = join(process.cwd(), ".martradio-data");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const state: PersistedState = {
    subscriptions: Object.fromEntries(subscriptions.entries()),
    pendingCheckouts: Object.fromEntries(pendingCheckouts.entries()),
    webhookLogs: webhookLogs.slice(0, MAX_WEBHOOK_LOGS),
    orderToUser: Object.fromEntries(orderToUser.entries()),
    paymentToUser: Object.fromEntries(paymentToUser.entries()),
    processedEventIds: Array.from(processedEventIds).slice(0, 2000),
    billingMethods: Object.fromEntries(billingMethods.entries()),
    billingChargeAttempts: Object.fromEntries(billingChargeAttempts.entries()),
  };
  writeFileSync(STORE_PATH, JSON.stringify(state), "utf8");
}

function loadState(): void {
  try {
    if (!existsSync(STORE_PATH)) return;
    const raw = readFileSync(STORE_PATH, "utf8");
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (parsed.subscriptions && typeof parsed.subscriptions === "object") {
      for (const [userId, status] of Object.entries(parsed.subscriptions)) {
        subscriptions.set(userId, status);
      }
    }
    if (parsed.pendingCheckouts && typeof parsed.pendingCheckouts === "object") {
      for (const [orderId, checkout] of Object.entries(parsed.pendingCheckouts)) {
        pendingCheckouts.set(orderId, checkout);
      }
    }
    if (Array.isArray(parsed.webhookLogs)) {
      webhookLogs.push(...parsed.webhookLogs.slice(0, MAX_WEBHOOK_LOGS));
    }
    if (parsed.orderToUser && typeof parsed.orderToUser === "object") {
      for (const [orderId, userId] of Object.entries(parsed.orderToUser)) {
        orderToUser.set(orderId, userId);
      }
    }
    if (parsed.paymentToUser && typeof parsed.paymentToUser === "object") {
      for (const [paymentKey, userId] of Object.entries(parsed.paymentToUser)) {
        paymentToUser.set(paymentKey, userId);
      }
    }
    if (Array.isArray(parsed.processedEventIds)) {
      for (const eventId of parsed.processedEventIds) {
        if (typeof eventId === "string" && eventId) processedEventIds.add(eventId);
      }
    }
    if (parsed.billingMethods && typeof parsed.billingMethods === "object") {
      for (const [userId, method] of Object.entries(parsed.billingMethods)) {
        if (
          typeof method?.customerKey === "string" &&
          method.customerKey &&
          typeof method?.billingKey === "string" &&
          method.billingKey
        ) {
          billingMethods.set(userId, {
            userId,
            customerKey: method.customerKey,
            billingKey: method.billingKey,
            updatedAt:
              typeof method.updatedAt === "string" && method.updatedAt ? method.updatedAt : new Date().toISOString(),
          });
        }
      }
    }
    if (parsed.billingChargeAttempts && typeof parsed.billingChargeAttempts === "object") {
      for (const [userId, attempt] of Object.entries(parsed.billingChargeAttempts)) {
        if (typeof attempt?.dueAt !== "string" || !attempt.dueAt) continue;
        billingChargeAttempts.set(userId, {
          userId,
          dueAt: attempt.dueAt,
          primaryFailedAt:
            typeof attempt.primaryFailedAt === "string" ? attempt.primaryFailedAt : null,
          retryFailedAt:
            typeof attempt.retryFailedAt === "string" ? attempt.retryFailedAt : null,
          lastError: typeof attempt.lastError === "string" ? attempt.lastError : null,
          updatedAt:
            typeof attempt.updatedAt === "string" && attempt.updatedAt
              ? attempt.updatedAt
              : new Date().toISOString(),
        });
      }
    }
  } catch {
    // ignore invalid persisted file
  }
}

loadState();

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

function migrateAllSubscriptions(): void {
  let changed = false;
  for (const [userId, row] of subscriptions.entries()) {
    const next = migrateLegacySubscription(row);
    if (
      next.nextPaymentDueAt !== row.nextPaymentDueAt ||
      next.currentPeriodEnd !== row.currentPeriodEnd ||
      next.billingDayOfMonth !== row.billingDayOfMonth
    ) {
      subscriptions.set(userId, next);
      changed = true;
    }
  }
  if (changed) persistState();
}

migrateAllSubscriptions();

export function savePendingCheckout(item: PendingCheckout): void {
  pendingCheckouts.set(item.orderId, item);
  persistState();
}

export function getPendingCheckout(orderId: string): PendingCheckout | null {
  return pendingCheckouts.get(orderId) ?? null;
}

export function deletePendingCheckout(orderId: string): void {
  pendingCheckouts.delete(orderId);
  persistState();
}

export function setSubscriptionBillingMethod(params: {
  userId: string;
  customerKey: string;
  billingKey: string;
}): void {
  billingMethods.set(params.userId, {
    userId: params.userId,
    customerKey: params.customerKey,
    billingKey: params.billingKey,
    updatedAt: new Date().toISOString(),
  });
  persistState();
}

export function getSubscriptionBillingMethod(userId: string): BillingMethod | null {
  return billingMethods.get(userId) ?? null;
}

export function hasPrimaryBillingFailure(userId: string, dueAt: string): boolean {
  const a = billingChargeAttempts.get(userId);
  return Boolean(a && a.dueAt === dueAt && a.primaryFailedAt && !a.retryFailedAt);
}

export function markPrimaryBillingFailure(userId: string, dueAt: string, errorMessage: string): void {
  billingChargeAttempts.set(userId, {
    userId,
    dueAt,
    primaryFailedAt: new Date().toISOString(),
    retryFailedAt: null,
    lastError: errorMessage,
    updatedAt: new Date().toISOString(),
  });
  persistState();
}

export function markRetryBillingFailure(userId: string, dueAt: string, errorMessage: string): void {
  const prev = billingChargeAttempts.get(userId);
  billingChargeAttempts.set(userId, {
    userId,
    dueAt,
    primaryFailedAt: prev?.primaryFailedAt ?? new Date().toISOString(),
    retryFailedAt: new Date().toISOString(),
    lastError: errorMessage,
    updatedAt: new Date().toISOString(),
  });
  persistState();
}

export function clearBillingFailureAttempt(userId: string): void {
  if (!billingChargeAttempts.has(userId)) return;
  billingChargeAttempts.delete(userId);
  persistState();
}

export function getDueRecurringBillingTargets(nowIso: string): Array<{
  userId: string;
  planId: PaidPlanId;
  customerKey: string;
  billingKey: string;
  nextPaymentDueAt: string;
}> {
  const nowMs = new Date(nowIso).getTime();
  if (!Number.isFinite(nowMs)) return [];
  const due: Array<{
    userId: string;
    planId: PaidPlanId;
    customerKey: string;
    billingKey: string;
    nextPaymentDueAt: string;
  }> = [];
  for (const [userId, sub] of subscriptions.entries()) {
    if (sub.planId !== "small" && sub.planId !== "medium" && sub.planId !== "large") continue;
    if (sub.cancelRequested) continue;
    if (!sub.nextPaymentDueAt) continue;
    const dueMs = new Date(sub.nextPaymentDueAt).getTime();
    if (!Number.isFinite(dueMs) || dueMs > nowMs) continue;
    const method = billingMethods.get(userId);
    if (!method) continue;
    const billPlanId = sub.scheduledPlanAfterPeriod ?? sub.planId;
    due.push({
      userId,
      planId: billPlanId,
      customerKey: method.customerKey,
      billingKey: method.billingKey,
      nextPaymentDueAt: sub.nextPaymentDueAt,
    });
  }
  return due;
}

export function upsertSubscriptionAfterConfirm(params: {
  userId: string;
  planId: PaidPlanId;
  paymentKey: string;
  orderId: string;
  approvedAt: string;
  /** 업그레이드: 최초 구독과 동일하게 승인 시각 기준 새 주기(만료일·다음 결제일). */
  newBillingCycle?: boolean;
}): ServerSubscriptionStatus {
  const prev = subscriptions.get(params.userId);
  if (prev?.latestPaymentKey && prev.latestPaymentKey === params.paymentKey) {
    orderToUser.set(params.orderId, params.userId);
    paymentToUser.set(params.paymentKey, params.userId);
    persistState();
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
  subscriptions.set(params.userId, status);
  orderToUser.set(params.orderId, params.userId);
  paymentToUser.set(params.paymentKey, params.userId);
  persistState();
  return status;
}

export function setCancelRequested(userId: string, cancelRequested: boolean): ServerSubscriptionStatus {
  const prev = subscriptions.get(userId);
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
  subscriptions.set(userId, next);
  persistState();
  return migrateLegacySubscription(next);
}

/** 다음 결제 주기부터 하위 플랜 적용 예약. 해지 신청이 있으면 해제한다. */
export function setScheduledPlanAfterCurrentPeriod(
  userId: string,
  targetPlanId: PaidPlanId
): ServerSubscriptionStatus {
  const prev = subscriptions.get(userId);
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
  subscriptions.set(userId, next);
  persistState();
  return migrateLegacySubscription(next);
}

/** 다음 결제일부터 적용 예정이던 하위 플랜 예약만 취소한다. */
export function cancelScheduledPlanChange(userId: string): ServerSubscriptionStatus {
  const prev = subscriptions.get(userId);
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
  subscriptions.set(userId, next);
  persistState();
  return migrateLegacySubscription(next);
}

export function getSubscriptionStatusByUser(userId: string): ServerSubscriptionStatus | null {
  const row = subscriptions.get(userId);
  return row ? migrateLegacySubscription(row) : null;
}

/** 관리자 목록 등: 서버에 저장된 구독 스냅샷 전체 */
export function getAllSubscriptionStatuses(): ServerSubscriptionStatus[] {
  return Array.from(subscriptions.values()).map((row) => migrateLegacySubscription(row));
}

export function applyPaymentStatusWebhook(params: {
  eventId?: string;
  orderId?: string;
  paymentKey?: string;
  status?: string;
  approvedAt?: string;
}): ServerSubscriptionStatus | null {
  if (params.eventId && processedEventIds.has(params.eventId)) {
    return null;
  }
  const st = (params.status ?? "").toUpperCase();
  const userIdByOrder = params.orderId ? orderToUser.get(params.orderId) : undefined;
  const userIdByPayment = params.paymentKey ? paymentToUser.get(params.paymentKey) : undefined;
  const targetUserId = userIdByOrder ?? userIdByPayment;

  // If we receive DONE before confirm flow finalized, try pending checkout mapping.
  if (!targetUserId && st === "DONE" && params.orderId) {
    const pending = getPendingCheckout(params.orderId);
    if (pending) {
      const approvedAt = params.approvedAt ?? new Date().toISOString();
      const next = upsertSubscriptionAfterConfirm({
        userId: pending.userId,
        planId: pending.planId,
        paymentKey: params.paymentKey ?? `wh_${params.orderId}`,
        orderId: pending.orderId,
        approvedAt,
        newBillingCycle: pending.newBillingCycle === true,
      });
      deletePendingCheckout(params.orderId);
      if (params.eventId) {
        processedEventIds.add(params.eventId);
        persistState();
      }
      return next;
    }
  }

  if (!targetUserId) return null;
  const prev = subscriptions.get(targetUserId);
  if (!prev) return null;

  if (st === "DONE") {
    const pk = params.paymentKey?.trim();
    if (pk && prev.latestPaymentKey && prev.latestPaymentKey === pk) {
      if (params.eventId) processedEventIds.add(params.eventId);
      persistState();
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
    subscriptions.set(targetUserId, next);
    if (next.latestOrderId) orderToUser.set(next.latestOrderId, targetUserId);
    if (next.latestPaymentKey) paymentToUser.set(next.latestPaymentKey, targetUserId);
    if (params.eventId) processedEventIds.add(params.eventId);
    persistState();
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
    subscriptions.set(targetUserId, next);
    billingMethods.delete(targetUserId);
    billingChargeAttempts.delete(targetUserId);
    if (params.eventId) processedEventIds.add(params.eventId);
    persistState();
    return next;
  }

  if (params.eventId) {
    processedEventIds.add(params.eventId);
    persistState();
  }
  return prev;
}

export function appendWebhookLog(log: WebhookLog): void {
  webhookLogs.unshift(log);
  if (webhookLogs.length > MAX_WEBHOOK_LOGS) webhookLogs.length = MAX_WEBHOOK_LOGS;
  persistState();
}

export function getWebhookLogs(): WebhookLog[] {
  return webhookLogs.slice();
}

export function isWebhookEventProcessed(eventId: string): boolean {
  return processedEventIds.has(eventId);
}

export function adminOverrideSubscription(params: {
  userId: string;
  planId?: PaidPlanId | "free";
  cancelRequested?: boolean;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  nextPaymentDueAt?: string | null;
  billingDayOfMonth?: number | null;
  latestOrderId?: string | null;
  latestPaymentKey?: string | null;
}): ServerSubscriptionStatus {
  const prev = subscriptions.get(params.userId);
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
  subscriptions.set(params.userId, finalNext);
  if (finalNext.planId === "free") {
    billingMethods.delete(finalNext.userId);
    billingChargeAttempts.delete(finalNext.userId);
  }
  if (finalNext.latestOrderId) orderToUser.set(finalNext.latestOrderId, finalNext.userId);
  if (finalNext.latestPaymentKey) paymentToUser.set(finalNext.latestPaymentKey, finalNext.userId);
  persistState();
  return finalNext;
}

export function terminateSubscriptionAfterBillingFailure(userId: string): ServerSubscriptionStatus | null {
  const prev = subscriptions.get(userId);
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
  subscriptions.set(userId, next);
  billingMethods.delete(userId);
  billingChargeAttempts.delete(userId);
  persistState();
  return next;
}

