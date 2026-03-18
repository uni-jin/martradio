"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCurrentUser, getPlanLabel, PlanId, updateCurrentUserPlan } from "@/lib/auth";

const PLANS: { id: PlanId; name: string; description: string }[] = [
  { id: "free", name: "무료", description: "방송 한 번당 50자까지" },
  { id: "small", name: "소형마트", description: "방송 한 번당 200자까지" },
  { id: "medium", name: "중형마트", description: "방송 한 번당 1000자까지" },
  { id: "large", name: "대형마트", description: "방송 글자 수 무제한" },
];

export default function PricingPage() {
  const [currentPlan, setCurrentPlan] = useState<PlanId | undefined>(undefined);
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const user = getCurrentUser();
    setUserEmail(user?.email ?? null);
    setCurrentPlan(user?.planId);
    setIsUnlimited(!!user?.isUnlimited);
  }, []);

  const handleSelectPlan = (planId: PlanId) => {
    if (!userEmail) {
      setMessage("로그인 후 플랜을 선택할 수 있습니다.");
      return;
    }
    setPendingPlan(planId);
    setMessage(null);
  };

  const handleConfirmPlan = () => {
    if (!pendingPlan) return;
    const updated = updateCurrentUserPlan(pendingPlan);
    setCurrentPlan(updated?.planId);
    setIsUnlimited(!!updated?.isUnlimited);
    setMessage(
      pendingPlan === "free"
        ? "무료 플랜으로 변경되었습니다."
        : `${getPlanLabel(pendingPlan, false)} 플랜 구독이 완료되었습니다. 방송 글자 수 제한이 적용됩니다.`
    );
    setPendingPlan(null);
  };

  const handleCancelModal = () => {
    setPendingPlan(null);
  };

  const handleCancelSubscription = () => {
    const updated = updateCurrentUserPlan("free");
    setCurrentPlan(updated?.planId);
    setIsUnlimited(!!updated?.isUnlimited);
    setMessage("구독이 취소되고 무료 플랜으로 돌아갔습니다.");
  };

  const planText = getPlanLabel(currentPlan, isUnlimited);

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link href="/" className="text-sm text-stone-500 hover:text-stone-700">
          ← 첫 화면으로
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-stone-800">플랜 구독</h1>
        <p className="mt-2 text-sm text-stone-500">
          아직 실제 결제 연동은 되어 있지 않고, 선택한 플랜에 따라 방송 글자 수 제한만 적용됩니다.
        </p>

        <div className="mt-4 rounded-xl border border-stone-200 bg-white px-4 py-3 text-xs text-stone-600">
          <p>
            현재 로그인:{" "}
            <span className="font-medium text-stone-800">
              {userEmail ?? "로그인 필요"}
            </span>
          </p>
          <p className="mt-1">
            현재 플랜: <span className="font-medium text-stone-800">{planText}</span>
          </p>
        </div>

        <section className="mt-6 grid gap-4 sm:grid-cols-4">
          {PLANS.map((plan) => {
            const isCurrent = plan.id === currentPlan && !isUnlimited;
            const isTestUnlimited = isUnlimited && plan.id === "large";
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => handleSelectPlan(plan.id)}
                className={`text-left rounded-2xl border p-4 text-sm shadow-sm transition ${
                  isCurrent || isTestUnlimited
                    ? "border-amber-500 bg-amber-50"
                    : "border-stone-200 bg-white hover:border-amber-300 hover:bg-amber-50/40"
                }`}
              >
                <h2 className="text-base font-semibold text-stone-800">{plan.name}</h2>
                <p className="mt-1 text-xs text-stone-500">{plan.description}</p>
                {(isCurrent || isTestUnlimited) && (
                  <p className="mt-2 text-[11px] font-medium text-amber-700">현재 선택된 플랜</p>
                )}
              </button>
            );
          })}
        </section>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleCancelSubscription}
            className="rounded-full border border-stone-300 bg-white px-4 py-1.5 text-xs font-medium text-stone-700 hover:border-amber-400 hover:text-amber-700"
          >
            구독 취소 (무료 플랜으로 전환)
          </button>
        </div>

        {message && (
          <p className="mt-3 text-sm text-green-700">
            {message}
          </p>
        )}

        {pendingPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
              <h2 className="text-lg font-semibold text-stone-800">플랜 구독 확인</h2>
              <p className="mt-2 text-sm text-stone-600">
                <span className="font-medium text-amber-700">{getPlanLabel(pendingPlan, false)}</span> 플랜으로
                구독하시겠습니까?
              </p>
              <p className="mt-1 text-xs text-stone-500">
                실제 결제는 이뤄지지 않고, 방송 글자 수 제한만 적용됩니다.
              </p>
              <div className="mt-4 flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleCancelModal}
                  className="rounded-full border border-stone-300 px-3 py-1 text-stone-600 hover:bg-stone-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPlan}
                  className="rounded-full bg-amber-500 px-3 py-1 font-medium text-white hover:bg-amber-600"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

