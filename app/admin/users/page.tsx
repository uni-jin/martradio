"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "@/app/_components/AdminShell";
import { useAdminSession } from "@/app/_components/AdminSessionProvider";
import type { AdminPayment, AdminReferrer } from "@/lib/adminData";
import { getPlanDisplayLabel } from "@/lib/auth";
import { SELECT_CHEVRON_TAILWIND } from "@/app/_lib/selectChevron";
import {
  effectivePlanIdForSubscriptionUi,
  isNextBillingPlanChangeFromSubscriptionServer,
  isPaidSubscriptionPlanId,
  nextBillingPlanIdFromSubscriptionServer,
  resolveSubscriptionPeriodDisplayIso,
} from "@/lib/subscriptionUi";
import { fetchAdminJsonCached } from "@/lib/adminClientCache";

/** API 응답용 — 클라이언트에서 subscriptionServerStore 미참조 */
type SubscriptionSnapshot = {
  userId: string;
  planId: string;
  cancelRequested: boolean;
  currentPeriodEnd?: string | null;
  nextPaymentDueAt?: string | null;
  scheduledPlanAfterPeriod?: string | null;
};

type PlanDisplayInfo = {
  effectivePlanId: string;
  cancelRequested: boolean;
  currentPeriodEndIso: string | null;
  nextPaymentDueIso: string | null;
  nextBillingPlanId: string | null;
  nextBillingPlanChanges: boolean;
};

function AdminUserPlanCell({
  planInfo,
}: {
  planInfo: PlanDisplayInfo;
}) {
  const line1 = getPlanDisplayLabel(planInfo.effectivePlanId);
  let line2: { text: string; variant: "end" | "pay" | "payChange" } | null = null;
  if (isPaidSubscriptionPlanId(planInfo.effectivePlanId)) {
    if (planInfo.cancelRequested && planInfo.currentPeriodEndIso) {
      const d = new Date(planInfo.currentPeriodEndIso);
      const dateStr = Number.isNaN(d.getTime())
        ? String(planInfo.currentPeriodEndIso)
        : d.toLocaleDateString("ko-KR");
      line2 = { text: `${dateStr} 구독 종료 예정`, variant: "end" };
    } else if (!planInfo.cancelRequested && planInfo.nextPaymentDueIso) {
      const d = new Date(planInfo.nextPaymentDueIso);
      const dateStr = Number.isNaN(d.getTime())
        ? String(planInfo.nextPaymentDueIso)
        : d.toLocaleDateString("ko-KR");
      const planLabel = planInfo.nextBillingPlanId
        ? getPlanDisplayLabel(planInfo.nextBillingPlanId)
        : null;
      const text = planLabel
        ? `${dateStr} · ${planLabel} 결제 예정`
        : `${dateStr} 결제 예정`;
      line2 = {
        text,
        variant: planInfo.nextBillingPlanChanges ? "payChange" : "pay",
      };
    }
  }
  const line2Class =
    line2?.variant === "end"
      ? "font-medium text-red-600"
      : line2?.variant === "payChange"
        ? "font-medium text-emerald-700"
        : "text-stone-500";
  return (
    <div className="flex flex-col gap-0.5">
      <span>{line1}</span>
      {line2 && <span className={`text-xs ${line2Class}`}>{line2.text}</span>}
    </div>
  );
}

function buildPlanExcelCell(planInfo: PlanDisplayInfo): string {
  const line1 = getPlanDisplayLabel(planInfo.effectivePlanId);
  if (!isPaidSubscriptionPlanId(planInfo.effectivePlanId)) return line1;
  if (planInfo.cancelRequested && planInfo.currentPeriodEndIso) {
    const d = new Date(planInfo.currentPeriodEndIso);
    const dateStr = Number.isNaN(d.getTime())
      ? String(planInfo.currentPeriodEndIso)
      : d.toLocaleDateString("ko-KR");
    return `${line1} / ${dateStr} 구독 종료 예정`;
  }
  if (!planInfo.cancelRequested && planInfo.nextPaymentDueIso) {
    const d = new Date(planInfo.nextPaymentDueIso);
    const dateStr = Number.isNaN(d.getTime())
      ? String(planInfo.nextPaymentDueIso)
      : d.toLocaleDateString("ko-KR");
    const planLabel = planInfo.nextBillingPlanId
      ? getPlanDisplayLabel(planInfo.nextBillingPlanId)
      : null;
    const pay = planLabel ? `${dateStr} · ${planLabel} 결제 예정` : `${dateStr} 결제 예정`;
    const tag = planInfo.nextBillingPlanChanges ? " [구독변경예정]" : "";
    return `${line1} / ${pay}${tag}`;
  }
  return line1;
}

