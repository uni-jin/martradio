"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import AdminShell from "@/app/_components/AdminShell";
import { isNextBillingPlanChangeFromSubscriptionServer } from "@/lib/subscriptionUi";
import {
  computeAdminDashboardStats,
  getAdminProducts,
  getAdminPayments,
  getAdminReferrers,
  getAdminUsers,
  getVoiceTemplates,
  type AdminDashboardStats,
} from "@/lib/adminData";

const money = (n: number) =>
  new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" }).format(n);

const dateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
};

function KpiCard({
  label,
  value,
  sub,
  href,
  variant = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  href?: string;
  variant?: "default" | "emerald";
}) {
  const inner = (
    <>
      <p
        className={
          variant === "emerald" ? "text-xs font-medium text-emerald-800/90" : "text-xs font-medium text-stone-500"
        }
      >
        {label}
      </p>
      <p
        className={
          variant === "emerald"
            ? "mt-2 text-2xl font-bold tabular-nums text-emerald-900"
            : "mt-2 text-2xl font-bold tabular-nums text-stone-800"
        }
      >
        {value}
      </p>
      {sub && (
        <p className={variant === "emerald" ? "mt-1 text-xs text-emerald-800/80" : "mt-1 text-xs text-stone-500"}>
          {sub}
        </p>
      )}
    </>
  );
  const className =
    variant === "emerald"
      ? "rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm transition hover:border-emerald-300 hover:shadow"
      : "rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow";
  if (href) {
    return (
      <Link href={href} className={`block ${className}`}>
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
}

export default function AdminHomePage() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [planChangeReservationCount, setPlanChangeReservationCount] = useState<number | undefined>(
    undefined
  );

  useEffect(() => {
    setStats(computeAdminDashboardStats());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/subscription/admin/subscriptions", { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || data?.ok !== true || !Array.isArray(data.subscriptions)) {
          if (!cancelled) setPlanChangeReservationCount(0);
          return;
        }
        let n = 0;
        for (const raw of data.subscriptions as Record<string, unknown>[]) {
          if (!raw || typeof raw !== "object") continue;
          const sub = {
            planId: typeof raw.planId === "string" ? raw.planId : "",
            scheduledPlanAfterPeriod:
              typeof raw.scheduledPlanAfterPeriod === "string" ? raw.scheduledPlanAfterPeriod : null,
          };
          if (isNextBillingPlanChangeFromSubscriptionServer(sub)) n++;
        }
        if (!cancelled) setPlanChangeReservationCount(n);
      } catch {
        if (!cancelled) setPlanChangeReservationCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const productNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of getAdminProducts()) {
      m.set(p.id, p.name);
    }
    return m;
  }, []);

  const monthRevenue = useMemo(() => {
    if (!stats) return 0;
    if (typeof window === "undefined") return 0;
    const payments = getAdminPayments();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartMs = monthStart.getTime();
    return payments.reduce((sum, p) => {
      const t = new Date(p.paidAt).getTime();
      if (!Number.isNaN(t) && t >= monthStartMs) {
        return sum + p.amount;
      }
      return sum;
    }, 0);
  }, [stats]);

  const voicesPaidOnlyCount = useMemo(() => {
    if (typeof window === "undefined") return 0;
    return getVoiceTemplates().filter((v) => v.paidOnly === true).length;
  }, [stats]);

  const recentPaymentRows = useMemo(() => {
    if (!stats || typeof window === "undefined") return [];
    const users = getAdminUsers();
    const referrers = getAdminReferrers();
    const refNameById = new Map(referrers.map((r) => [r.id, r.name]));
    const byId = new Map<string, Record<string, unknown>>();
    const byUsername = new Map<string, Record<string, unknown>>();
    for (const u of users) {
      const id = String(u.id ?? "");
      const uname = String(u.username ?? "");
      if (id) byId.set(id, u);
      if (uname) byUsername.set(uname, u);
    }
    return stats.recentPayments.map((p) => {
      const u = byId.get(p.userId) ?? byUsername.get(p.username);
      const refFromPayment =
        typeof p.referrerId === "string" && p.referrerId.trim() ? p.referrerId.trim() : "";
      const refFromUser =
        u && typeof u.referrerId === "string" && u.referrerId.trim() ? u.referrerId.trim() : "";
      const refKey = refFromPayment || refFromUser;
      const referrerLabel = refKey ? refNameById.get(refKey) ?? refKey : "-";
      const martName =
        u && typeof u.martName === "string" && u.martName.trim() ? u.martName.trim() : "-";
      const personName = u && typeof u.name === "string" && u.name.trim() ? u.name.trim() : "-";
      return { p, martName, personName, referrerLabel };
    });
  }, [stats]);

  return (
    <AdminShell title="">
      <div className="space-y-8">
        {!stats ? (
          <p className="text-sm text-stone-500">불러오는 중…</p>
        ) : (
          <>
            <section>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <KpiCard
                  label="전체/유료 회원"
                  value={`${stats.totalUsers.toLocaleString()} / ${stats.paidUsers.toLocaleString()}명`}
                  sub={
                    stats.totalUsers > 0
                      ? `유료 비율 ${Math.round((stats.paidUsers / stats.totalUsers) * 100)}%`
                      : "유료 비율 0%"
                  }
                  href="/admin/users"
                />
                <KpiCard
                  label="전체 결제 건수"
                  value={`${stats.paymentCount.toLocaleString()}건`}
                  sub={`누적 ${money(stats.totalRevenue)}`}
                  href="/admin/payments"
                />
                <KpiCard
                  label="이번달 결제"
                  value={`${stats.paymentsThisMonth.toLocaleString()}건`}
                  sub={`합계 ${money(monthRevenue)}`}
                  href="/admin/payments"
                />
                <KpiCard
                  label="방송 템플릿(노출중)"
                  value={`${stats.templatesTotal}개`}
                  sub={`유료 전용 ${stats.templatesPaidOnly}개`}
                  href="/admin/templates"
                />
                <KpiCard
                  label="음성 템플릿(노출중)"
                  value={`${stats.voicesEnabled}개`}
                  sub={`유료 전용 ${voicesPaidOnlyCount}개`}
                  href="/admin/voices"
                />
                <KpiCard
                  label="플랜 변경 예약"
                  value={
                    planChangeReservationCount === undefined
                      ? "…"
                      : `${planChangeReservationCount.toLocaleString()}명`
                  }
                  sub="다음 자동결제에서 플랜이 바뀌는 유료 회원"
                  href="/admin/users"
                  variant="emerald"
                />
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-stone-700">플랜별 회원 수</h2>
                  <Link
                    href="/admin/users"
                    className="text-xs font-medium text-slate-800 hover:underline"
                  >
                    회원 관리 →
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[220px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-stone-200 text-xs text-stone-500">
                        <th className="pb-2 pr-2 font-medium">플랜</th>
                        <th className="pb-2 font-medium">회원 수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.planBreakdown.map((row) => (
                        <tr key={row.key} className="border-b border-stone-100 last:border-0">
                          <td className="py-2 pr-2 text-stone-800">{row.label}</td>
                          <td className="py-2 tabular-nums font-medium text-stone-800">
                            {row.count.toLocaleString()}명
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-stone-700">추천인별 가입 · 매출 (Top3)</h2>
                  <Link
                    href="/admin/referrer-payments"
                    className="text-xs font-medium text-slate-800 hover:underline"
                  >
                    상세 통계 →
                  </Link>
                </div>
                {stats.topReferrers.length === 0 ? (
                  <p className="text-sm text-stone-500">등록된 추천인이 없습니다.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[320px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-stone-200 text-xs text-stone-500">
                          <th className="pb-2 pr-2 font-medium">추천인</th>
                          <th className="pb-2 pr-2 font-medium">가입 연결</th>
                          <th className="pb-2 pr-2 font-medium">결제 수</th>
                          <th className="pb-2 font-medium">결제 합계</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.topReferrers.map((r) => (
                          <tr key={r.id} className="border-b border-stone-100 last:border-0">
                            <td className="py-2 pr-2 text-stone-800">{r.name}</td>
                            <td className="py-2 pr-2 tabular-nums text-stone-600">
                              {r.signups.toLocaleString()}명
                            </td>
                            <td className="py-2 pr-2 tabular-nums text-stone-600">
                              {r.paymentCount.toLocaleString()}건
                            </td>
                            <td className="py-2 tabular-nums text-stone-800">
                              {money(r.revenue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-stone-200 bg-stone-50/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-stone-700">최근 결제</h2>
                <Link
                  href="/admin/payments"
                  className="text-xs font-medium text-slate-800 hover:underline"
                >
                  전체 보기 →
                </Link>
              </div>
              {stats.recentPayments.length === 0 ? (
                <p className="text-sm text-stone-500">결제 내역이 없습니다.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-stone-200 text-xs text-stone-500">
                        <th className="pb-2 pr-2 font-medium">일시</th>
                        <th className="pb-2 pr-2 font-medium">마트명</th>
                        <th className="pb-2 pr-2 font-medium">이름</th>
                        <th className="pb-2 pr-2 font-medium">추천인</th>
                        <th className="pb-2 pr-2 font-medium">플랜</th>
                        <th className="pb-2 font-medium">결제 금액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentPaymentRows.map(({ p, martName, personName, referrerLabel }) => (
                        <tr key={p.id} className="border-b border-stone-100 last:border-0">
                          <td className="py-2 pr-2 whitespace-nowrap text-stone-600">
                            {dateTime(p.paidAt)}
                          </td>
                          <td className="py-2 pr-2 text-stone-800">{martName}</td>
                          <td className="py-2 pr-2 text-stone-800">{personName}</td>
                          <td className="py-2 pr-2 text-stone-600">{referrerLabel}</td>
                          <td className="py-2 pr-2 text-stone-600">
                            {productNameById.get(p.productId) ?? p.productId}
                          </td>
                          <td className="py-2 tabular-nums font-medium text-stone-800">
                            {money(p.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AdminShell>
  );
}
