"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "@/app/_components/AdminShell";
import type { AdminProduct } from "@/lib/adminData";

function parseOptInt(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function AdminProductsPage() {
  const [list, setList] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/data/products", { credentials: "include" });
    const data = (await res.json().catch(() => ({}))) as { products?: AdminProduct[]; error?: string };
    if (!res.ok) {
      throw new Error(data.error || "목록을 불러오지 못했습니다.");
    }
    setList(Array.isArray(data.products) ? data.products : []);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const updateRow = (index: number, patch: Partial<AdminProduct>) => {
    setList((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setSavedMessage(null);
  };

  const save = async () => {
    setError(null);
    setSavedMessage(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/data/products", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: list }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "저장에 실패했습니다.");
      }
      setSavedMessage("저장했습니다.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell title="상품 관리">
      <p className="mb-4 text-sm leading-relaxed text-stone-600">
        구독 플랜(무료·유료)별 표시명, 가격, 방송문 글자 수·저장 세션 수, 방송 문구 템플릿 사용 여부를 설정합니다. 플랜 ID(
        <code className="rounded bg-stone-100 px-1 font-mono text-stone-800">free</code> /{" "}
        <code className="rounded bg-stone-100 px-1 font-mono text-stone-800">small</code> /{" "}
        <code className="rounded bg-stone-100 px-1 font-mono text-stone-800">medium</code> /{" "}
        <code className="rounded bg-stone-100 px-1 font-mono text-stone-800">large</code>
        )는 결제·구독 로직과 연결되어 있으므로 바꾸지 마세요.
      </p>

      {loading ? (
        <p className="text-sm text-stone-500">불러오는 중…</p>
      ) : (
        <>
          <div className="mb-4 overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-left text-stone-600">
                  <th className="whitespace-nowrap px-3 py-2 font-medium">ID</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">표시명</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">월 요금(원)</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">방송문 최대 글자</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">저장 방송 수</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">템플릿</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">활성</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p, index) => (
                  <tr key={p.id} className="border-b border-stone-100 last:border-0">
                    <td className="px-3 py-2 font-mono text-stone-800">{p.id}</td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) => updateRow(index, { name: e.target.value })}
                        className="w-full min-w-[8rem] rounded border border-stone-200 px-2 py-1.5"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={p.priceMonthly}
                        onChange={(e) =>
                          updateRow(index, { priceMonthly: Math.max(0, Number(e.target.value) || 0) })
                        }
                        className="w-28 rounded border border-stone-200 px-2 py-1.5 tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="비우면 무제한"
                        value={p.maxChars == null ? "" : String(p.maxChars)}
                        onChange={(e) => updateRow(index, { maxChars: parseOptInt(e.target.value) })}
                        className="w-28 rounded border border-stone-200 px-2 py-1.5 tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="비우면 무제한"
                        value={p.visibleSessionLimit == null ? "" : String(p.visibleSessionLimit)}
                        onChange={(e) =>
                          updateRow(index, { visibleSessionLimit: parseOptInt(e.target.value) })
                        }
                        className="w-24 rounded border border-stone-200 px-2 py-1.5 tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={p.templateEnabled}
                          onChange={(e) => updateRow(index, { templateEnabled: e.target.checked })}
                          className="h-4 w-4 rounded border-stone-300"
                        />
                        <span className="text-stone-700">허용</span>
                      </label>
                    </td>
                    <td className="px-3 py-2">
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={p.isActive}
                          onChange={(e) => updateRow(index, { isActive: e.target.checked })}
                          className="h-4 w-4 rounded border-stone-300"
                        />
                        <span className="text-stone-700">노출</span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          {savedMessage && <p className="mb-2 text-sm text-emerald-700">{savedMessage}</p>}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-60"
            >
              {saving ? "저장 중…" : "변경 사항 저장"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                void load().catch((e) => setError(e instanceof Error ? e.message : String(e)));
              }}
              className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-60"
            >
              다시 불러오기
            </button>
          </div>
        </>
      )}
    </AdminShell>
  );
}
