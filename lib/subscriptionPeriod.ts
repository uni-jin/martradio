import { isPaidPlanId } from "@/lib/subscriptionPlans";

/**
 * 월 구독(서울 달력):
 * - **결제 기준일** = 최초 결제일의 '일'(1–31)을 `billingDayOfMonth`로 저장해 유지한다.
 * - **다음 결제 예정일** = 직전 예정 결제일이 속한 달의 **다음 달**에서
 *   `min(billingDayOfMonth, 그 달의 말일)` (예: 기준 31일 → 6월 30일, 7월 31일).
 * - **플랜 만료일** = 다음 결제일 전날까지 이용.
 *
 * 갱신 시 실제 승인 시각이 예정일보다 늦어도, 주기는 저장된 **직전 다음 결제일** + `billingDayOfMonth`로 진행한다.
 */

const SEOUL = "Asia/Seoul";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Date → 서울 기준 YYYY-MM-DD */
export function toSeoulYmd(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SEOUL,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) {
    return d.toISOString().slice(0, 10);
  }
  return `${y}-${pad2(m)}-${pad2(day)}`;
}

export function dayOfMonthFromYmd(ymd: string): number {
  const d = parseInt(ymd.slice(8, 10), 10);
  return Number.isFinite(d) && d >= 1 && d <= 31 ? d : 1;
}

/** year, month(1–12)인 달의 일 수 */
export function daysInMonth(year: number, month1To12: number): number {
  if (month1To12 < 1 || month1To12 > 12) return 31;
  return new Date(Date.UTC(year, month1To12, 0, 12, 0, 0)).getUTCDate();
}

/** 순수 달력 YYYY-MM-DD에 일 수 가감 — 타임존과 무관한 시민일 연산 */
export function addCalendarDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ymd;
  const ms = Date.UTC(y, m - 1, d, 12, 0, 0) + deltaDays * 24 * 60 * 60 * 1000;
  const u = new Date(ms);
  return `${u.getUTCFullYear()}-${pad2(u.getUTCMonth() + 1)}-${pad2(u.getUTCDate())}`;
}

/**
 * 직전 예정 결제일(`paymentYmd`의 연·월)의 **다음 달**에 대해
 * `min(billingDayOfMonth, 말일)` 로 예정일을 정한다. `paymentYmd`의 일자는 사용하지 않는다.
 */
export function addOneBillingMonthYmd(paymentYmd: string, billingDayOfMonth: number): string {
  const [y, m] = paymentYmd.split("-").map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return paymentYmd;
  let nm = m + 1;
  let ny = y;
  if (nm > 12) {
    nm = 1;
    ny += 1;
  }
  const dim = daysInMonth(ny, nm);
  const anchor = Math.min(Math.max(1, billingDayOfMonth), 31);
  const nd = Math.min(anchor, dim);
  return `${ny}-${pad2(nm)}-${pad2(nd)}`;
}

export function nextCycleFromBillingAnchorSeoulYmd(
  billingAnchorYmd: string,
  billingDayOfMonth: number
): {
  planExpiresOn: string;
  nextPaymentDueOn: string;
} {
  const nextPaymentDueOn = addOneBillingMonthYmd(billingAnchorYmd, billingDayOfMonth);
  const planExpiresOn = addCalendarDaysYmd(nextPaymentDueOn, -1);
  return { planExpiresOn, nextPaymentDueOn };
}

/** 최초 승인 시각의 서울 날짜로 기준일을 잡고 다음 주기 계산 */
export function billingDatesFromApprovedAt(approvedAtIso: string): {
  planExpiresOn: string;
  nextPaymentDueOn: string;
} {
  const approved = new Date(approvedAtIso);
  const base = Number.isNaN(approved.getTime()) ? new Date() : approved;
  const firstBillingYmd = toSeoulYmd(base);
  const billingDayOfMonth = dayOfMonthFromYmd(firstBillingYmd);
  return nextCycleFromBillingAnchorSeoulYmd(firstBillingYmd, billingDayOfMonth);
}

/**
 * 결제 이력을 **오래된 순**으로 두었을 때, 각 결제 직후 구간의 만료일·다음 결제 예정일(스케줄 기준).
 * 첫 결제일에서 기준일을 잡고, 이후 동일 플랜 갱신은 직전 예정 다음 결제일에서 한 달씩 진행한다.
 * **유료 플랜이 바뀌는 결제**(업그레이드 등)가 있으면 그 결제일 기준으로 주기를 새로 잡는다.
 * `serverCurrentPeriodEndIso`가 있으면 **마지막 행의 만료일**을 서버 구독과 맞춘다(현재 기간 표시 일치).
 */
