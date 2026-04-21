"use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell from "@/app/_components/AdminShell";
import { useAdminSession } from "@/app/_components/AdminSessionProvider";
import type { AdminPayment, AdminReferrer } from "@/lib/adminData";
import { getPlanDisplayLabel } from "@/lib/auth";
import { buildPaymentOrderNoMap } from "@/lib/adminPaymentOrderNo";
import { billingPeriodsForPaymentHistoryOldestFirst } from "@/lib/subscriptionPeriod";
import { SELECT_CHEVRON_TAILWIND } from "@/app/_lib/selectChevron";
import { fetchAdminJsonCached } from "@/lib/adminClientCache";

function formatYmdKorean(ymd: string | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "-";
  const d = new Date(`${ymd}T12:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString("ko-KR");
}

function userGroupKey(p: AdminPayment): string {
  const uid = (p.userId ?? "").trim();
  if (uid) return `uid:${uid}`;
  return `un:${(p.username ?? "").trim()}`;
}

export default function AdminPaymentsPage() {
  const { session } = useAdminSession();
  const [products, setProducts] = useState<
    { id: string; name: string; priceMonthly: number; isActive?: boolean }[]
  >([]);
  const productsForPaymentFilter = useMemo(
    () => products.filter((p) => p.id !== "free"),
    [products]
  );
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const productPriceById = useMemo(
    () => new Map(products.map((p) => [p.id, p.priceMonthly])),
    [products]
  );

  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const scopeReferrerId =
    session?.role === "referrer_admin" && session.referrerId ? session.referrerId : null;
  const scopedUsers = useMemo(() => {
    if (!scopeReferrerId) return users;
    return users.filter((u) => String(u.referrerId ?? "") === scopeReferrerId);
  }, [scopeReferrerId, users]);
  const [referrers, setReferrers] = useState<AdminReferrer[]>([]);
  useEffect(() => {
    let canceled = false;
    void (async () => {
      const [refData, userData, payData, prodData] = await Promise.all([
        fetchAdminJsonCached<{ referrers?: AdminReferrer[] }>("/api/admin/referrers"),
        fetchAdminJsonCached<{ users?: Record<string, unknown>[] }>("/api/admin/users"),
        fetchAdminJsonCached<{ payments?: AdminPayment[] }>("/api/admin/data/payments"),
        fetchAdminJsonCached<{
          products?: { id: string; name: string; priceMonthly: number; isActive?: boolean }[];
        }>("/api/admin/data/products"),
      ]);
      if (!canceled) {
        setReferrers(Array.isArray(refData.referrers) ? refData.referrers : []);
        setUsers(Array.isArray(userData.users) ? userData.users : []);
        setPayments(Array.isArray(payData.payments) ? payData.payments : []);
        setProducts(Array.isArray(prodData.products) ? prodData.products : []);
      }
    })();
    return () => {
      canceled = true;
    };
  }, []);
  const referrerNameById = useMemo(
    () => new Map(referrers.map((r) => [r.id, r.name])),
    [referrers]
  );

  const userByKey = useMemo(() => {
    const m = new Map<string, Record<string, unknown>>();
    for (const u of scopedUsers) {
      const id = String(u.id ?? "");
      const un = String(u.username ?? "");
      if (id) m.set(`id:${id}`, u);
      if (un) m.set(`un:${un}`, u);
    }
    return m;
  }, [scopedUsers]);

  const scopedPayments = useMemo(() => {
    if (!scopeReferrerId) return payments;
    return payments.filter((p) => {
      const uid = (p.userId ?? "").trim();
      const un = (p.username ?? "").trim();
      const matched =
        (uid ? userByKey.get(`id:${uid}`) : undefined) ?? (un ? userByKey.get(`un:${un}`) : undefined);
      if (matched) return true;
      return String(p.referrerId ?? "") === scopeReferrerId;
    });
  }, [payments, scopeReferrerId, userByKey]);

  const planExpiryYmdByPaymentId = useMemo(() => {
    const byGroup = new Map<string, AdminPayment[]>();
    for (const p of scopedPayments) {
      const k = userGroupKey(p);
      if (!byGroup.has(k)) byGroup.set(k, []);
      byGroup.get(k)!.push(p);
    }
    const out = new Map<string, string>();
    for (const [, plist] of byGroup) {
      const oldestFirst = [...plist].sort(
        (a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime()
      );
      const periods = billingPeriodsForPaymentHistoryOldestFirst(oldestFirst);
      oldestFirst.forEach((pay, i) => {
        const ymd = periods[i]?.planExpiresOn;
        if (ymd) out.set(pay.id, ymd);
      });
    }
    return out;
  }, [scopedPayments]);

  const orderNoByPaymentId = useMemo(() => buildPaymentOrderNoMap(scopedPayments), [scopedPayments]);

  const [periodType, setPeriodType] = useState("결제일");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [productAll, setProductAll] = useState(true);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  const filteredPayments = useMemo(() => {
    const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : NaN;
    const toMs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : NaN;
    const selectedSet = new Set(selectedProductIds);

    return scopedPayments
      .filter((p) => {
        const paidMs = new Date(p.paidAt).getTime();
        if (!Number.isNaN(fromMs) && paidMs < fromMs) return false;
        if (!Number.isNaN(toMs) && paidMs > toMs) return false;
        if (!productAll) {
          if (selectedSet.size === 0) return false;
          if (!selectedSet.has(p.productId)) return false;
        }
        return true;
      })
      .slice()
      .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
  }, [fromDate, productAll, scopedPayments, selectedProductIds, toDate]);

  const paymentStats = useMemo(() => {
    const list = filteredPayments;
    const count = list.length;
    const totalAmount = list.reduce((sum, p) => sum + p.amount, 0);
    return {
      count,
      totalAmount,
      averageAmount: count > 0 ? Math.round(totalAmount / count) : 0,
    };
  }, [filteredPayments]);

  const resetFilters = () => {
    setPeriodType("결제일");
    setFromDate("");
    setToDate("");
    setProductAll(true);
    setSelectedProductIds([]);
  };

  const resolveUser = (p: AdminPayment): Record<string, unknown> | undefined => {
    const uid = (p.userId ?? "").trim();
    const un = (p.username ?? "").trim();
    if (uid) {
      const byId = userByKey.get(`id:${uid}`);
      if (byId) return byId;
    }
    if (un) return userByKey.get(`un:${un}`);
    return undefined;
  };

  const downloadExcel = () => {
    const header = [
      "결제 일시",
      "주문번호",
      "아이디",
      "마트명",
      "이름",
      "추천인",
      "구독",
      "구독 만료일",
      "판매가",
      "결제 금액",
    ];
    const rows = filteredPayments.map((p) => {
      const u = resolveUser(p);
      const martName = u ? String(u.martName ?? "-") : "-";
      const name = u ? String(u.name ?? "-") : "-";
      const refId = u ? String(u.referrerId ?? "") : "";
      const referrer =
        refId && referrerNameById.has(refId)
          ? String(referrerNameById.get(refId))
          : refId || "-";
      const priceMonthly = productPriceById.get(p.productId);
      const salePrice =
        typeof priceMonthly === "number" && Number.isFinite(priceMonthly)
          ? String(priceMonthly)
          : "-";
      const expiryYmd = planExpiryYmdByPaymentId.get(p.id);
      return [
        new Date(p.paidAt).toLocaleString("ko-KR"),
        orderNoByPaymentId.get(p.id) ?? "-",
        p.username,
        martName,
        name,
        referrer,
        getPlanDisplayLabel(p.productId),
        expiryYmd ? formatYmdKorean(expiryYmd) : "-",
        salePrice,
        String(p.amount),
      ];
    });
    const csv = [["No.", ...header], ...rows.map((r, i) => [String(rows.length - i), ...r])]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `마트방송_payments_${new Date().toISOString().slice(0, 10)}.csv`;
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
              <option>결제일</option>
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
        <div className="grid grid-cols-[100px_1fr] text-sm">
          <div className="bg-stone-50 px-3 py-3 font-medium text-stone-700">상품 종류</div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3 text-sm text-stone-700">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={productAll}
                onChange={(e) => {
                  const c = e.target.checked;
                  setProductAll(c);
                  if (c) setSelectedProductIds([]);
                }}
              />
              전체
            </label>
            {productsForPaymentFilter.map((prod) => (
              <label key={prod.id} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={!productAll && selectedProductIds.includes(prod.id)}
                  onChange={(e) => {
                    const c = e.target.checked;
                    if (c) {
                      setProductAll(false);
                      setSelectedProductIds((prev) =>
                        prev.includes(prod.id) ? prev : [...prev, prod.id]
                      );
                    } else {
                      setSelectedProductIds((prev) => prev.filter((id) => id !== prod.id));
                    }
                  }}
                />
                {prod.name}
              </label>
            ))}
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
      <div className="mb-4 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
          <span>
            <span className="text-stone-500">건수</span>{" "}
            <strong className="tabular-nums text-stone-900">
              {paymentStats.count.toLocaleString()}
            </strong>
            건
          </span>
          <span>
            <span className="text-stone-500">합계</span>{" "}
            <strong className="tabular-nums text-base font-semibold text-[#28579d]">
              {paymentStats.totalAmount.toLocaleString()}원
            </strong>
          </span>
          {paymentStats.count > 0 ? (
            <span>
              <span className="text-stone-500">평균</span>{" "}
              <strong className="tabular-nums text-stone-800">
                {paymentStats.averageAmount.toLocaleString()}원
              </strong>
            </span>
          ) : null}
        </div>
      </div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <p className="text-stone-700">총 {filteredPayments.length.toLocaleString()}건</p>
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
              <th className="whitespace-nowrap px-3 py-2 text-center">결제 일시</th>
              <th className="whitespace-nowrap px-3 py-2 text-center">주문번호</th>
              <th className="whitespace-nowrap px-3 py-2 text-center">아이디</th>
              <th className="whitespace-nowrap px-3 py-2 text-center">마트명</th>
              <th className="whitespace-nowrap px-3 py-2 text-center">이름</th>
              <th className="whitespace-nowrap px-3 py-2 text-center">추천인</th>
              <th className="whitespace-nowrap px-3 py-2 text-center">구독</th>
              <th className="whitespace-nowrap px-3 py-2 text-center">구독 만료일</th>
              <th className="whitespace-nowrap px-3 py-2 text-center">판매가</th>
              <th className="whitespace-nowrap px-3 py-2 text-center">결제 금액</th>
            </tr>
          </thead>
          <tbody>
            {filteredPayments.map((p) => {
              const u = resolveUser(p);
              const martName = u ? String(u.martName ?? "-") : "-";
              const name = u ? String(u.name ?? "-") : "-";
              const refId = u ? String(u.referrerId ?? "") : "";
              const referrerLabel =
                refId && referrerNameById.has(refId)
                  ? String(referrerNameById.get(refId))
                  : refId || "-";
              const priceMonthly = productPriceById.get(p.productId);
              const salePrice =
                typeof priceMonthly === "number" && Number.isFinite(priceMonthly)
                  ? `${priceMonthly.toLocaleString()}원`
                  : "-";
              const expiryYmd = planExpiryYmdByPaymentId.get(p.id);
              return (
                <tr key={p.id} className="border-t border-stone-100">
                  <td className="whitespace-nowrap px-3 py-2 text-center">
                    {new Date(p.paidAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="max-w-[140px] truncate px-3 py-2 text-center font-mono text-xs">
                    {orderNoByPaymentId.get(p.id) ?? "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-center">{p.username}</td>
                  <td className="px-3 py-2 text-center">{martName}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-center">{name}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-center">{referrerLabel}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-center">
                    {getPlanDisplayLabel(p.productId)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-center">
                    {formatYmdKorean(expiryYmd)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-center tabular-nums">{salePrice}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-center tabular-nums">
                    {p.amount.toLocaleString()}원
                  </td>
                </tr>
              );
            })}
            {filteredPayments.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-stone-500">
                  결제 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
