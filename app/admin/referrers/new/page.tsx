"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AdminShell from "@/app/_components/AdminShell";
import { getCurrentAdmin } from "@/lib/adminAuth";
import type { AdminReferrer } from "@/lib/adminData";

async function fetchReferrer(id: string): Promise<AdminReferrer | null> {
  const res = await fetch(`/api/admin/referrers/${encodeURIComponent(id)}`, { credentials: "include" });
  if (!res.ok) return null;
  const data = (await res.json()) as { referrer?: AdminReferrer };
  return data.referrer ?? null;
}

export default function AdminReferrerFormPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("editId");
  const isSuper = getCurrentAdmin()?.role === "super";

  const [loading, setLoading] = useState(!!editId);
  const [loginId, setLoginId] = useState("");
  const [code, setCode] = useState("");
  const [personName, setPersonName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editId) return;
    let canceled = false;
    void (async () => {
      const row = await fetchReferrer(editId);
      if (canceled) return;
      if (!row) {
        setError("추천인을 찾을 수 없습니다.");
        setLoading(false);
        return;
      }
      setLoginId(row.loginId);
      setCode(row.name);
      setPersonName(row.personName ?? "");
      setPhone(row.phone ?? "");
      setEmail(row.email ?? "");
      setIsActive(row.isActive);
      setLoading(false);
    })();
    return () => {
      canceled = true;
    };
  }, [editId]);

  const title = editId ? "추천인 수정" : "추천인 추가";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isSuper) {
      setError("최고 관리자만 저장할 수 있습니다.");
      return;
    }
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError("추천인(코드명)을 입력해 주세요.");
      return;
    }
    if (!editId) {
      const lid = loginId.trim();
      if (!/^[a-zA-Z0-9]{2,64}$/.test(lid)) {
        setError("추천인 ID는 영문·숫자만 2~64자로 입력해 주세요.");
        return;
      }
    }

    if (editId) {
      const res = await fetch(`/api/admin/referrers/${encodeURIComponent(editId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: trimmedCode,
          personName: personName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          isActive,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "저장에 실패했습니다.");
        return;
      }
      router.push(`/admin/referrers/${editId}`);
      return;
    }

    const res = await fetch("/api/admin/referrers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        loginId: loginId.trim(),
        name: trimmedCode,
        personName: personName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        isActive,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; referrer?: { id: string } };
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "저장에 실패했습니다.");
      return;
    }
    const id = data.referrer?.id;
    router.push(id ? `/admin/referrers/${id}` : "/admin/referrers");
  };

  return (
    <AdminShell title={title}>
      {loading ? (
        <p className="text-sm text-stone-500">불러오는 중…</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-stone-200">
            <table className="min-w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[130px]" />
                <col />
              </colgroup>
              <tbody>
                <tr className="border-t border-stone-100">
                  <th className="bg-stone-50 px-3 py-2 text-left font-medium text-stone-600">추천인 ID</th>
                  <td className="px-3 py-2">
                    <input
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      disabled={!!editId}
                      className="h-10 w-full rounded border border-stone-300 px-3 text-sm disabled:bg-stone-100"
                      placeholder="영문·숫자 (로그인 아이디)"
                      autoComplete="off"
                    />
                    <p className="mt-1 text-xs text-stone-500">
                      최초 비밀번호는 ID와 동일합니다. 추천인 관리자는 최초 로그인 후 변경해야 합니다.
                    </p>
                  </td>
                </tr>
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
              disabled={!isSuper}
              className="rounded bg-stone-700 px-5 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
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
      )}
    </AdminShell>
  );
}
