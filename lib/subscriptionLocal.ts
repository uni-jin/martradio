"use client";

import type { PlanId } from "@/lib/auth";
import {
  dayOfMonthFromYmd,
  periodBoundsFromApprovedAt,
  periodBoundsFromRenewalPayment,
  toSeoulYmd,
} from "@/lib/subscriptionPeriod";

export type LocalSubscriptionStatus = {
  userId: string;
  planId: PlanId;
  cancelRequested: boolean;
  latestPaymentKey?: string | null;
  latestOrderId?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  nextPaymentDueAt?: string | null;
  billingDayOfMonth?: number | null;
  updatedAt: string;
};

const STORAGE_KEY = "mart-radio-subscription-status-v1";

function readMap(): Record<string, LocalSubscriptionStatus> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, LocalSubscriptionStatus>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, LocalSubscriptionStatus>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getSubscriptionStatus(userId: string): LocalSubscriptionStatus | null {
  const map = readMap();
  return map[userId] ?? null;
}

export function saveSubscriptionStatus(status: LocalSubscriptionStatus): void {
  const map = readMap();
  map[status.userId] = status;
  writeMap(map);
}

export function markSubscriptionCancelRequested(userId: string, cancelRequested: boolean): void {
  const existing = getSubscriptionStatus(userId);
  const next: LocalSubscriptionStatus = {
    userId,
    planId: existing?.planId ?? "free",
    cancelRequested,
    latestPaymentKey: existing?.latestPaymentKey ?? null,
    latestOrderId: existing?.latestOrderId ?? null,
    currentPeriodStart: existing?.currentPeriodStart ?? null,
    currentPeriodEnd: existing?.currentPeriodEnd ?? null,
    nextPaymentDueAt: existing?.nextPaymentDueAt ?? null,
    billingDayOfMonth: existing?.billingDayOfMonth ?? null,
    updatedAt: new Date().toISOString(),
  };
  saveSubscriptionStatus(next);
}

export function upsertSubscriptionAfterPayment(params: {
  userId: string;
  planId: PlanId;
  paymentKey: string;
  orderId: string;
  approvedAt: string;
}): void {
  const prev = getSubscriptionStatus(params.userId);
  if (prev?.latestPaymentKey && prev.latestPaymentKey === params.paymentKey) {
    return;
  }

  const approved = new Date(params.approvedAt);
  const start = Number.isNaN(approved.getTime()) ? new Date() : approved;
  const approvalIso = start.toISOString();
  const prevNext = prev?.nextPaymentDueAt;
  const renewalAnchor =
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

  saveSubscriptionStatus({
    userId: params.userId,
    planId: params.planId,
    cancelRequested: false,
    latestPaymentKey: params.paymentKey,
    latestOrderId: params.orderId,
    currentPeriodStart: bounds.currentPeriodStart,
    currentPeriodEnd: bounds.currentPeriodEnd,
    nextPaymentDueAt: bounds.nextPaymentDueAt,
    billingDayOfMonth: bounds.billingDayOfMonth,
    updatedAt: new Date().toISOString(),
  });
}

