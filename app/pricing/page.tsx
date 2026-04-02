"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appendUserPayment } from "@/lib/adminData";
import {
  getCurrentUser,
  getPlanLabel,
  getStoredUserForCurrentSession,
  PlanId,
  updateCurrentUserPlan,
} from "@/lib/auth";
import { computePaidPlanUpgradeChargeKrw } from "@/lib/subscriptionUpgrade";
import {
  getPlanAmount,
  paidPlanTierRank,
  type PaidPlanId,
} from "@/lib/subscriptionPlans";

function isPaidPlanId(planId: string | null | undefined): planId is PaidPlanId {
  return planId === "small" || planId === "medium" || planId === "large";
}

function loadTossPaymentsScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as unknown as { TossPayments?: unknown }).TossPayments) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-toss-payments="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("토스 결제 스크립트 로드에 실패했습니다.")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.tosspayments.com/v1/payment";
    script.async = true;
    script.dataset.tossPayments = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("토스 결제 스크립트 로드에 실패했습니다."));
    document.head.appendChild(script);
  });
}

const PLANS: {
  id: PlanId;
  name: string;
  features: string[];
  price: string;
}[] = [
  {
    id: "free",
    name: "무료",
    features: ["방송 글자 수 제한: 50자", "기존 방송 저장 수: 1개"],
    price: "무료",
  },
  {
    id: "small",
    name: "기본 플랜",
    features: ["방송 글자 수 제한: 500자", "기존 방송 저장 수: 5개"],
    price: "월 9,900원",
  },
  {
    id: "large",
    name: "무제한 플랜",
    features: ["방송 글자 수 제한: 무제한", "기존 방송 저장 수: 무제한"],
    price: "월 19,900원",
  },
];

type ServerSubscriptionSnapshot = {
  planId?: string;
  scheduledPlanAfterPeriod?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  nextPaymentDueAt?: string | null;
} | null;

