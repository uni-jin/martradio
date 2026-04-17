"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAdminProducts, getPaymentsForUser } from "@/lib/adminData";
import type { PlanId } from "@/lib/auth";
import { getCurrentUser, getPlanLabel, refreshCurrentUser } from "@/lib/auth";
import {
  effectivePlanIdForSubscriptionUi,
  isPaidSubscriptionPlanId,
  resolveSubscriptionPeriodDisplayIso,
} from "@/lib/subscriptionUi";
import {
  billingDatesFromApprovedAt,
  billingPeriodsForPaymentHistoryOldestFirst,
} from "@/lib/subscriptionPeriod";
import { isPaidPlanId } from "@/lib/subscriptionPlans";
import { SubscriptionFlowDialog } from "@/app/_components/SubscriptionFlowDialog";
import { SubscriptionGuideSection } from "@/app/_components/SubscriptionGuideSection";

type SubscriptionPageFlow =
  | null
  | {
      variant: "notify";
      title: string;
      message: string;
      afterDismiss?: () => void;
    }
  | {
      variant: "confirm";
      title: string;
      message: string;
      onConfirm: () => void | Promise<void>;
    };

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
  const [isCancellingScheduled, setIsCancellingScheduled] = useState(false);
  const [flowDialog, setFlowDialog] = useState<SubscriptionPageFlow>(null);
  const [flowDialogBusy, setFlowDialogBusy] = useState(false);
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

  const refreshSubscriptionFromServer = useCallback(async () => {
    const u = await refreshCurrentUser();
    if (!u?.id) return;
    try {
      const res = await fetch(`/api/subscription/status?userId=${encodeURIComponent(u.id)}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok === true) {
        applySubscriptionSnapshot(data.subscription);
      }
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const u = await refreshCurrentUser();
      if (!u) return;
      setUserId(u.id);
      setUsername(u.email);
      setLocalPlanId(u.planId ?? "free");
      await refreshSubscriptionFromServer();
    })();
  }, [refreshSubscriptionFromServer]);

  const runCancelScheduledReservation = useCallback(async (): Promise<
    { ok: true } | { ok: false; message: string }
  > => {
    if (!userId) {
      return { ok: false, message: "로그인 정보를 찾을 수 없습니다." };
    }
    try {
      const res = await fetch("/api/subscription/cancel-scheduled-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "예약 취소에 실패했습니다."
        );
      }
      await refreshSubscriptionFromServer();
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "예약 취소에 실패했습니다.",
      };
    }
  }, [userId, refreshSubscriptionFromServer]);

  const handleCancelScheduledFromBanner = () => {
    if (isCancellingScheduled) return;
    setFlowDialog({
      variant: "confirm",
      title: "구독 변경 예약 취소",
      message: "예약을 취소할까요?",
      onConfirm: () => {
        void (async () => {
          setFlowDialogBusy(true);
          setIsCancellingScheduled(true);
          try {
            const result = await runCancelScheduledReservation();
            if (result.ok) {
              setFlowDialog({
                variant: "notify",
                title: "완료",
                message: "예약이 취소되었습니다.",
              });
            } else {
              setFlowDialog({
                variant: "notify",
                title: "안내",
                message: result.message,
              });
            }
          } finally {
            setFlowDialogBusy(false);
            setIsCancellingScheduled(false);
          }
        })();
      },
    });
  };

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
      setFlowDialog({ variant: "notify", title: "안내", message: msg });
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

  const scheduledTargetId = subscriptionFromApi?.scheduledPlanAfterPeriod;
  const scheduledTargetLabel =
    scheduledTargetId && isPaidPlanId(scheduledTargetId)
      ? getPlanLabel(scheduledTargetId as PlanId, false)
      : null;

  const currentPlanFeatures = useMemo(() => {
    if (effectivePlanId === "small" || effectivePlanId === "medium") {
      return ["방송문 글자 수 제한: 500자", "기존 방송 저장 수: 5개"];
    }
    if (effectivePlanId === "large") {
      return ["방송문 글자 수 제한: 무제한", "기존 방송 저장 수: 무제한"];
    }
    return ["방송문 글자 수 제한: 100자", "기존 방송 저장 수: 1개"];
  }, [effectivePlanId]);

  return (
    <main className="min-h-full bg-[var(--bg)]">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-bold text-stone-800">구독 관리</h1>

        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xl font-semibold text-stone-800">{planText || "—"}</p>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-sm font-medium text-amber-800">
                  이용중
                </span>
                {cancelRequested && (
                  <span className="rounded-full bg-rose-100 px-2.5 py-1 text-sm font-medium text-rose-700">
                    해지신청 완료
                  </span>
                )}
              </div>
              <div className="mt-3 space-y-1.5 text-base text-stone-600">
                {currentPlanFeatures.map((feature) => (
                  <p key={feature}>{feature}</p>
                ))}
                <p>
                  구독 만료일:{" "}
                  <span className="font-medium text-stone-800">{planExpiryDateText}</span>
                </p>
                {isPaidSubscriptionPlanId(effectivePlanId) && nextPaymentDateText !== null && (
                  <p>
                    다음 결제 예정일:{" "}
                    <span className="font-medium text-stone-800">{nextPaymentDateText}</span>
                  </p>
                )}
              </div>
            </div>
            {isPaidSubscriptionPlanId(effectivePlanId) ? (
              <button
                type="button"
                onClick={handleToggleCancelRequest}
                disabled={isUpdatingCancelState}
                className="shrink-0 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-base font-medium text-stone-700 hover:bg-stone-50"
              >
                {cancelRequested ? "자동결제 해지 취소" : "구독 취소"}
              </button>
            ) : null}
          </div>
        </section>

        {scheduledTargetLabel && !cancelRequested && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">다음 결제일부터 구독 변경 예정</p>
              <p className="mt-1 text-amber-800">
                {scheduledTargetLabel}(으)로 갱신됩니다. 이번 이용 기간까지는 현재 구독 혜택이 유지됩니다.
              </p>
            </div>
            <button
              type="button"
              disabled={isCancellingScheduled || !userId}
              onClick={handleCancelScheduledFromBanner}
              className="shrink-0 rounded-full border border-amber-400 bg-white px-4 py-2 text-sm font-medium text-amber-900 shadow-sm hover:bg-amber-100 disabled:opacity-50"
            >
              {isCancellingScheduled ? "처리 중..." : "구독 변경 예약 취소"}
            </button>
          </div>
        )}

        <section className="mt-6">
          <h2 className="text-lg font-semibold text-stone-800">결제 내역</h2>
          {payments.length === 0 ? (
            <p className="mt-3 rounded-xl border border-stone-100 bg-stone-50 px-4 py-8 text-center text-base text-stone-500">
              결제 내역이 없습니다. 구독 화면에서 유료 방송 상품을 구독해 보세요.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200">
              <table className="min-w-full text-left text-base">
                <thead className="bg-stone-50 text-sm text-stone-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">결제일</th>
                    <th className="px-3 py-2 font-medium">구독</th>
                    <th className="px-3 py-2 font-medium">결제 금액</th>
                    <th className="px-3 py-2 font-medium">구독 만료일</th>
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

        <SubscriptionGuideSection />
      </div>

      {flowDialog && (
        <SubscriptionFlowDialog
          open
          variant={flowDialog.variant}
          title={flowDialog.title}
          message={flowDialog.message}
          confirmBusy={flowDialog.variant === "confirm" ? flowDialogBusy : false}
          onDismiss={() => {
            if (flowDialog.variant === "notify" && flowDialog.afterDismiss) {
              flowDialog.afterDismiss();
            }
            setFlowDialog(null);
          }}
          onConfirm={flowDialog.variant === "confirm" ? flowDialog.onConfirm : undefined}
        />
      )}

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-lg">
            <h2 className="text-xl font-semibold text-stone-800">확인</h2>
            <p className="mt-2 text-base leading-relaxed text-stone-700">
              {confirmAction === "request-cancel"
                ? subscriptionFromApi?.scheduledPlanAfterPeriod
                  ? "구독을 해지하면 자동결제가 중지되고, 예약된 하위 구독 변경도 함께 취소됩니다. 계속할까요?"
                  : "구독을 취소하고 자동결제를 해지하시겠습니까?"
                : "자동결제 해지를 취소하시겠습니까?"}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={isUpdatingCancelState}
                onClick={() => setConfirmAction(null)}
                className="rounded-lg border border-stone-300 px-4 py-2.5 text-base text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isUpdatingCancelState}
                onClick={handleConfirmAction}
                className="rounded-lg bg-amber-500 px-4 py-2.5 text-base font-medium text-white hover:bg-amber-600 disabled:opacity-50"
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
