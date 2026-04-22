import {
  billingPeriodsForPaymentHistoryOldestFirst,
} from "@/lib/subscriptionPeriod";

export function isPaidSubscriptionPlanId(id: string | undefined | null): boolean {
  return id === "small" || id === "medium" || id === "large";
}

export function ymdToSeoulNoonIso(ymd: string): string {
  return `${ymd}T12:00:00+09:00`;
}

export type SubscriptionSnapshotLike = {
  planId?: string | null;
  cancelRequested?: boolean;
  /** 다음 결제 주기부터 적용 예정(다운그레이드 예약 등) */
  scheduledPlanAfterPeriod?: string | null;
  currentPeriodEnd?: string | null;
  nextPaymentDueAt?: string | null;
} | null;

/** 서버 구독 기준, 다음 자동결제 시 청구될 플랜 id. */
export function nextBillingPlanIdFromSubscriptionServer(
  server: SubscriptionSnapshotLike
): string | null {
  if (!server) return null;
  const s = server.scheduledPlanAfterPeriod;
  if (s != null && isPaidSubscriptionPlanId(s)) return s;
  const p = server.planId?.trim() ?? "";
  if (isPaidSubscriptionPlanId(p)) return p;
  return null;
}

/** 다음 결제에서 플랜이 바뀌는 경우(예: 다운그레이드 예약). */
export function isNextBillingPlanChangeFromSubscriptionServer(
  server: SubscriptionSnapshotLike
): boolean {
  if (!server) return false;
  const cur = server.planId?.trim() ?? "";
  const next = nextBillingPlanIdFromSubscriptionServer(server);
  if (!isPaidSubscriptionPlanId(cur) || !next) return false;
  return next !== cur;
}

export type PaymentForSubscriptionUi = {
  paidAt: string;
  productId?: string;
};

/**
 * 표시용 플랜: 서버 구독 스냅샷 > 로컬 프로필(세션). 결제 이력은 사용하지 않는다(구독·회원 DB와 표시 불일치 방지).
 */
export function effectivePlanIdForSubscriptionUi(
  server: SubscriptionSnapshotLike,
  localPlanId: string | undefined | null,
  _payments: PaymentForSubscriptionUi[]
): string {
  void _payments;
  const sp = server?.planId?.trim() ?? "";
  if (isPaidSubscriptionPlanId(sp)) return sp;

  const lp = (localPlanId ?? "").trim();
  if (isPaidSubscriptionPlanId(lp)) return lp;

  if (sp) return sp;
  return "free";
}

/**
 * 플랜 만료·다음 결제 표시.
 * 서버 구독 스토어에 유료 플랜과 기간이 있으면 **서버를 우선**(업그레이드 등으로 주기가 리셋된 값 반영).
 * 없으면 결제 이력 체인(마지막 결제 기준) → 그마저도 없으면 서버 필드만.
 */
export function resolveSubscriptionPeriodDisplayIso(params: {
  server: SubscriptionSnapshotLike;
  payments: PaymentForSubscriptionUi[];
}): { currentPeriodEndIso: string | null; nextPaymentDueIso: string | null } {
  const sp = params.server?.planId?.trim() ?? "";
  if (isPaidSubscriptionPlanId(sp)) {
    const end = params.server?.currentPeriodEnd?.trim() || null;
    const next = params.server?.nextPaymentDueAt?.trim() || null;
    if (end || next) {
      return { currentPeriodEndIso: end, nextPaymentDueIso: next };
    }
  }

  const asc = [...params.payments].sort(
    (a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime()
  );
  if (asc.length > 0) {
    const periods = billingPeriodsForPaymentHistoryOldestFirst(asc, {
      serverCurrentPeriodEndIso: params.server?.currentPeriodEnd ?? null,
    });
    const last = periods[periods.length - 1];
    if (last) {
      return {
        currentPeriodEndIso: ymdToSeoulNoonIso(last.planExpiresOn),
        nextPaymentDueIso: ymdToSeoulNoonIso(last.nextPaymentDueOn),
      };
    }
  }

  const end = params.server?.currentPeriodEnd?.trim() || null;
  const next = params.server?.nextPaymentDueAt?.trim() || null;
  return { currentPeriodEndIso: end, nextPaymentDueIso: next };
}
