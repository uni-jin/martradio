"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "@/app/_components/AdminShell";

type TossWebhookLog = {
  receivedAt: string;
  eventType: string;
  orderId?: string;
  paymentKey?: string;
  status?: string;
  raw: unknown;
};

export default function AdminTossWebhookLogsPage() {
  const [logs, setLogs] = useState<TossWebhookLog[]>([]);
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [openedRows, setOpenedRows] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "100");
      if (eventTypeFilter) qs.set("eventType", eventTypeFilter);
      if (statusFilter) qs.set("status", statusFilter);
      if (fromDate) qs.set("from", new Date(fromDate).toISOString());
      if (toDate) qs.set("to", new Date(toDate).toISOString());
      const res = await fetch(`/api/webhooks/toss/logs?${qs.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true || !Array.isArray(data.logs)) {
        throw new Error(typeof data?.error === "string" ? data.error : "웹훅 로그 조회에 실패했습니다.");
      }
      setLogs(data.logs as TossWebhookLog[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [eventTypeFilter, fromDate, statusFilter, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminShell title="토스 웹훅 로그">
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <input
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            placeholder="이벤트 타입"
            className="rounded-lg border border-stone-200 px-3 py-2 text-sm"
          />
          <input
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            placeholder="상태 (DONE/CANCELED)"
            className="rounded-lg border border-stone-200 px-3 py-2 text-sm"
          />
          <input
            type="datetime-local"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-lg border border-stone-200 px-3 py-2 text-sm"
          />
          <input
            type="datetime-local"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-lg border border-stone-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            {loading ? "불러오는 중..." : "필터 적용"}
          </button>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm text-stone-500">
            최근 수신한 토스 웹훅 이벤트 목록입니다. (최대 100건)
          </p>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            {loading ? "불러오는 중..." : "새로고침"}
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="overflow-x-auto rounded-xl border border-stone-200">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 text-stone-600">
              <tr>
                <th className="px-3 py-2 text-left">수신시각</th>
                <th className="px-3 py-2 text-left">이벤트</th>
                <th className="px-3 py-2 text-left">상태</th>
                <th className="px-3 py-2 text-left">orderId</th>
                <th className="px-3 py-2 text-left">paymentKey</th>
                <th className="px-3 py-2 text-left">원본 payload</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, idx) => (
                <tr
                  key={`${log.receivedAt}_${idx}`}
                  className={`border-t align-top ${
                    (log.status ?? "").includes("CANCEL") ||
                    log.status === "ABORTED" ||
                    log.status === "EXPIRED"
                      ? "border-red-100 bg-red-50/40"
                      : "border-stone-100"
                  }`}
                >
                  <td className="px-3 py-2 whitespace-nowrap text-stone-700">
                    {new Date(log.receivedAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-3 py-2 text-stone-800">{log.eventType}</td>
                  <td className="px-3 py-2 text-stone-600">{log.status ?? "-"}</td>
                  <td className="px-3 py-2 text-stone-600">{log.orderId ?? "-"}</td>
                  <td className="px-3 py-2 text-stone-600">{log.paymentKey ?? "-"}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenedRows((prev) => ({
                          ...prev,
                          [String(idx)]: !prev[String(idx)],
                        }))
                      }
                      className="rounded border border-stone-300 px-2 py-1 text-xs text-stone-700"
                    >
                      {openedRows[String(idx)] ? "접기" : "보기"}
                    </button>
                    {openedRows[String(idx)] && (
                      <pre className="mt-2 max-w-[480px] overflow-auto rounded bg-stone-100 p-2 text-xs text-stone-700">
                        {JSON.stringify(log.raw, null, 2)}
                      </pre>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-stone-500">
                    수신된 웹훅 로그가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}

