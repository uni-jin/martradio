"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import AdminShell from "@/app/_components/AdminShell";
import {
  getAdminProducts,
  getAdminReferrers,
  getAdminUsers,
  getPaymentsForUser,
} from "@/lib/adminData";
import { getPlanDisplayLabel } from "@/lib/auth";
import { buildPaymentOrderNoMap } from "@/lib/adminPaymentOrderNo";
import { billingPeriodsForPaymentHistoryOldestFirst } from "@/lib/subscriptionPeriod";
import {
  effectivePlanIdForSubscriptionUi,
  isNextBillingPlanChangeFromSubscriptionServer,
  isPaidSubscriptionPlanId,
  nextBillingPlanIdFromSubscriptionServer,
  resolveSubscriptionPeriodDisplayIso,
} from "@/lib/subscriptionUi";

function formatKoDateShort(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("ko-KR");
}

function formatYmdKo(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  return formatKoDateShort(`${ymd}T12:00:00+09:00`);
}

export default function AdminUserDetailPage() {
  const params = useParams();
  const userId = String(params.id ?? "");
  const user = useMemo(() => getAdminUsers().find((u) => String(u.id) === userId), [userId]);

  const referrerLabel = useMemo(() => {
    if (!user) return "—";
    const refs = getAdminReferrers();
    const rid = user.referrerId;
    const idStr = typeof rid === "string" ? rid : "";
    if (!idStr) return "—";
    return refs.find((r) => r.id === idStr)?.name ?? idStr;
  }, [user]);

  const { displayBase, displayDetail, showMergedMismatch } = useMemo(() => {
    if (!user) {
      return { displayBase: "—", displayDetail: "—", showMergedMismatch: false };
    }
    const baseStr = typeof user.martAddressBase === "string" ? user.martAddressBase.trim() : "";
    const detailStr = typeof user.martAddressDetail === "string" ? user.martAddressDetail.trim() : "";
    const combinedStr = typeof user.martAddress === "string" ? user.martAddress.trim() : "";
    const fromParts = [baseStr, detailStr].filter(Boolean).join(" ").trim();
    const base =
      baseStr || (!baseStr && !detailStr && combinedStr ? combinedStr : "") || "—";
    const detail = detailStr || "—";
    const mismatch = Boolean(
      combinedStr && fromParts && combinedStr !== fromParts
    );
    return { displayBase: base, displayDetail: detail, showMergedMismatch: mismatch };
  }, [user]);

  const combinedForNote =
    user && typeof user.martAddress === "string" ? user.martAddress.trim() : "";

  const [subscription, setSubscription] = useState<{
    planId?: string;
    cancelRequested?: boolean;
    scheduledPlanAfterPeriod?: string | null;
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
    nextPaymentDueAt?: string | null;
    latestPaymentKey?: string | null;
    latestOrderId?: string | null;
    updatedAt?: string;
  } | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(false);

  const loadSubscription = useCallback(async () => {
    if (!userId) return;
    setLoadingSubscription(true);
    try {
      const res = await fetch(`/api/subscription/status?userId=${encodeURIComponent(userId)}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok === true) {
        const next = (data.subscription ?? null) as {
          planId?: string;
          cancelRequested?: boolean;
          scheduledPlanAfterPeriod?: string | null;
          currentPeriodStart?: string | null;
          currentPeriodEnd?: string | null;
          nextPaymentDueAt?: string | null;
          latestPaymentKey?: string | null;
          latestOrderId?: string | null;
          updatedAt?: string;
        } | null;
        setSubscription(next);
      }
    } finally {
      setLoadingSubscription(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  const username = String(user?.username ?? "");
  const payments = useMemo(() => {
    if (!userId || !username) return [];
    return getPaymentsForUser(userId, username);
  }, [userId, username]);

  const productNameById = useMemo(
    () => new Map(getAdminProducts().map((p) => [p.id, p.name])),
    []
  );

  const inferredJoinedAt = useMemo(() => {
    if (!user) return null;
    if (typeof user.createdAt === "string" && user.createdAt.trim()) return user.createdAt;
    const id = typeof user.id === "string" ? user.id : "";
    const m = /^user_(\d+)$/.exec(id);
    if (!m) return null;
    const ms = Number(m[1]);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toISOString();
  }, [user]);

  const effectivePlanId = useMemo(
    () =>
      effectivePlanIdForSubscriptionUi(
        subscription,
        typeof user?.planId === "string" ? user.planId : null,
        payments
      ),
    [subscription, user?.planId, payments]
  );

  const planText = useMemo(() => getPlanDisplayLabel(effectivePlanId), [effectivePlanId]);

  const { currentPeriodEndIso, nextPaymentDueIso } = useMemo(
    () => resolveSubscriptionPeriodDisplayIso({ server: subscription, payments }),
    [subscription, payments]
  );

  const nextBillingPlanId = useMemo(
    () => nextBillingPlanIdFromSubscriptionServer(subscription),
    [subscription]
  );

  const nextBillingPlanChanges = useMemo(
    () => isNextBillingPlanChangeFromSubscriptionServer(subscription),
    [subscription]
  );

  const lastLoginAt =
    user && typeof user.lastLoginAt === "string" && user.lastLoginAt.trim()
      ? user.lastLoginAt
      : null;

  const paymentRows = useMemo(() => {
    const orderNoMap = buildPaymentOrderNoMap(payments);
    const asc = [...payments].sort(
      (a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime()
    );
    const periods = billingPeriodsForPaymentHistoryOldestFirst(asc, {
      serverCurrentPeriodEndIso: subscription?.currentPeriodEnd ?? null,
    });
    return asc.map((p, idx) => {
      const b = periods[idx];
      return {
        ...p,
        orderNo: orderNoMap.get(p.id) ?? "—",
        planExpiresLabel: b ? formatYmdKo(b.planExpiresOn) : "—",
        nextPaymentLabel: b ? formatYmdKo(b.nextPaymentDueOn) : "—",
      };
    });
  }, [payments, subscription?.currentPeriodEnd]);

  return (
    <AdminShell title="회원 상세">
      {!user ? (
        <div className="rounded-xl border border-stone-200 p-4 text-sm text-stone-500">
          회원을 찾을 수 없습니다.
        </div>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-semibold text-stone-700">회원정보 상세</h2>
            <div className="overflow-x-auto rounded-xl border border-stone-200">
              <table className="min-w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-[15%]" />
                  <col className="w-[35%]" />
                  <col className="w-[15%]" />
                  <col className="w-[35%]" />
                </colgroup>
                <tbody>
                  <tr className="border-t border-stone-100">
                    <th className="bg-stone-50 px-3 py-2 text-left font-medium text-stone-600">아이디</th>
                    <td className="px-3 py-2">{String(user.username ?? "-")}</td>
                    <th className="bg-stone-50 px-3 py-2 text-left font-medium text-stone-600">마트명</th>
                    <td className="px-3 py-2">{String(user.martName ?? "-")}</td>
                  </tr>
                  <tr className="border-t border-stone-100">
                    <th className="bg-stone-50 px-3 py-2 text-left font-medium text-stone-600">마트 주소</th>
                    <td className="px-3 py-2">
                      {displayBase}
                      {displayDetail !== "—" ? ` ${displayDetail}` : ""}
                      {showMergedMismatch && combinedForNote ? ` (${combinedForNote})` : ""}
                    </td>
                    <th className="bg-stone-50 px-3 py-2 text-left font-medium text-stone-600">이름</th>
                    <td className="px-3 py-2">{String(user.name ?? "-")}</td>
                  </tr>
                  <tr className="border-t border-stone-100">
                    <th className="bg-stone-50 px-3 py-2 text-left font-medium text-stone-600">전화번호</th>
                    <td className="px-3 py-2">{String(user.phone ?? "-")}</td>
                    <th className="bg-stone-50 px-3 py-2 text-left font-medium text-stone-600">이용중 플랜</th>
                    <td className="px-3 py-2">
                      {loadingSubscription ? (
                        "조회 중..."
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <span>{planText}</span>
                          {(() => {
                            const cancelEnd = currentPeriodEndIso;
                            if (!subscription?.cancelRequested || !cancelEnd) return null;
                            return (
                              <span className="text-xs font-medium text-red-600">
                                {formatKoDateShort(cancelEnd)} 구독 종료 예정
                              </span>
                            );
                          })()}
                          {!subscription?.cancelRequested &&
                          nextPaymentDueIso &&
                          isPaidSubscriptionPlanId(effectivePlanId) ? (
                            <span
                              className={
                                nextBillingPlanChanges
                                  ? "text-xs font-medium text-emerald-700"
                                  : "text-xs text-stone-500"
                              }
                            >
                              {formatKoDateShort(nextPaymentDueIso)}
                              {nextBillingPlanId
                                ? ` · ${getPlanDisplayLabel(nextBillingPlanId)} 결제 예정`
                                : " 결제 예정"}
                            </span>
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                  <tr className="border-t border-stone-100">
                    <th className="bg-stone-50 px-3 py-2 text-left font-medium text-stone-600">추천인</th>
                    <td className="px-3 py-2">{referrerLabel}</td>
                    <th className="bg-stone-50 px-3 py-2 text-left font-medium text-stone-600">가입일</th>
                    <td className="px-3 py-2">
                      {inferredJoinedAt
                        ? new Date(inferredJoinedAt).toLocaleDateString("ko-KR")
                        : "-"}
                    </td>
                  </tr>
                  <tr className="border-t border-stone-100">
                    <th className="bg-stone-50 px-3 py-2 text-left font-medium text-stone-600">마지막 로그인 일시</th>
                    <td colSpan={3} className="px-3 py-2">
                      {lastLoginAt ? new Date(lastLoginAt).toLocaleString("ko-KR") : "-"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-stone-700">결제 내역</h2>
              <p className="text-xs text-stone-500">총 {paymentRows.length.toLocaleString()}건</p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-stone-200">
              <table className="min-w-full text-sm">
                <thead className="bg-stone-50 text-stone-600">
                  <tr>
                    <th className="px-3 py-2 text-left">No.</th>
                    <th className="px-3 py-2 text-left">결제 일시</th>
                    <th className="px-3 py-2 text-left">주문번호</th>
                    <th className="px-3 py-2 text-left">플랜</th>
                    <th className="px-3 py-2 text-left">플랜 만료일</th>
                    <th className="px-3 py-2 text-left">판매가</th>
                    <th className="px-3 py-2 text-left">결제 금액</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRows
                    .slice()
                    .reverse()
                    .map((p, idx) => (
                      <tr key={p.id} className="border-t border-stone-100">
                        <td className="px-3 py-2">{paymentRows.length - idx}</td>
                        <td className="px-3 py-2">{new Date(p.paidAt).toLocaleString("ko-KR")}</td>
                        <td className="px-3 py-2">{p.orderNo}</td>
                        <td className="px-3 py-2">
                          {productNameById.get(p.productId) ?? getPlanDisplayLabel(p.productId)}
                        </td>
                        <td className="px-3 py-2">{p.planExpiresLabel}</td>
                        <td className="px-3 py-2">{p.amount.toLocaleString()}원</td>
                        <td className="px-3 py-2">{p.amount.toLocaleString()}원</td>
                      </tr>
                    ))}
                  {paymentRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-stone-500">
                        결제 내역이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex justify-end">
            <Link
              href="/admin/users"
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
            >
              목록으로
            </Link>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
