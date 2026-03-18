"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { register } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const [martName, setMartName] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [referralCode, setReferralCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!martName.trim() || !name.trim() || !email.trim() || !phone.trim() || !password) {
      setError("필수 항목을 모두 입력해 주세요.");
      return;
    }
    if (password.length < 6) {
      setError("비밀번호는 6자 이상으로 설정해 주세요.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호와 비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setLoading(true);
    try {
      await register({
        martName,
        name,
        email,
        phone,
        password,
        businessNumber,
        referralCode,
      });
      router.push("/");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "회원가입에 실패했습니다. 다시 시도해 주세요.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center px-4">
        <div className="w-full rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-stone-800">회원가입</h1>
          <p className="mt-2 text-sm text-stone-500">
            마트 담당자 정보를 입력하고, 마트방송 서비스를 사용할 계정을 만들어 주세요.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-sm text-stone-600">마트명 (필수)</label>
              <input
                type="text"
                value={martName}
                onChange={(e) => setMartName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800"
                placeholder="예: 유니마트 본점"
              />
            </div>
            <div>
              <label className="text-sm text-stone-600">
                사업자등록번호 <span className="text-xs text-stone-400">(선택)</span>
              </label>
              <input
                type="text"
                value={businessNumber}
                onChange={(e) => setBusinessNumber(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800"
                placeholder="예: 123-45-67890"
              />
            </div>
            <div>
              <label className="text-sm text-stone-600">담당자 이름 (필수)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800"
                placeholder="예: 홍길동"
              />
            </div>
            <div>
              <label className="text-sm text-stone-600">담당자 이메일 (아이디, 필수)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800"
                placeholder="예: mart@example.com"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="text-sm text-stone-600">연락처 (필수)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800"
                placeholder="예: 010-1234-5678"
              />
            </div>
            <div>
              <label className="text-sm text-stone-600">비밀번호 (필수)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800"
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs text-stone-400">6자 이상으로 설정해 주세요.</p>
            </div>
            <div>
              <label className="text-sm text-stone-600">비밀번호 확인 (필수)</label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="text-sm text-stone-600">
                추천인 코드 <span className="text-xs text-stone-400">(선택)</span>
              </label>
              <input
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800"
                placeholder="추천인이 제공한 코드가 있다면 입력해 주세요."
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "가입 중..." : "회원가입"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-stone-500">
            이미 계정이 있다면{" "}
            <Link href="/login" className="font-medium text-amber-600 hover:underline">
              로그인
            </Link>
            으로 이동해 주세요.
          </p>
        </div>
      </div>
    </main>
  );
}

