"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginAdmin } from "@/lib/adminAuth";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginAdmin(username.trim(), password);
      router.push("/admin");
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col justify-center overflow-y-hidden bg-[var(--bg)]">
      <div className="mx-auto w-full max-w-md px-4">
        <div className="w-full rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-stone-800">관리자 로그인</h1>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-sm text-stone-600">아이디</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-stone-600">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              disabled={loading}
              className="w-full rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-70"
            >
              {loading ? "로그인 중..." : "로그인"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

