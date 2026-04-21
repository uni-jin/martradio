"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import AdminShell from "@/app/_components/AdminShell";
import { useAdminSession } from "@/app/_components/AdminSessionProvider";
import { SELECT_CHEVRON_TAILWIND } from "@/app/_lib/selectChevron";
import type { AdminPayment, AdminReferrer } from "@/lib/adminData";
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
import { fetchAdminJsonCached } from "@/lib/adminClientCache";

function formatKoDateShort(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("ko-KR");
}

function formatYmdKo(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  return formatKoDateShort(`${ymd}T12:00:00+09:00`);
}

export default function AdminUserDetailPage() {
  const { session } = useAdminSession();
  const params = useParams();
  const userId = String(params.id ?? "");
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; priceMonthly: number }[]>([]);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const scopeReferrerId =
    session?.role === "referrer_admin" && session.referrerId ? session.referrerId : null;
  const user = useMemo(
    () => {
      const found = users.find((u) => String(u.id) === userId);
      if (!found) return undefined;
      if (scopeReferrerId && String(found.referrerId ?? "") !== scopeReferrerId) return undefined;
      return found;
    },
    [scopeReferrerId, userId, users]
  );
  const canManageReferrer = session?.role === "admin";

  const [referrers, setReferrers] = useState<AdminReferrer[]>([]);
  useEffect(() => {
    let canceled = false;
    void (async () => {
      const [refData, usersData, prodData, payData] = await Promise.all([
        fetchAdminJsonCached<{ referrers?: AdminReferrer[] }>("/api/admin/referrers"),
        fetchAdminJsonCached<{ users?: Record<string, unknown>[] }>("/api/admin/users"),
        fetchAdminJsonCached<{ products?: { id: string; name: string; priceMonthly: number }[] }>(
          "/api/admin/data/products"
        ),
        fetchAdminJsonCached<{ payments?: AdminPayment[] }>("/api/admin/data/payments"),
      ]);
      if (canceled) return;
      setReferrers(Array.isArray(refData.referrers) ? refData.referrers : []);
      setUsers(Array.isArray(usersData.users) ? usersData.users : []);
      setProducts(Array.isArray(prodData.products) ? prodData.products : []);
      setPayments(Array.isArray(payData.payments) ? payData.payments : []);
    })();
    return () => {
      canceled = true;
    };
  }, []);

  const [draftReferrerId, setDraftReferrerId] = useState("");
  const [referrerSaving, setReferrerSaving] = useState(false);
  const [referrerSaveError, setReferrerSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const rid = user.referrerId;
    setDraftReferrerId(typeof rid === "string" && rid.trim() ? rid.trim() : "");
    setReferrerSaveError(null);
  }, [user]);

  const savedReferrerId = useMemo(() => {
    if (!user) return "";
    const rid = user.referrerId;
    return typeof rid === "string" && rid.trim() ? rid.trim() : "";
  }, [user]);

  const referrerSelectRows = useMemo(() => {
    const active = referrers.filter((r) => r.isActive);
    const cur = savedReferrerId;
    if (cur && !active.some((r) => r.id === cur)) {
      const found = referrers.find((r) => r.id === cur);
      if (found) {
        return [found, ...active.filter((r) => r.id !== cur)];
      }
      return [{ id: cur, name: cur, isActive: false, loginId: "", createdAt: "", updatedAt: "" }, ...active];
    }
    return active;
  }, [referrers, savedReferrerId]);

  const referrerDirty = draftReferrerId !== savedReferrerId;

  const saveReferrerAssignment = () => {
    if (!userId || !user) return;
    if (!window.confirm("추천인을 저장하시겠습니까?")) return;
    setReferrerSaveError(null);
    setReferrerSaving(true);
    try {
      if (!canManageReferrer) {
        setReferrerSaveError("추천인 변경 권한이 없습니다.");
        return;
      }
      void fetch(`/api/admin/users/${encodeURIComponent(userId)}/referrer`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referrerId: draftReferrerId.trim() || null }),
      });
      setUsers((prev) =>
        prev.map((u) =>
          String(u.id) === userId ? { ...u, referrerId: draftReferrerId.trim() || null } : u
        )
      );
      window.alert("저장되었습니다.");
    } catch (e) {
      setReferrerSaveError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setReferrerSaving(false);
    }
  };

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
  const userPayments = useMemo(() => {
    if (!userId || !username) return [];
    return payments.filter((p) => p.userId === userId || p.username === username);
  }, [payments, userId, username]);

  const productNameById = useMemo(
    () => new Map(products.map((p) => [p.id, p.name])),
    [products]
  );

  const productPriceById = useMemo(
    () => new Map(products.map((p) => [p.id, p.priceMonthly])),
    [products]
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
        userPayments
      ),
    [subscription, user?.planId, userPayments]
  );

  const planText = useMemo(() => getPlanDisplayLabel(effectivePlanId), [effectivePlanId]);

  const { currentPeriodEndIso, nextPaymentDueIso } = useMemo(
    () => resolveSubscriptionPeriodDisplayIso({ server: subscription, payments: userPayments }),
    [subscription, userPayments]
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
    const orderNoMap = buildPaymentOrderNoMap(userPayments);
    const asc = [...userPayments].sort(
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
  }, [userPayments, subscription?.currentPeriodEnd]);

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
                    <th className="bg-stone-50 px-3 py-2 text-left font-medium text-stone-600">이용중 구독</th>
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
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                        <select
                          value={draftReferrerId}
                          onChange={(e) => setDraftReferrerId(e.target.value)}
                          className={`max-w-full min-w-0 rounded-lg border border-stone-200 bg-white px-3 py-2 pr-10 text-sm text-stone-800 sm:max-w-xs ${SELECT_CHEVRON_TAILWIND}`}
                          aria-label="추천인"
                          disabled={!canManageReferrer}
                        >
                          <option value="">없음</option>
                          {referrerSelectRows.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                              {!r.isActive ? " (비활성)" : ""}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!canManageReferrer || !referrerDirty || referrerSaving}
                          onClick={saveReferrerAssignment}
                          className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {referrerSaving ? "저장 중..." : "저장"}
                        </button>
                      </div>
                      {referrerSaveError ? (
                        <p className="mt-1 text-xs text-red-600">{referrerSaveError}</p>
                      ) : null}
                    </td>
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
                    <th className="px-3 py-2 text-center">No.</th>
                    <th className="px-3 py-2 text-center">결제 일시</th>
                    <th className="px-3 py-2 text-center">주문번호</th>
                    <th className="px-3 py-2 text-center">구독</th>
                    <th className="px-3 py-2 text-center">구독 만료일</th>
                    <th className="px-3 py-2 text-center">판매가</th>
                    <th className="px-3 py-2 text-center">결제 금액</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRows
                    .slice()
                    .reverse()
                    .map((p, idx) => {
                      const priceMonthly = productPriceById.get(p.productId);
                      const salePriceLabel =
                        typeof priceMonthly === "number" && Number.isFinite(priceMonthly)
                          ? `${priceMonthly.toLocaleString()}원`
                          : "—";
                      return (
                        <tr key={p.id} className="border-t border-stone-100">
                          <td className="px-3 py-2 text-center tabular-nums">{paymentRows.length - idx}</td>
                          <td className="px-3 py-2 text-center">{new Date(p.paidAt).toLocaleString("ko-KR")}</td>
                          <td className="px-3 py-2 text-center">{p.orderNo}</td>
                          <td className="px-3 py-2 text-center">
                            {productNameById.get(p.productId) ?? getPlanDisplayLabel(p.productId)}
                          </td>
                          <td className="px-3 py-2 text-center">{p.planExpiresLabel}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{salePriceLabel}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{p.amount.toLocaleString()}원</td>
                        </tr>
                      );
                    })}
                  {paymentRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-stone-500">
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
