"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "@/app/_components/AdminShell";
import { useAdminSession } from "@/app/_components/AdminSessionProvider";
import { getCurrentAdmin } from "@/lib/adminAuth";

export default function AdminPasswordChangePage() {
  const router = useRouter();
  const { refresh } = useAdminSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const session = getCurrentAdmin();
  const isReferrer = session?.role === "referrer_admin";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isReferrer) {
      setError("비밀번호 변경은 추천인 관리자 계정에서만 사용할 수 있습니다.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("새 비밀번호와 확인이 일치하지 않습니다.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "비밀번호 변경에 실패했습니다.");
        return;
      }
      await refresh();
      router.replace("/admin");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminShell title="비밀번호 변경">
      {!isReferrer ? (
        <p className="text-sm text-stone-600">
          최고 관리자 계정의 비밀번호는 서버 환경 변수(ADMIN_PASSWORD)에서 변경합니다.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="max-w-md space-y-4">
          <div>
            <label className="text-sm text-stone-600">현재 비밀번호</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="text-sm text-stone-600">새 비밀번호</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="text-sm text-stone-600">새 비밀번호 확인</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              autoComplete="new-password"
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-stone-800 px-5 py-2 text-sm font-medium text-white hover:bg-stone-900 disabled:opacity-60"
          >
            {loading ? "처리 중…" : "변경"}
          </button>
        </form>
      )}
    </AdminShell>
  );
}
