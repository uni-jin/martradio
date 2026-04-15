"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AdminShell from "@/app/_components/AdminShell";
import { getCurrentAdmin } from "@/lib/adminAuth";
import type { AdminReferrer } from "@/lib/adminData";

export default function AdminReferrerDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const isSuper = getCurrentAdmin()?.role === "admin";

  const [referrer, setReferrer] = useState<AdminReferrer | null | undefined>(undefined);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    void (async () => {
      const res = await fetch(`/api/admin/referrers/${encodeURIComponent(id)}`, { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as { referrer?: AdminReferrer };
      if (canceled) return;
      if (!res.ok) {
        setReferrer(null);
        return;
      }
      setReferrer(data.referrer ?? null);
    })();
    return () => {
      canceled = true;
    };
  }, [id]);

  const onResetPassword = async () => {
    if (!isSuper || !referrer) return;
    if (!window.confirm("비밀번호를 초기화하면 다시 추천인 ID와 동일한 값으로 설정됩니다. 진행할까요?")) {
      return;
    }
    setResetMsg(null);
    const res = await fetch(`/api/admin/referrers/${encodeURIComponent(id)}/reset-password`, {
      method: "POST",
      credentials: "include",
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      window.alert(typeof data.error === "string" ? data.error : "초기화에 실패했습니다.");
      return;
    }
    setResetMsg("비밀번호가 초기화되었습니다.");
  };

  return (
    <AdminShell title="추천인 상세">
      {referrer === undefined ? (
        <p className="text-sm text-stone-500">불러오는 중…</p>
      ) : !referrer ? (
        <div className="rounded-xl border border-stone-200 p-4 text-sm text-stone-500">
          추천인을 찾을 수 없습니다.
        </div>
      ) : (
        <div className="space-y-6">
          <section className="overflow-x-auto rounded-xl border border-stone-200">
            <table className="min-w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[130px]" />
                <col />
              </colgroup>
              <tbody>
                <tr className="border-t border-stone-100">
                  <th className="h-10 bg-stone-50 px-3 py-2 text-left font-medium text-stone-600">추천인 ID</th>
                  <td className="h-10 px-3 py-2">{referrer.loginId || "-"}</td>
                </tr>
                <tr className="border-t border-stone-100">
                  <th className="h-10 bg-stone-50 px-3 py-2 text-left font-medium text-stone-600">추천인</th>
                  <td className="h-10 px-3 py-2">{referrer.name || "-"}</td>
                </tr>
                <tr className="border-t border-stone-100">
                  <th className="h-10 bg-stone-50 px-3 py-2 text-left font-medium text-stone-600">이름</th>
                  <td className="h-10 px-3 py-2">{referrer.personName || "-"}</td>
                </tr>
                <tr className="border-t border-stone-100">
                  <th className="h-10 bg-stone-50 px-3 py-2 text-left font-medium text-stone-600">전화번호</th>
                  <td className="h-10 px-3 py-2">{referrer.phone || "-"}</td>
                </tr>
                <tr className="border-t border-stone-100">
                  <th className="h-10 bg-stone-50 px-3 py-2 text-left font-medium text-stone-600">이메일</th>
                  <td className="h-10 px-3 py-2">{referrer.email || "-"}</td>
                </tr>
                <tr className="border-t border-stone-100">
                  <th className="h-10 bg-stone-50 px-3 py-2 text-left font-medium text-stone-600">활성여부</th>
                  <td className="h-10 px-3 py-2">{referrer.isActive ? "활성" : "비활성"}</td>
                </tr>
                <tr className="border-t border-stone-100">
                  <th className="h-10 bg-stone-50 px-3 py-2 text-left font-medium text-stone-600">생성일</th>
                  <td className="h-10 px-3 py-2">
                    {referrer.createdAt ? new Date(referrer.createdAt).toLocaleDateString("ko-KR") : "-"}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {isSuper ? (
            <div className="rounded-xl border border-stone-200 p-4">
              <h2 className="text-sm font-semibold text-stone-800">비밀번호</h2>
              <p className="mt-1 text-xs text-stone-500">
                최초 비밀번호는 추천인 ID와 동일합니다. 아래에서 재설정하면 다시 ID와 같게 초기화됩니다.
              </p>
              {resetMsg ? <p className="mt-2 text-sm text-emerald-700">{resetMsg}</p> : null}
              <button
                type="button"
                onClick={() => void onResetPassword()}
                className="mt-3 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100"
              >
                비밀번호 초기화
              </button>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            {isSuper ? (
              <Link
                href={`/admin/referrers/new?editId=${encodeURIComponent(referrer.id)}`}
                className="rounded bg-stone-700 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
              >
                수정
              </Link>
            ) : null}
            <Link
              href="/admin/referrers"
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
            >
              목록
            </Link>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
