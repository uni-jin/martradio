"use client";

import { useEffect, useMemo, useState } from "react";
import { getAdminProducts, getPaymentsForUser } from "@/lib/adminData";
import type { PlanId } from "@/lib/auth";
import { getCurrentUser, getPlanLabel } from "@/lib/auth";
import {
  effectivePlanIdForSubscriptionUi,
  isPaidSubscriptionPlanId,
  resolveSubscriptionPeriodDisplayIso,
} from "@/lib/subscriptionUi";
import {
  billingDatesFromApprovedAt,
  billingPeriodsForPaymentHistoryOldestFirst,
} from "@/lib/subscriptionPeriod";

function formatKrw(n: number) {
  return new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" }).format(n);
}

function formatDateKo(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ko-KR", { dateStyle: "medium" });
}

function formatYmdAsKo(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  return formatDateKo(`${ymd}T12:00:00+09:00`);
}

export default function SubscriptionPage() {
  const [localPlanId, setLocalPlanId] = useState<string>("free");
  const [subscriptionFromApi, setSubscriptionFromApi] = useState<{
    planId?: string;
    cancelRequested?: boolean;
    scheduledPlanAfterPeriod?: string | null;
    currentPeriodEnd?: string | null;
    nextPaymentDueAt?: string | null;
  } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"request-cancel" | "revoke-cancel" | null>(null);
  const [isUpdatingCancelState, setIsUpdatingCancelState] = useState(false);
  const applySubscriptionSnapshot = (
    raw: unknown
  ): {
    planId?: string;
    cancelRequested?: boolean;
    scheduledPlanAfterPeriod?: string | null;
    currentPeriodEnd?: string | null;
    nextPaymentDueAt?: string | null;
  } | null => {
    const sub = (raw ?? null) as {
      planId?: string;
      cancelRequested?: boolean;
      scheduledPlanAfterPeriod?: string | null;
      currentPeriodEnd?: string | null;
      nextPaymentDueAt?: string | null;
    } | null;
    setSubscriptionFromApi(sub);
    setCancelRequested(Boolean(sub?.cancelRequested));
    return sub;
  };

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) return;
    setUserId(u.id);
    setUsername(u.email);
    setLocalPlanId(u.planId ?? "free");
    void (async () => {
      try {
        const res = await fetch(`/api/subscription/status?userId=${encodeURIComponent(u.id)}`);
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.ok === true) {
          applySubscriptionSnapshot(data.subscription);
        }
      } catch {
        // noop
      }
    })();
  }, []);

  const handleToggleCancelRequest = () => {
    setConfirmAction(cancelRequested ? "revoke-cancel" : "request-cancel");
  };

  const handleConfirmAction = async () => {
    if (!confirmAction || !userId) return;
    const nextCancelRequested = confirmAction === "request-cancel";
    setIsUpdatingCancelState(true);
    try {
      const res = await fetch("/api/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          cancelRequested: nextCancelRequested,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok !== true) {
        throw new Error(typeof data.error === "string" ? data.error : "구독 상태 변경에 실패했습니다.");
      }
      applySubscriptionSnapshot(data.subscription);
      setConfirmAction(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.alert(msg);
    } finally {
      setIsUpdatingCancelState(false);
    }
  };

  const products = useMemo(() => getAdminProducts(), []);
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;

  const payments = useMemo(() => {
    if (!userId || !username) return [];
    return getPaymentsForUser(userId, username);
  }, [userId, username]);

  const effectivePlanId = useMemo(
    () => effectivePlanIdForSubscriptionUi(subscriptionFromApi, localPlanId, payments),
    [subscriptionFromApi, localPlanId, payments]
  );

  const planText = useMemo(
    () => getPlanLabel((effectivePlanId || "free") as PlanId, false),
    [effectivePlanId]
  );

  const { currentPeriodEndIso, nextPaymentDueIso } = useMemo(
    () => resolveSubscriptionPeriodDisplayIso({ server: subscriptionFromApi, payments }),
    [subscriptionFromApi, payments]
  );

  const paymentBillingById = useMemo(() => {
    const asc = [...payments].sort(
      (a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime()
    );
    const periods = billingPeriodsForPaymentHistoryOldestFirst(asc, {
      serverCurrentPeriodEndIso: subscriptionFromApi?.currentPeriodEnd ?? null,
    });
    const m = new Map<string, { planExpiresOn: string; nextPaymentDueOn: string }>();
    asc.forEach((p, i) => {
      const row = periods[i];
      if (row) m.set(p.id, row);
    });
    return m;
  }, [payments, subscriptionFromApi?.currentPeriodEnd]);

  const planExpiryDateText = useMemo(() => {
    if (!isPaidSubscriptionPlanId(effectivePlanId)) return "없음";
    if (currentPeriodEndIso) return formatDateKo(currentPeriodEndIso);
    return "—";
  }, [currentPeriodEndIso, effectivePlanId]);

  const nextPaymentDateText = useMemo(() => {
    if (!isPaidSubscriptionPlanId(effectivePlanId)) return "없음";
    if (cancelRequested) return null;
    if (nextPaymentDueIso) return formatDateKo(nextPaymentDueIso);
    return "—";
  }, [cancelRequested, effectivePlanId, nextPaymentDueIso]);

  const scheduledAfterLabel = useMemo(() => {
    const id = subscriptionFromApi?.scheduledPlanAfterPeriod;
    if (!id || id === "free") return null;
    return getPlanLabel(id as PlanId, false);
  }, [subscriptionFromApi?.scheduledPlanAfterPeriod]);

  const currentPlanFeatures = useMemo(() => {
    if (effectivePlanId === "small" || effectivePlanId === "medium") {
      return ["방송 글자 수 제한: 500자", "기존 방송 저장 수: 5개"];
    }
    if (effectivePlanId === "large") {
      return ["방송 글자 수 제한: 무제한", "기존 방송 저장 수: 무제한"];
    }
    return ["방송 글자 수 제한: 50자", "기존 방송 저장 수: 1개"];
  }, [effectivePlanId]);

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold text-stone-800">구독 관리</h1>

        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xl font-semibold text-stone-800">{planText || "—"}</p>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                  이용중
                </span>
                {cancelRequested && (
                  <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700">
                    해지신청 완료
                  </span>
                )}
              </div>
              <div className="mt-3 space-y-1 text-sm text-stone-600">
                {currentPlanFeatures.map((feature) => (
                  <p key={feature}>{feature}</p>
                ))}
                <p>
                  플랜 만료일:{" "}
                  <span className="font-medium text-stone-800">{planExpiryDateText}</span>
                </p>
                {isPaidSubscriptionPlanId(effectivePlanId) && nextPaymentDateText !== null && (
                  <p>
                    다음 결제 예정일:{" "}
                    <span className="font-medium text-stone-800">{nextPaymentDateText}</span>
                  </p>
                )}
                {isPaidSubscriptionPlanId(effectivePlanId) &&
                  scheduledAfterLabel &&
                  !cancelRequested && (
                    <p className="text-amber-800">
                      다음 결제일부터{" "}
                      <span className="font-medium text-amber-900">{scheduledAfterLabel}</span> 플랜으로
                      갱신 예정입니다. 이번 기간까지는 현재 플랜이 유지됩니다.
                    </p>
                  )}
              </div>
            </div>
            {isPaidSubscriptionPlanId(effectivePlanId) ? (
              <button
                type="button"
                onClick={handleToggleCancelRequest}
                disabled={isUpdatingCancelState}
                className="shrink-0 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                {cancelRequested ? "자동결제 해지 취소" : "구독 취소"}
              </button>
            ) : null}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-sm font-semibold text-stone-800">결제 내역</h2>
          {payments.length === 0 ? (
            <p className="mt-3 rounded-xl border border-stone-100 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
              결제 내역이 없습니다. 플랜 구독 화면에서 유료 플랜을 구독해 보세요.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-stone-50 text-xs text-stone-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">결제일</th>
                    <th className="px-3 py-2 font-medium">플랜</th>
                    <th className="px-3 py-2 font-medium">금액</th>
                    <th className="px-3 py-2 font-medium">플랜 만료일</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const b =
                      paymentBillingById.get(p.id) ?? billingDatesFromApprovedAt(p.paidAt);
                    return (
                      <tr key={p.id} className="border-t border-stone-100">
                        <td className="px-3 py-2 text-stone-800">{formatDateKo(p.paidAt)}</td>
                        <td className="px-3 py-2 text-stone-800">{productName(p.productId)}</td>
                        <td className="px-3 py-2 text-stone-800">{formatKrw(p.amount)}</td>
                        <td className="px-3 py-2 text-stone-600">{formatYmdAsKo(b.planExpiresOn)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-8 text-xs text-stone-700">
          <h2 className="font-semibold text-stone-800">구독 안내</h2>
          <div className="mt-4 space-y-4 text-xs leading-relaxed text-stone-700">
            <div>
              <h3 className="font-semibold text-stone-800">1. 결제 및 갱신</h3>
              <p className="mt-1">유료 플랜은 월 구독 형태로 제공됩니다.</p>
              <p>구독 요금은 최초 결제일의 &apos;일&apos;을 기준으로 매월 같은 날짜에 자동 결제됩니다.</p>
              <p>해당 월에 그 날짜가 없으면 그 달의 말일에 결제되며, 다음 달부터는 다시 기준일에 맞춰 결제됩니다.</p>
              <p>결제일이 없는 달에는 말일에 결제됩니다.</p>
              <p>(예: 5월 31일 결제 → 6월 30일 자동 결제 → 7월 31일 자동 결제)</p>
              <p>(예: 3월 5일 결제 → 4월 5일 자동 결제)</p>
              <p>구독은 해지하지 않는 한 자동으로 갱신됩니다.</p>
            </div>

            <div>
              <h3 className="font-semibold text-stone-800">2. 플랜 변경 (업그레이드 / 다운그레이드)</h3>
              <p className="mt-1">1) 상위 플랜으로 변경 (기본 → 무제한)</p>
              <p>즉시 상위 플랜이 적용됩니다.</p>
              <p>남은 기간에 대해 차액이 일할 계산되어 추가 결제됩니다.</p>
              <p className="mt-1">2) 하위 플랜으로 변경 (무제한 → 기본)</p>
              <p>다음 결제일부터 하위 플랜이 적용됩니다.</p>
              <p>현재 이용 기간 동안은 기존 플랜이 유지됩니다.</p>
            </div>

            <div>
              <h3 className="font-semibold text-stone-800">3. 해지 정책</h3>
              <p className="mt-1">구독은 언제든지 해지할 수 있습니다.</p>
              <p>해지 시 다음 결제일부터 요금이 청구되지 않습니다.</p>
              <p>예약된 하위 플랜 변경이 있으면 해지와 함께 취소됩니다.</p>
              <p>해지 후에도 현재 결제 기간 종료일까지는 서비스를 이용할 수 있습니다.</p>
            </div>

            <div>
              <h3 className="font-semibold text-stone-800">4. 환불 정책</h3>
              <p className="mt-1">결제 완료 후 환불은 제공되지 않습니다.</p>
            </div>

            <div>
              <h3 className="font-semibold text-stone-800">5. 사용 제한 안내</h3>
              <p className="mt-1">
                각 요금제에 따라 방송 글자 수 및 저장 가능한 방송 수에 제한이 있습니다.
              </p>
              <p>제한 초과 시 추가 생성 또는 저장이 불가할 수 있습니다.</p>
            </div>

            <div>
              <h3 className="font-semibold text-stone-800">6. 데이터 보관</h3>
              <p className="mt-1">플랜 변경 또는 해지 시 저장된 방송이 일부 제한될 수 있습니다.</p>
              <p>(예: 저장 개수 제한 초과 시 일부 방송이 비활성화될 수 있음)</p>
            </div>
          </div>
        </section>
      </div>

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-stone-800">확인</h2>
            <p className="mt-2 text-sm text-stone-700">
              {confirmAction === "request-cancel"
                ? subscriptionFromApi?.scheduledPlanAfterPeriod
                  ? "구독을 해지하면 자동결제가 중지되고, 예약된 하위 플랜 변경도 함께 취소됩니다. 계속할까요?"
                  : "구독을 취소하고 자동결제를 해지하시겠습니까?"
                : "자동결제 해지를 취소하시겠습니까?"}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={isUpdatingCancelState}
                onClick={() => setConfirmAction(null)}
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isUpdatingCancelState}
                onClick={handleConfirmAction}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {isUpdatingCancelState ? "처리 중..." : "확인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