export default function PricingPage() {
  const [currentPlan, setCurrentPlan] = useState<PlanId | undefined>(undefined);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [serverLoaded, setServerLoaded] = useState(false);
  const [serverSubscription, setServerSubscription] = useState<ServerSubscriptionSnapshot>(null);
  const [hasBillingMethod, setHasBillingMethod] = useState(false);
  const handledCheckoutRef = useRef(false);

  const refreshServerSubscription = useCallback(async () => {
    const user = getCurrentUser();
    if (!user?.id) {
      setServerSubscription(null);
      setHasBillingMethod(false);
      setServerLoaded(true);
      return;
    }
    try {
      const res = await fetch(`/api/subscription/status?userId=${encodeURIComponent(user.id)}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok === true) {
        setServerSubscription((data.subscription ?? null) as ServerSubscriptionSnapshot);
        setHasBillingMethod(Boolean(data.hasBillingMethod));
      } else {
        setServerSubscription(null);
        setHasBillingMethod(false);
      }
    } catch {
      setServerSubscription(null);
      setHasBillingMethod(false);
    } finally {
      setServerLoaded(true);
    }
  }, []);

  useEffect(() => {
    const user = getCurrentUser();
    setUserEmail(user?.email ?? null);
    setCurrentPlan(user?.planId);
    void refreshServerSubscription();
  }, [refreshServerSubscription]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (handledCheckoutRef.current) return;
    const url = new URL(window.location.href);
    const checkout = url.searchParams.get("checkout");
    if (!checkout) return;

    const clearQuery = () => {
      const clean = new URL(window.location.href);
      clean.searchParams.delete("checkout");
      clean.searchParams.delete("planId");
      clean.searchParams.delete("customerKey");
      clean.searchParams.delete("authKey");
      clean.searchParams.delete("paymentKey");
      clean.searchParams.delete("orderId");
      clean.searchParams.delete("amount");
      clean.searchParams.delete("code");
      clean.searchParams.delete("message");
      window.history.replaceState(null, "", clean.pathname + clean.search);
    };

    if (checkout === "fail" || checkout === "billing_fail") {
      const msg = url.searchParams.get("message") || "결제가 취소되었거나 실패했습니다.";
      clearQuery();
      window.alert(msg);
      return;
    }

    if (checkout !== "success" && checkout !== "billing_success") {
      clearQuery();
      return;
    }

    if (checkout === "billing_success") {
      const planId = url.searchParams.get("planId");
      const customerKey = url.searchParams.get("customerKey");
      const authKey = url.searchParams.get("authKey");
      const successToken = `${planId ?? ""}:${customerKey ?? ""}:${authKey ?? ""}`;
      const successGuardKey = "mart-radio-pricing-last-billing-success-token";
      if (!isPaidPlanId(planId) || !customerKey || !authKey) {
        clearQuery();
        window.alert("카드 등록 완료 정보가 올바르지 않습니다.");
        return;
      }
      if (window.sessionStorage.getItem(successGuardKey) === successToken) {
        handledCheckoutRef.current = true;
        clearQuery();
        return;
      }
      handledCheckoutRef.current = true;
      window.sessionStorage.setItem(successGuardKey, successToken);

      const runBilling = async () => {
        try {
          const user = getCurrentUser();
          if (!user?.id) throw new Error("로그인 정보를 찾을 수 없습니다.");
          const activateRes = await fetch("/api/subscription/billing/activate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.id, planId, customerKey, authKey }),
          });
          const activateData = await activateRes.json().catch(() => ({}));
          if (!activateRes.ok || !activateData.ok) {
            throw new Error(
              typeof activateData.error === "string"
                ? activateData.error
                : "정기결제 시작에 실패했습니다."
            );
          }
          const before = getCurrentUser();
          if (activateData.kind === "scheduled_downgrade") {
            await refreshServerSubscription();
            window.alert(
              `${getPlanLabel(planId, false)}(으)로 변경이 예약되었습니다.\n` +
                "이번 이용 기간까지는 현재 플랜이 유지되며, 추가 카드 입력 없이 다음 결제일부터 적용됩니다."
            );
          } else {
            const updated = updateCurrentUserPlan(planId);
            if (before) {
              const stored = getStoredUserForCurrentSession();
              const amt =
                typeof activateData.amount === "number" && Number.isFinite(activateData.amount)
                  ? activateData.amount
                  : getPlanAmount(planId);
              appendUserPayment({
                userId: before.id,
                username: before.email,
                productId: planId,
                amount: amt,
                referrerId: stored?.referrerId ?? null,
                source: "web_checkout",
                paymentKey:
                  typeof activateData.paymentKey === "string" ? activateData.paymentKey : null,
                orderId: typeof activateData.orderId === "string" ? activateData.orderId : null,
                status: "DONE",
              });
            }
            setCurrentPlan(updated?.planId);
            window.alert(
              activateData.kind === "upgrade"
                ? `${getPlanLabel(planId, false)}(으)로 업그레이드되었습니다.\n등록하신 카드로 차액이 결제되었습니다.`
                : `${getPlanLabel(planId, false)} 구독이 시작되었습니다.`
            );
          }
          await refreshServerSubscription();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          window.alert(msg);
        } finally {
          clearQuery();
        }
      };
      void runBilling();
      return;
    }

    const planId = url.searchParams.get("planId");
    const paymentKey = url.searchParams.get("paymentKey");
    const orderId = url.searchParams.get("orderId");
    const amountRaw = url.searchParams.get("amount");
    const amount = amountRaw ? Number(amountRaw) : NaN;
    const successToken = `${planId ?? ""}:${orderId ?? ""}:${paymentKey ?? ""}:${amountRaw ?? ""}`;
    const successGuardKey = "mart-radio-pricing-last-success-token";

    if (!isPaidPlanId(planId) || !paymentKey || !orderId || !Number.isFinite(amount)) {
      clearQuery();
      window.alert("결제 완료 정보가 올바르지 않습니다.");
      return;
    }
    if (window.sessionStorage.getItem(successGuardKey) === successToken) {
      handledCheckoutRef.current = true;
      clearQuery();
      return;
    }
    handledCheckoutRef.current = true;
    window.sessionStorage.setItem(successGuardKey, successToken);

    const run = async () => {
      try {
        const user = getCurrentUser();
        if (!user?.id) {
          throw new Error("로그인 정보를 찾을 수 없습니다.");
        }
        const confirmRes = await fetch("/api/subscription/checkout/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, planId, orderId, paymentKey, amount }),
        });
        const confirmData = await confirmRes.json().catch(() => ({}));
        if (!confirmRes.ok || !confirmData.ok) {
          throw new Error(
            typeof confirmData.error === "string" ? confirmData.error : "결제 승인 검증에 실패했습니다."
          );
        }

        const before = getCurrentUser();
        const updated = updateCurrentUserPlan(planId);
        if (before) {
          const stored = getStoredUserForCurrentSession();
          appendUserPayment({
            userId: before.id,
            username: before.email,
            productId: planId,
            amount,
            referrerId: stored?.referrerId ?? null,
            source: "web_checkout",
            paymentKey,
            orderId,
            status: "DONE",
          });
        }
        setCurrentPlan(updated?.planId);
        window.alert(`${getPlanLabel(planId, false)} 구독이 시작되었습니다.`);
        await refreshServerSubscription();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        window.alert(msg);
      } finally {
        clearQuery();
      }
    };
    void run();
  }, [refreshServerSubscription]);

  const displayCurrentPlanId = useMemo((): PlanId => {
    const sid = serverSubscription?.planId;
    if (isPaidPlanId(sid)) return sid;
    return (currentPlan ?? "free") as PlanId;
  }, [serverSubscription?.planId, currentPlan]);

  const effectivePaidPlanId = useMemo((): PaidPlanId | null => {
    return isPaidPlanId(displayCurrentPlanId) ? displayCurrentPlanId : null;
  }, [displayCurrentPlanId]);

  const canUseStoredBilling = Boolean(
    serverLoaded && hasBillingMethod && effectivePaidPlanId && userEmail
  );

  const handleSelectPlan = (planId: PlanId) => {
    if (planId === "free") {
      return;
    }
    if (!userEmail) {
      setMessage("로그인 후 플랜을 선택할 수 있습니다.");
      return;
    }
    setPendingPlan(planId);
    setMessage(null);
  };

  const modalHint = useMemo(() => {
    if (!pendingPlan || !effectivePaidPlanId) return null;
    if (pendingPlan === "free") return null;
    if (pendingPlan === effectivePaidPlanId) return { kind: "same" as const };
    if (paidPlanTierRank(pendingPlan) > paidPlanTierRank(effectivePaidPlanId)) {
      let estimate: number | null = null;
      const sub = serverSubscription;
      if (
        sub?.currentPeriodStart &&
        sub?.currentPeriodEnd &&
        isPaidPlanId(sub.planId)
      ) {
        const c = computePaidPlanUpgradeChargeKrw({
          fromPlanId: sub.planId as PaidPlanId,
          toPlanId: pendingPlan,
          currentPeriodStartIso: sub.currentPeriodStart,
          currentPeriodEndIso: sub.currentPeriodEnd,
          approvalIso: new Date().toISOString(),
        });
        estimate = c.chargeKrw;
      }
      return { kind: "upgrade" as const, estimateKrw: estimate };
    }
    if (paidPlanTierRank(pendingPlan) < paidPlanTierRank(effectivePaidPlanId)) {
      return { kind: "downgrade" as const };
    }
    return { kind: "other" as const };
  }, [pendingPlan, effectivePaidPlanId, serverSubscription]);

  const handleConfirmPlan = async () => {
    if (!pendingPlan) return;
    const user = getCurrentUser();
    if (!user?.id) {
      window.alert("로그인 정보를 찾을 수 없습니다.");
      return;
    }
    const customerKey = `mart_${user.id}`;
    const chosenPlan = pendingPlan;

    if (effectivePaidPlanId && chosenPlan === effectivePaidPlanId) {
      window.alert("이미 해당 플랜을 이용 중입니다.");
      return;
    }

    if (!serverLoaded) {
      window.alert("구독 정보를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    const useStored = canUseStoredBilling && effectivePaidPlanId;

    if (useStored) {
      const lines: string[] = [
        "등록하신 카드로 처리합니다. 카드 번호를 다시 입력하지 않습니다.",
        "",
      ];
      if (modalHint?.kind === "upgrade") {
        lines.push(
          "즉시 상위 플랜이 적용되며, 남은 기간에 대한 차액이 일할 계산되어 결제됩니다.",
          modalHint.estimateKrw !== null
            ? `(예상 결제액: ${new Intl.NumberFormat("ko-KR").format(modalHint.estimateKrw)}원, 실제는 승인 시점 기준)`
            : ""
        );
      } else if (modalHint?.kind === "downgrade") {
        lines.push(
          "이번 이용 기간까지는 현재 플랜이 유지됩니다.",
          "추가 결제는 없으며, 다음 결제일부터 선택하신 하위 플랜 요금이 청구됩니다."
        );
      }
      lines.push("", "위 내용대로 진행할까요?");
      if (!window.confirm(lines.filter(Boolean).join("\n"))) return;
    }

    setIsProcessingCheckout(true);
    try {
      if (useStored) {
        const activateRes = await fetch("/api/subscription/billing/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            planId: chosenPlan,
            customerKey,
            useExistingBilling: true,
          }),
        });
        const activateData = await activateRes.json().catch(() => ({}));
        if (!activateRes.ok || !activateData.ok) {
          throw new Error(
            typeof activateData.error === "string"
              ? activateData.error
              : "플랜 변경에 실패했습니다."
          );
        }
        setPendingPlan(null);
        await refreshServerSubscription();
        if (activateData.kind === "scheduled_downgrade") {
          window.alert(
            `${getPlanLabel(chosenPlan, false)}(으)로 변경이 예약되었습니다.\n` +
              "이번 기간까지 현재 플랜이 유지되며, 다음 결제일부터 적용됩니다."
          );
        } else {
          const before = getCurrentUser();
          const updated = updateCurrentUserPlan(chosenPlan);
          if (before && typeof activateData.amount === "number" && activateData.amount > 0) {
            const stored = getStoredUserForCurrentSession();
            appendUserPayment({
              userId: before.id,
              username: before.email,
              productId: chosenPlan,
              amount: activateData.amount,
              referrerId: stored?.referrerId ?? null,
              source: "web_checkout",
              paymentKey:
                typeof activateData.paymentKey === "string" ? activateData.paymentKey : null,
              orderId: typeof activateData.orderId === "string" ? activateData.orderId : null,
              status: "DONE",
            });
          }
          setCurrentPlan(updated?.planId);
          window.alert(
            `${getPlanLabel(chosenPlan, false)}(으)로 변경되었습니다.\n등록하신 카드로 결제가 완료되었습니다.`
          );
        }
        return;
      }

      const tossClientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
      if (!tossClientKey) {
        throw new Error("NEXT_PUBLIC_TOSS_CLIENT_KEY가 설정되지 않았습니다.");
      }

      await loadTossPaymentsScript();
      const tossCtor = (window as unknown as { TossPayments?: (clientKey: string) => any }).TossPayments;
      if (!tossCtor) throw new Error("토스 결제 객체를 불러오지 못했습니다.");
      const toss = tossCtor(tossClientKey);

      const origin = window.location.origin;
      if (
        !window.confirm(
          "토스 화면에서 카드 정보를 입력합니다.\n최초 구독이거나 결제 수단을 새로 등록할 때만 필요합니다."
        )
      ) {
        return;
      }
      await toss.requestBillingAuth("카드", {
        customerKey,
        customerEmail: userEmail ?? undefined,
        customerName: userEmail ?? "마트방송 사용자",
        successUrl: `${origin}/pricing?checkout=billing_success&planId=${chosenPlan}`,
        failUrl: `${origin}/pricing?checkout=billing_fail`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.alert(msg);
    } finally {
      setIsProcessingCheckout(false);
    }
  };

  const handleCancelModal = () => {
    setPendingPlan(null);
  };

  const scheduledTargetId = serverSubscription?.scheduledPlanAfterPeriod;
  const scheduledTargetLabel =
    scheduledTargetId && isPaidPlanId(scheduledTargetId)
      ? getPlanLabel(scheduledTargetId, false)
      : null;

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold text-stone-800">플랜 구독</h1>

        {scheduledTargetLabel && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">다음 결제일부터 플랜 변경 예정</p>
            <p className="mt-1 text-amber-800">
              {scheduledTargetLabel} 플랜으로 갱신됩니다. 이번 이용 기간까지는 현재 플랜 혜택이 유지됩니다.
            </p>
          </div>
        )}

        {message && (
          <p className="mt-3 text-sm text-amber-800" role="status">
            {message}
          </p>
        )}

        <section className="mt-6 space-y-4">
          {PLANS.map((plan) => {
            const isCurrent = plan.id === displayCurrentPlanId;
            const isFreePlan = plan.id === "free";
            const content = (
              <div className="flex items-center justify-between gap-6">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-stone-800">{plan.name}</h2>
                    {isCurrent && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                        현재 플랜
                      </span>
                    )}
                  </div>
                  <div className="mt-3 space-y-0.5 text-base leading-relaxed text-stone-500">
                    {plan.features.map((feature) => (
                      <p key={feature}>{feature}</p>
                    ))}
                  </div>
                </div>
                <p className="shrink-0 text-xl font-semibold text-stone-900">{plan.price}</p>
              </div>
            );

            if (isFreePlan) {
              return (
                <div
                  key={plan.id}
                  className={`h-36 w-full rounded-2xl border p-5 text-sm shadow-sm ${
                    isCurrent ? "border-amber-500 bg-amber-50" : "border-stone-200 bg-white"
                  }`}
                >
                  {content}
                </div>
              );
            }

            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => handleSelectPlan(plan.id)}
                className={`block h-36 w-full text-left rounded-2xl border p-5 text-sm shadow-sm transition ${
                  isCurrent
                    ? "border-amber-500 bg-amber-50"
                    : "border-stone-200 bg-white hover:border-amber-300 hover:bg-amber-50/40"
                }`}
              >
                {content}
              </button>
            );
          })}
        </section>

        <section className="mt-8 text-xs text-stone-700">
          <h2 className="font-semibold text-stone-800">구독 안내</h2>

          <div className="mt-4 space-y-4 text-xs leading-relaxed text-stone-700">
            <div>
              <h3 className="font-semibold text-stone-800">1. 결제 및 갱신</h3>
              <p className="mt-1">유료 플랜은 월 구독 형태로 제공됩니다.</p>
              <p>구독 요금은 매월 동일한 날짜에 자동 결제됩니다.</p>
              <p>(예: 3월 5일 결제 → 4월 5일 자동 결제)</p>
              <p>구독은 해지하지 않는 한 자동으로 갱신됩니다.</p>
            </div>

            <div>
              <h3 className="font-semibold text-stone-800">2. 플랜 변경 (업그레이드 / 다운그레이드)</h3>
              <p className="mt-1">1) 상위 플랜으로 변경 (기본 → 무제한)</p>
              <p>즉시 상위 플랜이 적용됩니다.</p>
              <p>남은 기간에 대해 차액이 일할 계산되어 추가 결제됩니다.</p>
              <p className="mt-1">등록된 카드가 있으면 카드 번호를 다시 입력하지 않고 결제됩니다.</p>
              <p className="mt-1">2) 하위 플랜으로 변경 (무제한 → 기본)</p>
              <p>다음 결제일부터 하위 플랜이 적용됩니다.</p>
              <p>현재 이용 기간 동안은 기존 플랜이 유지됩니다.</p>
              <p>추가 결제 없이 예약만 하며, 등록된 카드가 있으면 카드 입력 없이 처리됩니다.</p>
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

        {pendingPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
              <h2 className="text-lg font-semibold text-stone-800">플랜 변경 확인</h2>
              <p className="mt-2 text-sm text-stone-600">
                <span className="font-medium text-amber-700">{getPlanLabel(pendingPlan, false)}</span>
                {effectivePaidPlanId && modalHint?.kind !== "same" ? (
                  <>
                    {" "}
                    (으)로 변경합니다. 현재: {getPlanLabel(effectivePaidPlanId, false)}
                  </>
                ) : (
                  <> (으)로 구독합니다.</>
                )}
              </p>
              {canUseStoredBilling && effectivePaidPlanId && modalHint?.kind === "upgrade" && (
                <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-stone-600">
                  <li>등록된 카드로만 결제합니다. 카드 번호를 다시 입력하지 않습니다.</li>
                  <li>즉시 상위 플랜이 적용되고, 남은 기간 일할 차액이 청구됩니다.</li>
                  {modalHint.estimateKrw !== null && (
                    <li>예상 결제액: {new Intl.NumberFormat("ko-KR").format(modalHint.estimateKrw)}원</li>
                  )}
                </ul>
              )}
              {canUseStoredBilling && effectivePaidPlanId && modalHint?.kind === "downgrade" && (
                <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-stone-600">
                  <li>등록된 카드 정보를 다시 입력하지 않습니다.</li>
                  <li>지금은 추가 결제가 없습니다.</li>
                  <li>이번 이용 기간까지 현재 플랜이 유지됩니다.</li>
                  <li>다음 결제일부터 선택하신 플랜 요금이 청구됩니다.</li>
                </ul>
              )}
              {!canUseStoredBilling && effectivePaidPlanId && (
                <p className="mt-3 text-xs text-stone-500">
                  결제 수단이 없거나 최초 구독인 경우, 다음 단계에서 토스 화면으로 카드 정보를 입력합니다.
                </p>
              )}
              <div className="mt-4 flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  disabled={isProcessingCheckout || !serverLoaded}
                  onClick={handleCancelModal}
                  className="rounded-full border border-stone-300 px-3 py-1 text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                >
                  닫기
                </button>
                <button
                  type="button"
                  disabled={isProcessingCheckout || !serverLoaded}
                  onClick={handleConfirmPlan}
                  className="rounded-full bg-amber-500 px-3 py-1 font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  {isProcessingCheckout ? "처리 중..." : "진행"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
