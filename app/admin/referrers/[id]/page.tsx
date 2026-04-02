"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useParams } from "next/navigation";
import AdminShell from "@/app/_components/AdminShell";
import { getAdminReferrers } from "@/lib/adminData";

export default function AdminReferrerDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const referrer = useMemo(() => getAdminReferrers().find((r) => r.id === id) ?? null, [id]);

  return (
    <AdminShell title="추천인 상세">
      {!referrer ? (
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

          <div className="flex justify-end gap-2">
            <Link
              href={`/admin/referrers/new?editId=${encodeURIComponent(referrer.id)}`}
              className="rounded bg-stone-700 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
            >
              수정
            </Link>
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