type UserKindFilter = "all" | "free" | "paid";
type SearchField = "username" | "name" | "phone" | "martName" | "referrer";

function inferJoinedAt(u: Record<string, unknown>): string | null {
  if (typeof u.createdAt === "string" && u.createdAt.trim()) return u.createdAt;
  const id = typeof u.id === "string" ? u.id : "";
  const m = /^user_(\d+)$/.exec(id);
  if (!m) return null;
  const ms = Number(m[1]);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { session } = useAdminSession();
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const scopeReferrerId =
    session?.role === "referrer_admin" && session.referrerId ? session.referrerId : null;
  const scopedUsers = useMemo(() => {
    if (!scopeReferrerId) return users;
    return users.filter((u) => String(u.referrerId ?? "") === scopeReferrerId);
  }, [scopeReferrerId, users]);
  const [referrers, setReferrers] = useState<AdminReferrer[]>([]);
  const referrerNameById = useMemo(
    () => new Map(referrers.map((r) => [r.id, r.name])),
    [referrers]
  );
  const [periodType, setPeriodType] = useState("가입일");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [userKind, setUserKind] = useState<UserKindFilter>("all");
  const [searchField, setSearchField] = useState<SearchField>("username");
  const [keyword, setKeyword] = useState("");
  const [subsByUserId, setSubsByUserId] = useState<Map<string, SubscriptionSnapshot>>(new Map());

  useEffect(() => {
    let canceled = false;
    void (async () => {
      const [refData, usersData, payData] = await Promise.all([
        fetchAdminJsonCached<{ referrers?: AdminReferrer[] }>("/api/admin/referrers"),
        fetchAdminJsonCached<{ users?: Record<string, unknown>[] }>("/api/admin/users"),
        fetchAdminJsonCached<{ payments?: AdminPayment[] }>("/api/admin/data/payments"),
      ]);
      if (!canceled) {
        setReferrers(Array.isArray(refData.referrers) ? refData.referrers : []);
        setUsers(Array.isArray(usersData.users) ? usersData.users : []);
        setPayments(Array.isArray(payData.payments) ? payData.payments : []);
      }
    })();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/subscription/admin/subscriptions", { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || data?.ok !== true || !Array.isArray(data.subscriptions)) return;
        const next = new Map<string, SubscriptionSnapshot>();
        for (const raw of data.subscriptions as Record<string, unknown>[]) {
          if (!raw || typeof raw.userId !== "string" || typeof raw.planId !== "string") continue;
          next.set(raw.userId, {
            userId: raw.userId,
            planId: raw.planId,
            cancelRequested: raw.cancelRequested === true,
            currentPeriodEnd:
              typeof raw.currentPeriodEnd === "string" ? raw.currentPeriodEnd : null,
            nextPaymentDueAt:
              typeof raw.nextPaymentDueAt === "string" ? raw.nextPaymentDueAt : null,
            scheduledPlanAfterPeriod:
              typeof raw.scheduledPlanAfterPeriod === "string"
                ? raw.scheduledPlanAfterPeriod
                : null,
          });
        }
        setSubsByUserId(next);
      } catch {
        // noop
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const planDisplayByUserId = useMemo(() => {
    const m = new Map<string, PlanDisplayInfo>();
    for (const u of scopedUsers) {
      const uid = String(u.id ?? "");
      if (!uid) continue;
      const username = String(u.username ?? "");
      const localPlanId = String(u.planId ?? "free");
      const sub = subsByUserId.get(uid);
      const userPayments = username
        ? payments.filter((p) => p.userId === uid || p.username === username)
        : [];
      const effectivePlanId = effectivePlanIdForSubscriptionUi(sub ?? null, localPlanId, userPayments);
      const resolved = resolveSubscriptionPeriodDisplayIso({ server: sub ?? null, payments: userPayments });
      const serverLike = sub
        ? {
            planId: sub.planId,
            scheduledPlanAfterPeriod: sub.scheduledPlanAfterPeriod ?? null,
          }
        : null;
      const nextBill = serverLike
        ? nextBillingPlanIdFromSubscriptionServer(serverLike)
        : isPaidSubscriptionPlanId(effectivePlanId)
          ? effectivePlanId
          : null;
      const billingChange = serverLike
        ? isNextBillingPlanChangeFromSubscriptionServer(serverLike)
        : false;
      m.set(uid, {
        effectivePlanId,
        cancelRequested: Boolean(sub?.cancelRequested),
        currentPeriodEndIso: resolved.currentPeriodEndIso,
        nextPaymentDueIso: resolved.nextPaymentDueIso,
        nextBillingPlanId: nextBill,
        nextBillingPlanChanges: billingChange,
      });
    }
    return m;
  }, [payments, scopedUsers, subsByUserId]);

  const filteredUsers = useMemo(() => {
    const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : NaN;
    const toMs = toDate ? new Date(`${toDate}T23:59:59`).getTime() : NaN;
    const kw = keyword.trim().toLowerCase();

    return scopedUsers
      .filter((u) => {
        const joinedAt = inferJoinedAt(u);
        const joinedMs = joinedAt ? new Date(joinedAt).getTime() : NaN;
        if (!Number.isNaN(fromMs) && (Number.isNaN(joinedMs) || joinedMs < fromMs)) return false;
        if (!Number.isNaN(toMs) && (Number.isNaN(joinedMs) || joinedMs > toMs)) return false;

        const planId = String(u.planId ?? "free");
        if (userKind === "free" && planId !== "free") return false;
        if (userKind === "paid" && planId === "free") return false;

        if (kw) {
          let fieldValue = String(u[searchField] ?? "").toLowerCase();
          if (searchField === "referrer") {
            const referrerId = String(u.referrerId ?? "");
            const referrerName = referrerNameById.get(referrerId) ?? "";
            fieldValue = `${referrerId} ${referrerName}`.toLowerCase();
          }
          if (!fieldValue.includes(kw)) return false;
        }
        return true;
      })
      .slice()
      .sort((a, b) => {
        const aJoined = inferJoinedAt(a);
        const bJoined = inferJoinedAt(b);
        const aMs = aJoined ? new Date(aJoined).getTime() : -1;
        const bMs = bJoined ? new Date(bJoined).getTime() : -1;
        if (bMs !== aMs) return bMs - aMs;
        return String(b.id ?? "").localeCompare(String(a.id ?? ""));
      });
  }, [fromDate, keyword, referrerNameById, scopedUsers, searchField, toDate, userKind]);

  const resetFilters = () => {
    setPeriodType("가입일");
    setFromDate("");
    setToDate("");
    setUserKind("all");
    setSearchField("username");
    setKeyword("");
  };

  const downloadExcel = () => {
    const header = [
      "가입일",
      "아이디",
      "마트명",
      "이름",
      "회원유형",
      "이용중 구독",
      "추천인",
    ];
    const rows = filteredUsers.map((u) => {
      const uid = String(u.id ?? "");
      const planId = String(u.planId ?? "free");
      const joined = inferJoinedAt(u);
      const planInfo = planDisplayByUserId.get(uid) ?? {
        effectivePlanId: planId,
        cancelRequested: false,
        currentPeriodEndIso: null,
        nextPaymentDueIso: null,
        nextBillingPlanId: isPaidSubscriptionPlanId(planId) ? planId : null,
        nextBillingPlanChanges: false,
      };
      return [
        joined ? new Date(joined).toLocaleDateString("ko-KR") : "-",
        String(u.username ?? "-"),
        String(u.martName ?? "-"),
        String(u.name ?? "-"),
        planId === "free" ? "무료회원" : "유료회원",
        buildPlanExcelCell(planInfo),
        String(referrerNameById.get(String(u.referrerId ?? "")) ?? "-"),
      ];
    });
    const csv = [["No.", ...header], ...rows.map((r, i) => [String(rows.length - i), ...r])]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `마트방송_users_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminShell title="">
      <div className="mb-4 overflow-hidden border border-stone-300">
        <div className="grid grid-cols-[100px_1fr] border-b border-stone-300 text-sm">
          <div className="bg-stone-50 px-3 py-3 font-medium text-stone-700">기간</div>
          <div className="flex flex-wrap items-center gap-2 px-3 py-2">
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value)}
              className={`h-9 rounded border border-stone-300 px-2 pr-12 text-sm ${SELECT_CHEVRON_TAILWIND}`}
            >
              <option>가입일</option>
            </select>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9 rounded border border-stone-300 px-2 text-sm"
            />
            <span className="text-stone-500">~</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9 rounded border border-stone-300 px-2 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-[100px_1fr] border-b border-stone-300 text-sm">
          <div className="bg-stone-50 px-3 py-3 font-medium text-stone-700">회원유형</div>
          <div className="flex flex-wrap items-center gap-4 px-3 py-3 text-sm text-stone-700">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={userKind === "all"}
                onChange={() => setUserKind("all")}
              />
              전체
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={userKind === "free"}
                onChange={() => setUserKind("free")}
              />
              무료회원
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={userKind === "paid"}
                onChange={() => setUserKind("paid")}
              />
              유료회원
            </label>
          </div>
        </div>
        <div className="grid grid-cols-[100px_1fr] text-sm">
          <div className="bg-stone-50 px-3 py-3 font-medium text-stone-700">검색어</div>
          <div className="flex flex-wrap items-center gap-2 px-3 py-2">
            <select
              value={searchField}
              onChange={(e) => setSearchField(e.target.value as SearchField)}
              className={`h-9 rounded border border-stone-300 px-2 pr-10 text-sm ${SELECT_CHEVRON_TAILWIND}`}
            >
              <option value="username">아이디</option>
              <option value="name">이름</option>
              <option value="phone">전화번호</option>
              <option value="martName">마트명</option>
              <option value="referrer">추천인</option>
            </select>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="h-9 w-full max-w-[300px] rounded border border-stone-300 px-3 text-sm"
            />
          </div>
        </div>
      </div>
      <div className="mb-4 flex items-center justify-center gap-2">
        <button
          type="button"
          className="h-9 min-w-[84px] rounded bg-stone-700 px-4 text-sm font-medium text-white"
        >
          검색
        </button>
        <button
          type="button"
          onClick={resetFilters}
          className="h-9 min-w-[84px] rounded bg-stone-200 px-4 text-sm font-medium text-stone-700"
        >
          초기화
        </button>
      </div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <p className="text-stone-700">총 {filteredUsers.length.toLocaleString()}건</p>
        <button
          type="button"
          onClick={downloadExcel}
          className="rounded border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
        >
          엑셀다운로드
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-stone-200">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-stone-600">
            <tr>
              <th className="px-3 py-2 text-center">No.</th>
              <th className="px-3 py-2 text-center">가입일</th>
              <th className="px-3 py-2 text-center">아이디</th>
              <th className="px-3 py-2 text-center">마트명</th>
              <th className="px-3 py-2 text-center">이름</th>
              <th className="px-3 py-2 text-center">회원유형</th>
              <th className="px-3 py-2 text-center">이용중 구독</th>
              <th className="px-3 py-2 text-center">추천인</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u, idx) => {
              const id = String(u.id ?? "");
              const joined = inferJoinedAt(u);
              const planId = String(u.planId ?? "free");
              const referrerLabel =
                (referrerNameById.get(String(u.referrerId ?? "")) ??
                  String(u.referrerId ?? "-")) || "-";
              return (
                <tr
                  key={id}
                  className="cursor-pointer border-t border-stone-100 hover:bg-stone-50"
                  onClick={() => router.push(`/admin/users/${id}`)}
                >
                  <td className="px-3 py-2 text-center align-middle tabular-nums">{filteredUsers.length - idx}</td>
                  <td className="px-3 py-2 text-center align-middle">
                    {joined ? new Date(joined).toLocaleDateString("ko-KR") : "-"}
                  </td>
                  <td className="px-3 py-2 text-center align-middle">{String(u.username ?? "-")}</td>
                  <td className="px-3 py-2 text-center align-middle">{String(u.martName ?? "-")}</td>
                  <td className="px-3 py-2 text-center align-middle">{String(u.name ?? "-")}</td>
                  <td className="px-3 py-2 text-center align-middle">
                    {planId === "free" ? "무료회원" : "유료회원"}
                  </td>
                  <td className="px-3 py-2 text-center align-middle">
                    <AdminUserPlanCell
                      planInfo={
                        planDisplayByUserId.get(id) ?? {
                          effectivePlanId: planId,
                          cancelRequested: false,
                          currentPeriodEndIso: null,
                          nextPaymentDueIso: null,
                          nextBillingPlanId: isPaidSubscriptionPlanId(planId) ? planId : null,
                          nextBillingPlanChanges: false,
                        }
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-center align-middle">{referrerLabel}</td>
                </tr>
              );
            })}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-stone-500">
                  가입된 회원이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}

