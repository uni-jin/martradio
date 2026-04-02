import { getPlanAmount, isPaidPlanUpgrade, type PaidPlanId } from "@/lib/subscriptionPlans";
import { toSeoulYmd } from "@/lib/subscriptionPeriod";

function seoulInclusiveDaysBetween(startYmd: string, endYmd: string): number {
  const [y1, m1, d1] = startYmd.split("-").map((x) => parseInt(x, 10));
  const [y2, m2, d2] = endYmd.split("-").map((x) => parseInt(x, 10));
  if (![y1, m1, d1, y2, m2, d2].every((n) => Number.isFinite(n))) return 0;
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  const diff = Math.floor((t2 - t1) / 86400000);
  return diff >= 0 ? diff + 1 : 0;
}

/**
 * 유료 → 더 높은 유료 플랜 업그레이드 시 추가 결제액(원).
 * 남은 이용 기간에 대해 하위 플랜 월 요금을 일할로 공제한 뒤 상위 플랜 월 요금을 청구한다.
 */
export function computePaidPlanUpgradeChargeKrw(params: {
  fromPlanId: PaidPlanId;
  toPlanId: PaidPlanId;
  currentPeriodStartIso: string;
  currentPeriodEndIso: string;
  approvalIso: string;
}): { chargeKrw: number; creditKrw: number; newPlanPriceKrw: number } {
  const newPlanPriceKrw = getPlanAmount(params.toPlanId);
  if (!isPaidPlanUpgrade(params.fromPlanId, params.toPlanId)) {
    return { chargeKrw: newPlanPriceKrw, creditKrw: 0, newPlanPriceKrw };
  }
  const oldPriceKrw = getPlanAmount(params.fromPlanId);
  const startYmd = toSeoulYmd(new Date(params.currentPeriodStartIso));
  const endYmd = toSeoulYmd(new Date(params.currentPeriodEndIso));
  const todayYmd = toSeoulYmd(new Date(params.approvalIso));
  const totalDays = seoulInclusiveDaysBetween(startYmd, endYmd);
  if (totalDays <= 0) {
    return { chargeKrw: newPlanPriceKrw, creditKrw: 0, newPlanPriceKrw };
  }
  let remainingDays = 0;
  if (todayYmd <= endYmd) {
    const fromYmd = todayYmd < startYmd ? startYmd : todayYmd;
    remainingDays = seoulInclusiveDaysBetween(fromYmd, endYmd);
  }
  const creditKrw = Math.round((remainingDays / totalDays) * oldPriceKrw);
  const chargeKrw = Math.max(0, newPlanPriceKrw - creditKrw);
  return { chargeKrw, creditKrw, newPlanPriceKrw };
}
