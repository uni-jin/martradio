"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AdminShell from "@/app/_components/AdminShell";
import { getAdminReferrers, saveAdminReferrers, type AdminReferrer } from "@/lib/adminData";

export default function AdminReferrerFormPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("editId");
  const all = useMemo(() => getAdminReferrers(), []);
  const editing = useMemo(() => all.find((r) => r.id === editId) ?? null, [all, editId]);

  const [code, setCode] = useState(editing?.name ?? "");
  const [personName, setPersonName] = useState(editing?.personName ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);

  const title = editing ? "추천인 수정" : "추천인 추가";

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError("추천인을 입력해 주세요.");
      return;
    }

    const now = new Date().toISOString();
    let next: AdminReferrer[];
    if (editing) {
      next = all.map((r) =>
        r.id === editing.id
          ? {
              ...r,
              name: trimmedCode,
              personName: personName.trim(),
              phone: phone.trim(),
              email: email.trim(),
              isActive,
              updatedAt: now,
            }
          : r
      );
    } else {
      const newId = `ref_${Date.now()}`;
      next = [
        ...all,
        {
          id: newId,
          name: trimmedCode,
          personName: personName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          isActive,
          createdAt: now,
          updatedAt: now,
        },
      ];
    }
    saveAdminReferrers(next);
    router.push(editing ? `/admin/referrers/${editing.id}` : "/admin/referrers");
  };

  return (
    <AdminShell title={title}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="overflow-x-auto rounded-xl border border-stone-200">
          <table className="min-w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[130px]" />
              <col />
            </colgroup>
            <tbody>
              <tr className="border-t border-stone-100">
                <th className="bg-stone-50 px-3 py-2 text-left font-medium text-stone-600">추천인</th>
                <td className="px-3 py-2">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="h-10 w-full rounded border border-stone-300 px-3 text-sm"
                    placeholder="추천인 코드명"
                  />
                </td>
              </tr>
              <tr className="border-t border-stone-100">
                <th className="bg-stone-50 px-3 py-2 text-left font-medium text-stone-600">이름</th>
                <td className="px-3 py-2">
                  <input
                    value={personName}
                    onChange={(e) => setPersonName(e.target.value)}
                    className="h-10 w-full rounded border border-stone-300 px-3 text-sm"
                    placeholder="실제 담당자 이름"
                  />
                </td>
              </tr>
              <tr className="border-t border-stone-100">
                <th className="bg-stone-50 px-3 py-2 text-left font-medium text-stone-600">전화번호</th>
                <td className="px-3 py-2">
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-10 w-full rounded border border-stone-300 px-3 text-sm"
                    placeholder="01012345678"
                  />
                </td>
              </tr>
              <tr className="border-t border-stone-100">
                <th className="bg-stone-50 px-3 py-2 text-left font-medium text-stone-600">이메일</th>
                <td className="px-3 py-2">
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-10 w-full rounded border border-stone-300 px-3 text-sm"
                    placeholder="example@mart.com"
                  />
                </td>
              </tr>
              <tr className="border-t border-stone-100">
                <th className="bg-stone-50 px-3 py-2 text-left font-medium text-stone-600">활성여부</th>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-4 text-sm text-stone-700">
                    <label className="flex items-center gap-1.5">
                      <input type="radio" checked={isActive} onChange={() => setIsActive(true)} />
                      활성
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="radio" checked={!isActive} onChange={() => setIsActive(false)} />
                      비활성
                    </label>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button
            type="submit"
            className="rounded bg-stone-700 px-5 py-2 text-sm font-medium text-white hover:bg-stone-800"
          >
            저장
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded border border-stone-300 bg-white px-5 py-2 text-sm text-stone-700 hover:bg-stone-50"
          >
            취소
          </button>
        </div>
      </form>
    </AdminShell>
  );
}
