"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "@/app/_components/AdminShell";
import { getCurrentAdmin } from "@/lib/adminAuth";
import { getAdminPayments, getAdminUsers, type AdminReferrer } from "@/lib/adminData";
import { SELECT_CHEVRON_TAILWIND } from "@/app/_lib/selectChevron";

type ActiveFilter = "all" | "active" | "inactive";
type ReferrerSearchField = "referrer" | "personName";

function inferCreatedAt(r: AdminReferrer): string | null {
  if (typeof r.createdAt === "string" && r.createdAt.trim()) return r.createdAt;
  return null;
}

export default function AdminReferrersPage() {
  const router = useRouter();
  const isSuper = getCurrentAdmin()?.role === "admin";
  const [referrers, setReferrers] = useState<AdminReferrer[]>([]);

  useEffect(() => {
    let canceled = false;
    void (async () => {
      const res = await fetch("/api/admin/referrers", { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as { referrers?: AdminReferrer[] };
      if (canceled) return;
      setReferrers(Array.isArray(data.referrers) ? data.referrers : []);
    })();
    return () => {
      canceled = true;
    };
  }, []);
  const users = useMemo(() => getAdminUsers(), []);
  const payments = useMemo(() => getAdminPayments(), []);

  const [periodType, setPeriodType] = useState("생성일");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [searchField, setSearchField] = useState<ReferrerSearchField>("referrer");
  const [keyword, setKeyword] = useState("");

  const metricsByReferrerId = useMemo(() => {
    const m = new Map<string, { signupCount: number; paymentCount: number; paymentAmount: number }>();
    for (const r of referrers) {
      m.set(r.id, { signupCount: 0, paymentCount: 0, paymentAmount: 0 });
    }
    for (const u of users) {
      const rid = String(u.referrerId ?? "");
      if (!rid || !m.has(rid)) continue;
      const cur = m.get(rid)!;
      m.set(rid, { ...cur, signupCount: cur.signupCount + 1 });
    }
    for (const p of payments) {
      const rid = String(p.referrerId ?? "");
      if (!rid || !m.has(rid)) continue;
      const cur = m.get(rid)!;
      m.set(rid, {
        ...cur,
        paymentCount: cur.paymentCount + 1,
        paymentAmount: cur.paymentAmount + p.amount,
      });
    }
    return m;
  }, [payments, referrers, users]);

  const filtered = useMemo(() => {
    const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : NaN;
    const toMs = toDate ? new Date(`${toDate}T23:59:59`).getTime() : NaN;
    const kw = keyword.trim().toLowerCase();

    return referrers
      .filter((r) => {
        const created = inferCreatedAt(r);
        const createdMs = created ? new Date(created).getTime() : NaN;
        if (!Number.isNaN(fromMs) && (Number.isNaN(createdMs) || createdMs < fromMs)) return false;
        if (!Number.isNaN(toMs) && (Number.isNaN(createdMs) || createdMs > toMs)) return false;

        if (activeFilter === "active" && !r.isActive) return false;
        if (activeFilter === "inactive" && r.isActive) return false;

        if (kw) {
          const value =
            searchField === "personName"
              ? String(r.personName ?? "").toLowerCase()
              : `${String(r.name ?? "").toLowerCase()} ${String(r.loginId ?? "").toLowerCase()}`;
          if (!value.includes(kw)) return false;
        }
        return true;
      })
      .slice()
      .sort((a, b) => {
        const aMs = inferCreatedAt(a) ? new Date(inferCreatedAt(a)!).getTime() : -1;
        const bMs = inferCreatedAt(b) ? new Date(inferCreatedAt(b)!).getTime() : -1;
        if (bMs !== aMs) return bMs - aMs;
        return a.name.localeCompare(b.name, "ko");
      });
  }, [activeFilter, fromDate, keyword, referrers, searchField, toDate]);

  const resetFilters = () => {
    setPeriodType("생성일");
    setFromDate("");
    setToDate("");
    setActiveFilter("all");
    setSearchField("referrer");
    setKeyword("");
  };

  const downloadExcel = () => {
    const header = ["추천인 ID", "추천인", "가입자 수", "결제 수", "결제 합계", "활성여부", "생성일"];
    const rows = filtered.map((r) => {
      const m = metricsByReferrerId.get(r.id) ?? { signupCount: 0, paymentCount: 0, paymentAmount: 0 };
      return [
        r.loginId ?? "",
        r.name,
        String(m.signupCount),
        String(m.paymentCount),
        `${m.paymentAmount.toLocaleString()}원`,
        r.isActive ? "활성" : "비활성",
        inferCreatedAt(r) ? new Date(inferCreatedAt(r)!).toLocaleDateString("ko-KR") : "-",
      ];
    });
    const csv = [["No.", ...header], ...rows.map((r, i) => [String(rows.length - i), ...r])]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `마트방송_referrers_${new Date().toISOString().slice(0, 10)}.csv`;
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
              <option>생성일</option>
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
          <div className="bg-stone-50 px-3 py-3 font-medium text-stone-700">활성여부</div>
          <div className="flex flex-wrap items-center gap-4 px-3 py-3 text-sm text-stone-700">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={activeFilter === "all"}
                onChange={() => setActiveFilter("all")}
              />
              전체
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={activeFilter === "active"}
                onChange={() => setActiveFilter("active")}
              />
              활성
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={activeFilter === "inactive"}
                onChange={() => setActiveFilter("inactive")}
              />
              비활성
            </label>
          </div>
        </div>
        <div className="grid grid-cols-[100px_1fr] text-sm">
          <div className="bg-stone-50 px-3 py-3 font-medium text-stone-700">검색어</div>
          <div className="flex flex-wrap items-center gap-2 px-3 py-2">
            <select
              value={searchField}
              onChange={(e) => setSearchField(e.target.value as ReferrerSearchField)}
              className={`h-9 rounded border border-stone-300 px-2 pr-10 text-sm ${SELECT_CHEVRON_TAILWIND}`}
            >
              <option value="referrer">추천인 / ID</option>
              <option value="personName">이름</option>
            </select>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="h-9 w-full max-w-[300px] rounded border border-stone-300 px-3 text-sm"
              placeholder={searchField === "personName" ? "이름 검색" : "추천인 또는 ID 검색"}
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
        <p className="text-stone-700">총 {filtered.length.toLocaleString()}건</p>
        <div className="flex items-center gap-2">
          {isSuper ? (
            <Link
              href="/admin/referrers/new"
              className="rounded border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
            >
              추천인 추가
            </Link>
          ) : null}
          <button
            type="button"
            onClick={downloadExcel}
            className="rounded border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
          >
            엑셀다운로드
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-stone-200">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-stone-600">
            <tr>
              <th className="px-3 py-2 text-center">No.</th>
              <th className="px-3 py-2 text-center">추천인 ID</th>
              <th className="px-3 py-2 text-center">추천인</th>
              <th className="px-3 py-2 text-center">가입자 수</th>
              <th className="px-3 py-2 text-center">결제 수</th>
              <th className="px-3 py-2 text-center">결제 합계</th>
              <th className="px-3 py-2 text-center">활성여부</th>
              <th className="px-3 py-2 text-center">생성일</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, idx) => {
              const m = metricsByReferrerId.get(r.id) ?? {
                signupCount: 0,
                paymentCount: 0,
                paymentAmount: 0,
              };
              const created = inferCreatedAt(r);
              return (
                <tr
                  key={r.id}
                  className="cursor-pointer border-t border-stone-100 hover:bg-stone-50"
                  onClick={() => router.push(`/admin/referrers/${r.id}`)}
                >
                  <td className="px-3 py-2 text-center tabular-nums">{filtered.length - idx}</td>
                  <td className="px-3 py-2 text-center">{r.loginId}</td>
                  <td className="px-3 py-2 text-center">{r.name}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{m.signupCount.toLocaleString()}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{m.paymentCount.toLocaleString()}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{m.paymentAmount.toLocaleString()}원</td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        r.isActive ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"
                      }`}
                    >
                      {r.isActive ? "활성" : "비활성"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {created ? new Date(created).toLocaleDateString("ko-KR") : "-"}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-stone-500">
                  추천인 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