export function billingPeriodsForPaymentHistoryOldestFirst(
  paymentsOldestFirst: Array<{ paidAt: string; productId?: string }>,
  options?: { serverCurrentPeriodEndIso?: string | null }
): Array<{ planExpiresOn: string; nextPaymentDueOn: string }> {
  if (paymentsOldestFirst.length === 0) return [];
  const out: Array<{ planExpiresOn: string; nextPaymentDueOn: string }> = [];
  let scheduledNextYmd: string | null = null;
  let anchorDay = dayOfMonthFromYmd(toSeoulYmd(new Date(paymentsOldestFirst[0].paidAt)));

  for (let i = 0; i < paymentsOldestFirst.length; i++) {
    const paidYmd = toSeoulYmd(new Date(paymentsOldestFirst[i].paidAt));
    const prevPid = i > 0 ? (paymentsOldestFirst[i - 1].productId ?? "").trim() : "";
    const currPid = (paymentsOldestFirst[i].productId ?? "").trim();

    if (i === 0) {
      const c = nextCycleFromBillingAnchorSeoulYmd(paidYmd, anchorDay);
      scheduledNextYmd = c.nextPaymentDueOn;
      out.push(c);
      continue;
    }

    const paidTierChange =
      prevPid &&
      currPid &&
      isPaidPlanId(prevPid) &&
      isPaidPlanId(currPid) &&
      prevPid !== currPid;

    if (paidTierChange) {
      anchorDay = dayOfMonthFromYmd(paidYmd);
      const c = nextCycleFromBillingAnchorSeoulYmd(paidYmd, anchorDay);
      scheduledNextYmd = c.nextPaymentDueOn;
      out.push(c);
      continue;
    }

    const nextDue = addOneBillingMonthYmd(scheduledNextYmd!, anchorDay);
    const planExpires = addCalendarDaysYmd(nextDue, -1);
    scheduledNextYmd = nextDue;
    out.push({ planExpiresOn: planExpires, nextPaymentDueOn: nextDue });
  }

  const align = options?.serverCurrentPeriodEndIso?.trim();
  if (align && out.length > 0) {
    const ymd = toSeoulYmd(new Date(align));
    const last = out[out.length - 1];
    out[out.length - 1] = { ...last, planExpiresOn: ymd };
  }

  return out;
}

export function startOfSeoulDayIso(ymd: string): string {
  return `${ymd}T00:00:00+09:00`;
}

export function endOfSeoulDayIso(ymd: string): string {
  return `${ymd}T23:59:59.999+09:00`;
}

export function periodBoundsFromBillingAnchorYmd(
  billingAnchorSeoulYmd: string,
  approvalInstantIso: string,
  billingDayOfMonth: number
): {
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextPaymentDueAt: string;
  billingDayOfMonth: number;
} {
  const { planExpiresOn, nextPaymentDueOn } = nextCycleFromBillingAnchorSeoulYmd(
    billingAnchorSeoulYmd,
    billingDayOfMonth
  );
  return {
    currentPeriodStart: approvalInstantIso,
    currentPeriodEnd: endOfSeoulDayIso(planExpiresOn),
    nextPaymentDueAt: startOfSeoulDayIso(nextPaymentDueOn),
    billingDayOfMonth,
  };
}

export function periodBoundsFromApprovedAt(approvedAtIso: string): {
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextPaymentDueAt: string;
  billingDayOfMonth: number;
} {
  const approved = new Date(approvedAtIso);
  const start = Number.isNaN(approved.getTime()) ? new Date() : approved;
  const billingAnchorYmd = toSeoulYmd(start);
  const billingDayOfMonth = dayOfMonthFromYmd(billingAnchorYmd);
  return periodBoundsFromBillingAnchorYmd(billingAnchorYmd, start.toISOString(), billingDayOfMonth);
}

export function periodBoundsFromRenewalPayment(params: {
  previousNextPaymentDueAt: string;
  approvalInstantIso: string;
  billingDayOfMonth: number;
}): {
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextPaymentDueAt: string;
  billingDayOfMonth: number;
} {
  const prevYmd = toSeoulYmd(new Date(params.previousNextPaymentDueAt));
  const nextDueYmd = addOneBillingMonthYmd(prevYmd, params.billingDayOfMonth);
  const planExpiresOn = addCalendarDaysYmd(nextDueYmd, -1);
  return {
    currentPeriodStart: params.approvalInstantIso,
    currentPeriodEnd: endOfSeoulDayIso(planExpiresOn),
    nextPaymentDueAt: startOfSeoulDayIso(nextDueYmd),
    billingDayOfMonth: params.billingDayOfMonth,
  };
}
