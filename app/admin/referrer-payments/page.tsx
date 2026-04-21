"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import AdminShell from "@/app/_components/AdminShell";
import type { AdminPayment, AdminReferrer } from "@/lib/adminData";
import { SELECT_CHEVRON_TAILWIND } from "@/app/_lib/selectChevron";
import { fetchAdminJsonCached } from "@/lib/adminClientCache";

function inferJoinedAt(u: Record<string, unknown>): string | null {
  if (typeof u.createdAt === "string" && u.createdAt.trim()) return u.createdAt;
  const id = typeof u.id === "string" ? u.id : "";
  const m = /^user_(\d+)$/.exec(id);
  if (!m) return null;
  const ms = Number(m[1]);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function localYearMonth(iso: string): { year: number; month: number } {
  const d = new Date(iso);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

type MonthCell = { joins: number; payCount: number; paySum: number };

function buildMonthStats(
  referrerId: string,
  year: number,
  users: Record<string, unknown>[],
  payments: { paidAt: string; referrerId?: string | null; amount: number }[]
): MonthCell[] {
  const months: MonthCell[] = [];
  for (let month = 1; month <= 12; month++) {
    let joins = 0;
    for (const u of users) {
      if (String(u.referrerId ?? "") !== referrerId) continue;
      const ja = inferJoinedAt(u);
      if (!ja) continue;
      const lm = localYearMonth(ja);
      if (lm.year === year && lm.month === month) joins++;
    }
    let payCount = 0;
    let paySum = 0;
    for (const p of payments) {
      if ((p.referrerId ?? "") !== referrerId) continue;
      const lm = localYearMonth(p.paidAt);
      if (lm.year === year && lm.month === month) {
        payCount++;
        paySum += p.amount;
      }
    }
    months.push({ joins, payCount, paySum });
  }
  return months;
}

export default function AdminReferrerPaymentsPage() {
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [referrers, setReferrers] = useState<AdminReferrer[]>([]);
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    let canceled = false;
    void (async () => {
      const [refData, usersData, payData] = await Promise.all([
        fetchAdminJsonCached<{ referrers?: AdminReferrer[] }>("/api/admin/referrers"),
        fetchAdminJsonCached<{ users?: Record<string, unknown>[] }>("/api/admin/users"),
        fetchAdminJsonCached<{ payments?: AdminPayment[] }>("/api/admin/data/payments"),
      ]);
      if (canceled) return;
      setReferrers(Array.isArray(refData.referrers) ? refData.referrers : []);
      setUsers(Array.isArray(usersData.users) ? usersData.users : []);
      setPayments(Array.isArray(payData.payments) ? payData.payments : []);
    })();
    return () => {
      canceled = true;
    };
  }, []);

  const [year, setYear] = useState(() => new Date().getFullYear());

  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    const thisYear = new Date().getFullYear();
    for (const p of payments) {
      const y = new Date(p.paidAt).getFullYear();
      if (Number.isFinite(y)) set.add(y);
    }
    set.add(thisYear);
    return [...set].sort((a, b) => b - a);
  }, [payments]);

  /** 생성일 오름차순으로 No. 1…N 부여 후, 표시는 No. 내림차순(큰 번호가 위). */
  const rows = useMemo(() => {
    const asc = [...referrers].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const numbered = asc.map((r, i) => ({
      no: i + 1,
      referrer: r,
      months: buildMonthStats(r.id, year, users, payments),
    }));
    return [...numbered].reverse();
  }, [referrers, users, payments, year]);

  const resetFilters = () => {
    setYear(new Date().getFullYear());
  };

  const downloadExcel = () => {
    const header: string[] = ["No.", "생성일", "추천인"];
    for (let m = 1; m <= 12; m++) {
      header.push(`${m}월 가입자 수`, `${m}월 결제 수`, `${m}월 결제 합계`);
    }
    const body = rows.map((row) => {
      const created = new Date(row.referrer.createdAt);
      const createdStr = Number.isNaN(created.getTime())
        ? row.referrer.createdAt
        : created.toLocaleDateString("ko-KR");
      const flat = row.months.flatMap((c) => [
        String(c.joins),
        String(c.payCount),
        String(c.paySum),
      ]);
      return [String(row.no), createdStr, row.referrer.name, ...flat];
    });
    const csv = [header, ...body]
      .map((r) => r.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `마트방송_referrer_stats_${year}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatReferrerCreated = (r: AdminReferrer) => {
    const d = new Date(r.createdAt);
    return Number.isNaN(d.getTime()) ? r.createdAt : d.toLocaleDateString("ko-KR");
  };

  return (
    <AdminShell title="">
      <div className="mb-4 overflow-hidden border border-stone-300">
        <div className="grid grid-cols-[100px_1fr] text-sm">
          <div className="bg-stone-50 px-3 py-3 font-medium text-stone-700">년도</div>
          <div className="flex flex-wrap items-center gap-2 px-3 py-2">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className={`h-9 rounded border border-stone-300 px-2 pr-12 text-sm ${SELECT_CHEVRON_TAILWIND}`}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
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
        <p className="text-stone-700">총 {rows.length.toLocaleString()}건</p>
        <button
          type="button"
          onClick={downloadExcel}
          className="rounded border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
        >
          엑셀다운로드
        </button>
      </div>
      <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-stone-200">
        <table className="w-max min-w-full border-collapse text-sm">
          <thead className="bg-stone-50 text-stone-600">
            <tr>
              <th rowSpan={2} className="border-b border-stone-200 px-2 py-2 text-center align-middle">
                No.
              </th>
              <th rowSpan={2} className="border-b border-stone-200 px-2 py-2 text-center align-middle">
                생성일
              </th>
              <th rowSpan={2} className="border-b border-stone-200 px-2 py-2 text-center align-middle">
                추천인
              </th>
              {Array.from({ length: 12 }, (_, i) => (
                <th
                  key={i}
                  colSpan={3}
                  className="border-b border-l border-stone-200 px-1 py-2 text-center text-xs font-semibold whitespace-nowrap"
                >
                  {i + 1}월
                </th>
              ))}
            </tr>
            <tr>
              {Array.from({ length: 12 }, (_, mi) => (
                <Fragment key={mi}>
                  <th className="min-w-[4.5rem] border-b border-l border-stone-200 px-2 py-1.5 text-center text-[11px] font-normal whitespace-nowrap">
                    가입자 수
                  </th>
                  <th className="min-w-[3.5rem] border-b border-stone-200 px-2 py-1.5 text-center text-[11px] font-normal whitespace-nowrap">
                    결제 수
                  </th>
                  <th className="min-w-[5rem] border-b border-stone-200 px-2 py-1.5 text-center text-[11px] font-normal whitespace-nowrap">
                    결제 합계
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.referrer.id} className="border-t border-stone-100">
                <td className="whitespace-nowrap px-2 py-2 text-center tabular-nums">{row.no}</td>
                <td className="whitespace-nowrap px-2 py-2 text-center">{formatReferrerCreated(row.referrer)}</td>
                <td className="whitespace-nowrap px-2 py-2 text-center">{row.referrer.name}</td>
                {row.months.map((c, mi) => (
                  <Fragment key={`${row.referrer.id}-m-${mi}`}>
                    <td className="min-w-[4.5rem] border-l border-stone-100 px-2 py-2 text-center text-xs tabular-nums whitespace-nowrap">
                      {c.joins}
                    </td>
                    <td className="min-w-[3.5rem] border-stone-100 px-2 py-2 text-center text-xs tabular-nums whitespace-nowrap">
                      {c.payCount}
                    </td>
                    <td className="min-w-[5rem] px-2 py-2 text-right text-xs tabular-nums whitespace-nowrap">
                      {c.paySum.toLocaleString()}원
                    </td>
                  </Fragment>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={39} className="px-3 py-6 text-center text-stone-500">
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
