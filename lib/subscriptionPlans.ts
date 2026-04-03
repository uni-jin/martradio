export type PaidPlanId = "small" | "medium" | "large";

export function isPaidPlanId(planId: unknown): planId is PaidPlanId {
  return planId === "small" || planId === "medium" || planId === "large";
}

export function getPlanAmount(planId: PaidPlanId): number {
  if (planId === "large") return 19900;
  return 9900;
}

export function getPlanOrderName(planId: PaidPlanId): string {
  return planId === "large" ? "무제한 방송 월 구독" : "기본 방송 월 구독";
}

export function paidPlanTierRank(planId: PaidPlanId): number {
  if (planId === "small") return 1;
  if (planId === "medium") return 2;
  if (planId === "large") return 3;
  return 0;
}

/** 더 비싼 상위 플랜으로의 변경인지(가격/단계 기준). */
export function isPaidPlanUpgrade(from: PaidPlanId | "free", to: PaidPlanId): boolean {
  if (from === "free") return false;
  return paidPlanTierRank(to) > paidPlanTierRank(from);
}

/** 더 낮은 하위 플랜으로의 변경인지. */
export function isPaidPlanDowngrade(from: PaidPlanId | "free", to: PaidPlanId): boolean {
  if (from === "free") return false;
  return paidPlanTierRank(from) > paidPlanTierRank(to);
}
