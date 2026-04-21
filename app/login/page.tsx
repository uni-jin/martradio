"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSessionErrorMessage, login, type UserSessionErrorCode } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reason = (searchParams.get("reason") as UserSessionErrorCode | null) ?? null;
  const reasonMessage = reason ? getSessionErrorMessage(reason) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.push("/");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "로그인에 실패했습니다. 다시 시도해 주세요.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col justify-center bg-[var(--bg)]">
      <div className="mx-auto w-full max-w-md px-4 py-6">
        <div className="w-full rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-stone-800">마트방송 로그인</h1>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-base text-stone-600">아이디</label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2.5 text-base text-stone-800"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="text-base text-stone-600">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2.5 text-base text-stone-800"
                autoComplete="current-password"
              />
            </div>
            {(error || reasonMessage) && (
              <p className="text-base text-red-600">{error ?? reasonMessage}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-amber-500 px-4 py-3 text-base font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "로그인 중..." : "로그인"}
            </button>
          </form>
          <Link
            href="/demo/broadcast/new"
            className="mt-3 flex w-full items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base font-medium text-amber-900 hover:bg-amber-100"
          >
            로그인 없이 체험하기
          </Link>
          <Link
            href="/signup"
            className="mt-3 flex w-full items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-3 text-base font-medium text-stone-800 hover:bg-stone-50"
          >
            회원가입
          </Link>
        </div>
      </div>
    </main>
  );
}

