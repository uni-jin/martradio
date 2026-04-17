"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appendUserPayment } from "@/lib/adminData";
import {
  getCurrentUser,
  getPlanLabel,
  getStoredUserForCurrentSession,
  PlanId,
  refreshCurrentUser,
  updateCurrentUserPlan,
} from "@/lib/auth";
import { computePaidPlanUpgradeChargeKrw } from "@/lib/subscriptionUpgrade";
import {
  getPlanAmount,
  paidPlanTierRank,
  type PaidPlanId,
} from "@/lib/subscriptionPlans";
import { SubscriptionFlowDialog } from "@/app/_components/SubscriptionFlowDialog";
import { SubscriptionGuideSection } from "@/app/_components/SubscriptionGuideSection";

type PricingFlowState =
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
    name: "무료 방송",
    features: ["방송문 글자 수 제한: 100자", "기존 방송 저장 수: 1개"],
    price: "무료",
  },
  {
    id: "small",
    name: "기본 방송",
    features: [
      "방송문 글자 수 제한: 500자",
      "기존 방송 저장 수: 5개",
      "유료 음성 사용 가능",
    ],
    price: "월 9,900원",
  },
  {
    id: "large",
    name: "무제한 방송",
    features: [
      "방송문 글자 수 제한: 무제한",
      "기존 방송 저장 수: 무제한",
      "유료 음성 사용 가능",
    ],
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
  const router = useRouter();
  const [currentPlan, setCurrentPlan] = useState<PlanId | undefined>(undefined);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [serverLoaded, setServerLoaded] = useState(false);
  const [serverSubscription, setServerSubscription] = useState<ServerSubscriptionSnapshot>(null);
  const [hasBillingMethod, setHasBillingMethod] = useState(false);
  const [isCancellingScheduled, setIsCancellingScheduled] = useState(false);
  const [pricingFlow, setPricingFlow] = useState<PricingFlowState>(null);
  const [pricingFlowBusy, setPricingFlowBusy] = useState(false);
  const handledCheckoutRef = useRef(false);

  const refreshServerSubscription = useCallback(async () => {
    const user = await refreshCurrentUser();
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

  const cancelScheduledPlanRequest = useCallback(async (): Promise<
    { ok: true } | { ok: false; message: string }
  > => {
    const user = getCurrentUser();
    if (!user?.id) {
      return { ok: false, message: "로그인 정보를 찾을 수 없습니다." };
    }
    try {
      const res = await fetch("/api/subscription/cancel-scheduled-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        return {
          ok: false,
          message: typeof data.error === "string" ? data.error : "예약 취소에 실패했습니다.",
        };
      }
      await refreshServerSubscription();
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "예약 취소에 실패했습니다.",
      };
    }
  }, [refreshServerSubscription]);

  useEffect(() => {
    void (async () => {
      const user = await refreshCurrentUser();
      setUserEmail(user?.email ?? null);
      setCurrentPlan(user?.planId);
      await refreshServerSubscription();
    })();
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
      setPricingFlow({ variant: "notify", title: "안내", message: msg });
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
        setPricingFlow({
          variant: "notify",
          title: "오류",
          message: "카드 등록 완료 정보가 올바르지 않습니다.",
        });
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
          const user = await refreshCurrentUser();
          if (!user?.id) throw new Error("로그인 정보를 찾을 수 없습니다.");
          const profilePlanId = (await refreshCurrentUser())?.planId ?? "free";
          const activateRes = await fetch("/api/subscription/billing/activate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.id, planId, customerKey, authKey, profilePlanId }),
          });
          const activateData = await activateRes.json().catch(() => ({}));
          if (!activateRes.ok || !activateData.ok) {
            throw new Error(
              typeof activateData.error === "string"
                ? activateData.error
                : "정기결제 시작에 실패했습니다."
            );
          }
          const before = await refreshCurrentUser();
          if (activateData.kind === "scheduled_downgrade") {
            await refreshServerSubscription();
            setPricingFlow({
              variant: "notify",
              title: "완료",
              message: `${getPlanLabel(planId, false)}(으)로 변경이 예약되었습니다.\n다음 결제일부터 적용됩니다.`,
              afterDismiss: () => router.push("/subscription"),
            });
          } else {
            const updated = await updateCurrentUserPlan(planId);
            if (before) {
              const stored = await getStoredUserForCurrentSession();
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
            await refreshServerSubscription();
            setPricingFlow({
              variant: "notify",
              title: "완료",
              message:
                activateData.kind === "upgrade"
                  ? `${getPlanLabel(planId, false)}(으)로 업그레이드되었습니다.`
                  : `${getPlanLabel(planId, false)} 구독이 반영되었습니다.`,
              afterDismiss: () => router.push("/subscription"),
            });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setPricingFlow({ variant: "notify", title: "오류", message: msg });
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
      setPricingFlow({
        variant: "notify",
        title: "오류",
        message: "결제 완료 정보가 올바르지 않습니다.",
      });
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
        const user = await refreshCurrentUser();
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

        const before = await refreshCurrentUser();
        const updated = await updateCurrentUserPlan(planId);
        if (before) {
          const stored = await getStoredUserForCurrentSession();
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
        await refreshServerSubscription();
        setPricingFlow({
          variant: "notify",
          title: "완료",
          message: `${getPlanLabel(planId, false)} 구독이 반영되었습니다.`,
          afterDismiss: () => router.push("/subscription"),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setPricingFlow({ variant: "notify", title: "오류", message: msg });
      } finally {
        clearQuery();
      }
    };
    void run();
  }, [refreshServerSubscription, router]);

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
      setMessage("로그인 후 구독 상품을 선택할 수 있습니다.");
      return;
    }
    if (isCancellingScheduled) return;

    const scheduled = serverSubscription?.scheduledPlanAfterPeriod;
    if (typeof scheduled === "string" && isPaidPlanId(scheduled) && planId === scheduled) {
      setPricingFlow({
        variant: "notify",
        title: "안내",
        message: `${getPlanLabel(planId, false)}(으)로 변경 예정입니다.\n다음 결제일부터 적용됩니다.`,
      });
      return;
    }

    if (
      planId === displayCurrentPlanId &&
      typeof scheduled === "string" &&
      isPaidPlanId(scheduled)
    ) {
      setPricingFlow({
        variant: "confirm",
        title: "예약 취소",
        message: `다음 결제일부터 ${getPlanLabel(scheduled, false)} 구독으로 바뀌는 예약을 취소할까요?`,
        onConfirm: async () => {
          setPricingFlowBusy(true);
          setIsCancellingScheduled(true);
          try {
            const r = await cancelScheduledPlanRequest();
            setPricingFlow(
              r.ok
                ? {
                    variant: "notify",
                    title: "완료",
                    message: "예약이 취소되었습니다. 현재 구독이 유지됩니다.",
                  }
                : { variant: "notify", title: "오류", message: r.message }
            );
          } finally {
            setPricingFlowBusy(false);
            setIsCancellingScheduled(false);
          }
        },
      });
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
      setPricingFlow({
        variant: "notify",
        title: "안내",
        message: "로그인 정보를 찾을 수 없습니다.",
      });
      return;
    }
    const customerKey = `mart_${user.id}`;
    const chosenPlan = pendingPlan;

    if (effectivePaidPlanId && chosenPlan === effectivePaidPlanId) {
      const scheduled = serverSubscription?.scheduledPlanAfterPeriod;
      if (typeof scheduled === "string" && isPaidPlanId(scheduled)) {
        setPricingFlow({
          variant: "confirm",
          title: "예약 취소",
          message: `다음 결제일부터 ${getPlanLabel(scheduled, false)} 구독으로 바뀌는 예약을 취소할까요?`,
          onConfirm: async () => {
            setPricingFlowBusy(true);
            setIsProcessingCheckout(true);
            try {
              const r = await cancelScheduledPlanRequest();
              if (r.ok) {
                setPendingPlan(null);
                setPricingFlow({
                  variant: "notify",
                  title: "완료",
                  message: "예약이 취소되었습니다. 현재 구독이 유지됩니다.",
                });
              } else {
                setPricingFlow({ variant: "notify", title: "오류", message: r.message });
              }
            } finally {
              setPricingFlowBusy(false);
              setIsProcessingCheckout(false);
            }
          },
        });
        return;
      }
      setPricingFlow({
        variant: "notify",
        title: "안내",
        message: "이미 해당 구독을 이용 중입니다.",
      });
      return;
    }

    if (!serverLoaded) {
      setPricingFlow({
        variant: "notify",
        title: "안내",
        message: "구독 정보를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.",
      });
      return;
    }

    const useStored = canUseStoredBilling && effectivePaidPlanId;

    try {
      if (useStored) {
        setIsProcessingCheckout(true);
        try {
          const profilePlanId = (await refreshCurrentUser())?.planId ?? "free";
          const activateRes = await fetch("/api/subscription/billing/activate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: user.id,
              planId: chosenPlan,
              customerKey,
              useExistingBilling: true,
              profilePlanId,
            }),
          });
          const activateData = await activateRes.json().catch(() => ({}));
          if (!activateRes.ok || !activateData.ok) {
            throw new Error(
              typeof activateData.error === "string"
                ? activateData.error
                : "구독 변경에 실패했습니다."
            );
          }
          setPendingPlan(null);
          await refreshServerSubscription();
          if (activateData.kind === "scheduled_downgrade") {
            setPricingFlow({
              variant: "notify",
              title: "완료",
              message: `${getPlanLabel(chosenPlan, false)}(으)로 변경이 예약되었습니다.\n다음 결제일부터 적용됩니다.`,
              afterDismiss: () => router.push("/subscription"),
            });
          } else {
            const before = await refreshCurrentUser();
            const updated = await updateCurrentUserPlan(chosenPlan);
            if (before && typeof activateData.amount === "number" && activateData.amount > 0) {
              const stored = await getStoredUserForCurrentSession();
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
            setPricingFlow({
              variant: "notify",
              title: "완료",
              message: `${getPlanLabel(chosenPlan, false)}(으)로 변경되었습니다.`,
              afterDismiss: () => router.push("/subscription"),
            });
          }
        } finally {
          setIsProcessingCheckout(false);
        }
        return;
      }

      const tossClientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
      if (!tossClientKey) {
        throw new Error("NEXT_PUBLIC_TOSS_CLIENT_KEY가 설정되지 않았습니다.");
      }

      setPricingFlow({
        variant: "confirm",
        title: "카드 등록",
        message: "토스 화면에서 카드 정보를 입력합니다. 계속하시겠습니까?",
        onConfirm: async () => {
          setPricingFlow(null);
          setIsProcessingCheckout(true);
          try {
            await loadTossPaymentsScript();
            const tossCtor = (window as unknown as { TossPayments?: (clientKey: string) => any })
              .TossPayments;
            if (!tossCtor) throw new Error("토스 결제 객체를 불러오지 못했습니다.");
            const toss = tossCtor(tossClientKey);
            const origin = window.location.origin;
            await toss.requestBillingAuth("카드", {
              customerKey,
              customerEmail: userEmail ?? undefined,
              customerName: userEmail ?? "마트방송 사용자",
              successUrl: `${origin}/pricing?checkout=billing_success&planId=${chosenPlan}`,
              failUrl: `${origin}/pricing?checkout=billing_fail`,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setPricingFlow({ variant: "notify", title: "오류", message: msg });
          } finally {
            setIsProcessingCheckout(false);
          }
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setPricingFlow({ variant: "notify", title: "오류", message: msg });
    }
  };

  const handleCancelModal = () => {
    setPendingPlan(null);
  };

  const scheduledTargetId = serverSubscription?.scheduledPlanAfterPeriod;

  return (
    <main className="min-h-full bg-[var(--bg)]">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-bold text-stone-800">구독</h1>

        {message && (
          <p className="mt-3 text-base text-amber-800" role="status">
            {message}
          </p>
        )}

        <section className="mt-6 space-y-4">
          {PLANS.map((plan) => {
            const isCurrent = plan.id === displayCurrentPlanId;
            const isFreePlan = plan.id === "free";
            const isScheduledTarget =
              Boolean(scheduledTargetId) &&
              isPaidPlanId(scheduledTargetId) &&
              plan.id === scheduledTargetId;
            const content = (
              <div className="flex items-center justify-between gap-6">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-stone-800">{plan.name}</h2>
                    {isCurrent && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                        현재 구독
                      </span>
                    )}
                    {isScheduledTarget && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-900">
                        변경 예정
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
                  className="min-h-[9rem] w-full rounded-2xl border border-stone-200 bg-white p-5 text-base shadow-sm"
                >
                  {content}
                </div>
              );
            }

            return (
              <button
                key={plan.id}
                type="button"
                disabled={isCancellingScheduled}
                onClick={() => handleSelectPlan(plan.id)}
                className="block min-h-[9rem] w-full rounded-2xl border border-stone-200 bg-white p-5 text-left text-base shadow-sm transition hover:border-amber-300 hover:bg-amber-50/40 disabled:opacity-60"
              >
                {content}
              </button>
            );
          })}
        </section>

        <SubscriptionGuideSection />

        {pricingFlow && (
          <SubscriptionFlowDialog
            open
            variant={pricingFlow.variant}
            title={pricingFlow.title}
            message={pricingFlow.message}
            confirmBusy={pricingFlow.variant === "confirm" ? pricingFlowBusy : false}
            onDismiss={() => {
              if (pricingFlow.variant === "notify" && pricingFlow.afterDismiss) {
                pricingFlow.afterDismiss();
              }
              setPricingFlow(null);
            }}
            onConfirm={pricingFlow.variant === "confirm" ? pricingFlow.onConfirm : undefined}
          />
        )}

        {pendingPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-lg">
              <h2 className="text-xl font-semibold text-stone-800">구독 변경 확인</h2>
              <p className="mt-2 text-base leading-relaxed text-stone-600">
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
                <p className="mt-3 text-sm leading-relaxed text-stone-600">
                  등록된 카드로 즉시 적용되며 일할 차액이 청구됩니다.
                  {modalHint.estimateKrw !== null && (
                    <>
                      {" "}
                      (예상 {new Intl.NumberFormat("ko-KR").format(modalHint.estimateKrw)}원)
                    </>
                  )}
                </p>
              )}
              {canUseStoredBilling && effectivePaidPlanId && modalHint?.kind === "downgrade" && (
                <p className="mt-3 text-sm leading-relaxed text-stone-600">
                  추가 결제 없이 예약되며, 이번 기간까지 현재 구독이 유지됩니다. 다음 결제일부터 선택한 요금이 적용됩니다.
                </p>
              )}
              {!canUseStoredBilling && effectivePaidPlanId && (
                <p className="mt-3 text-sm text-stone-500">
                  다음 단계에서 토스 화면으로 카드 정보를 입력합니다.
                </p>
              )}
              <div className="mt-4 flex justify-end gap-2 text-sm">
                <button
                  type="button"
                  disabled={isProcessingCheckout || !serverLoaded}
                  onClick={handleCancelModal}
                  className="rounded-full border border-stone-300 px-4 py-2 text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                >
                  닫기
                </button>
                <button
                  type="button"
                  disabled={isProcessingCheckout || !serverLoaded}
                  onClick={handleConfirmPlan}
                  className="rounded-full bg-cta px-4 py-2 font-semibold text-white shadow-sm hover:bg-cta-hover disabled:opacity-50"
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
