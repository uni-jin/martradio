"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AddressSearchFields from "@/app/_components/AddressSearchFields";
import { SELECT_CHEVRON_TAILWIND } from "@/app/_lib/selectChevron";
import { fetchReferrerOptions, register, type ReferrerOption } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const [referrerOptions, setReferrerOptions] = useState<ReferrerOption[]>([]);
  useEffect(() => {
    void fetchReferrerOptions().then(setReferrerOptions);
  }, []);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [martName, setMartName] = useState("");
  const [martAddressBase, setMartAddressBase] = useState("");
  const [martAddressDetail, setMartAddressDetail] = useState("");
  const [referrerId, setReferrerId] = useState("");
  const [referrerOpen, setReferrerOpen] = useState(false);
  const referrerMenuRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const hasRequestedPhoneVerification = sentCode !== null;

  const referrerTriggerLabel =
    referrerId === ""
      ? "선택 안 함"
      : referrerOptions.find((o) => o.id === referrerId)?.name ?? referrerId;

  useEffect(() => {
    if (!referrerOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (referrerMenuRef.current && !referrerMenuRef.current.contains(e.target as Node)) {
        setReferrerOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setReferrerOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [referrerOpen]);

  const requestPhoneVerification = () => {
    const normalizedPhone = phone.replace(/\D/g, "");
    if (!normalizedPhone) {
      setError("전화번호를 먼저 입력해 주세요.");
      return;
    }
    const code = String(Math.floor(1000 + Math.random() * 9000));
    setSentCode(code);
    setPhoneVerified(false);
    setPhoneCode("");
    setError(null);
    window.alert(`인증번호가 발송되었습니다. (테스트용: ${code})`);
  };

  const verifyPhoneCode = () => {
    if (!sentCode) {
      setError("먼저 인증요청을 눌러 주세요.");
      return;
    }
    if (phoneCode.trim() !== sentCode) {
      setPhoneVerified(false);
      setError("인증번호가 일치하지 않습니다.");
      return;
    }
    setPhoneVerified(true);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !martName.trim() || !name.trim() || !phone.trim() || !password) {
      setError("필수 항목을 모두 입력해 주세요.");
      return;
    }
    if (!phoneVerified) {
      setError("전화번호 인증을 완료해 주세요.");
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
    if (!agreedTerms || !agreedPrivacy) {
      setError("이용약관과 개인정보처리방침에 동의해 주세요.");
      return;
    }

    setLoading(true);
    try {
      await register({
        username,
        martName,
        martAddressBase: martAddressBase.trim() || undefined,
        martAddressDetail: martAddressDetail.trim() || undefined,
        name,
        phone,
        password,
        referrerId: referrerId.trim() || undefined,
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
    <main className="min-h-full bg-[var(--bg)] py-8">
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">
        <div className="w-full rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-stone-800">회원가입</h1>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-base text-stone-600">아이디 (필수)</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2.5 text-base text-stone-800"
                placeholder="영문/숫자 아이디"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="text-base text-stone-600">이름 (필수)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2.5 text-base text-stone-800"
                placeholder="예: 홍길동"
              />
            </div>
            <div>
              <label className="text-base text-stone-600">전화번호 (필수)</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2.5 text-base text-stone-800"
                  placeholder="예: 01012345678"
                />
                <button
                  type="button"
                  onClick={requestPhoneVerification}
                  className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-base font-medium text-amber-700 hover:bg-amber-100"
                >
                  인증요청
                </button>
              </div>
              {hasRequestedPhoneVerification && (
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={phoneCode}
                    onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    className="w-28 rounded-lg border border-stone-200 px-3 py-2.5 text-base text-stone-800"
                    placeholder="4자리"
                  />
                  <button
                    type="button"
                    onClick={verifyPhoneCode}
                    className="rounded-lg border border-stone-300 px-3 py-2 text-base font-medium text-stone-700 hover:bg-stone-50"
                  >
                    인증확인
                  </button>
                </div>
              )}
              <p className={`mt-1 text-sm ${phoneVerified ? "text-green-600" : "text-stone-400"}`}>
                {phoneVerified ? "전화번호 인증이 완료되었습니다." : "인증 완료 후 회원가입이 가능합니다."}
              </p>
            </div>
            <div>
              <label className="text-base text-stone-600">비밀번호 (필수)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2.5 text-base text-stone-800"
                autoComplete="new-password"
              />
              <p className="mt-1 text-sm text-stone-400">6자 이상으로 설정해 주세요.</p>
            </div>
            <div>
              <label className="text-base text-stone-600">비밀번호 확인 (필수)</label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2.5 text-base text-stone-800"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="text-base text-stone-600">마트명 (필수)</label>
              <input
                type="text"
                value={martName}
                onChange={(e) => setMartName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2.5 text-base text-stone-800"
                placeholder="예: 유니마트 본점"
              />
            </div>
            <AddressSearchFields
              baseValue={martAddressBase}
              detailValue={martAddressDetail}
              onBaseChange={setMartAddressBase}
              onDetailChange={setMartAddressDetail}
            />
            <div>
              <label htmlFor="referrer-menu-trigger" className="text-base text-stone-600">
                추천인 (선택)
              </label>
              {referrerOptions.length > 0 ? (
                <div className="relative" ref={referrerMenuRef}>
                  <button
                    type="button"
                    id="referrer-menu-trigger"
                    aria-label="추천인 선택"
                    aria-haspopup="menu"
                    aria-expanded={referrerOpen}
                    aria-controls="referrer-menu-panel"
                    className={`mt-1 inline-flex w-full cursor-pointer items-center rounded-lg border border-stone-200 bg-white py-2.5 pl-3 pr-10 text-left text-base font-medium hover:border-stone-300 ${SELECT_CHEVRON_TAILWIND} ${referrerId === "" ? "text-stone-500" : "text-stone-800"}`}
                    onClick={() => setReferrerOpen((o) => !o)}
                  >
                    <span className="min-w-0 truncate">{referrerTriggerLabel}</span>
                  </button>
                  {referrerOpen ? (
                    <div
                      id="referrer-menu-panel"
                      role="menu"
                      aria-labelledby="referrer-menu-trigger"
                      className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-60 overflow-y-auto rounded-xl border border-stone-200 bg-white py-1 shadow-lg"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className={`flex w-full px-3 py-2.5 text-left text-base text-stone-800 hover:bg-stone-50 ${referrerId === "" ? "bg-amber-50 font-medium text-amber-900" : ""}`}
                        onClick={() => {
                          setReferrerId("");
                          setReferrerOpen(false);
                        }}
                      >
                        선택 안 함
                      </button>
                      {referrerOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          role="menuitem"
                          className={`flex w-full px-3 py-2.5 text-left text-base text-stone-800 hover:bg-stone-50 ${option.id === referrerId ? "bg-amber-50 font-medium text-amber-900" : ""}`}
                          onClick={() => {
                            setReferrerId(option.id);
                            setReferrerOpen(false);
                          }}
                        >
                          {option.name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-1 text-sm text-stone-500">
                  현재 선택 가능한 활성 추천인이 없습니다. 추천인 없이 가입할 수 있습니다.
                </p>
              )}
            </div>
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
              <label className="flex items-start gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={agreedTerms}
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <Link href="/legal/terms" target="_blank" className="font-medium text-amber-700 hover:underline">
                    이용약관
                  </Link>
                  에 동의합니다. (필수)
                </span>
              </label>
              <label className="mt-2 flex items-start gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={agreedPrivacy}
                  onChange={(e) => setAgreedPrivacy(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <Link href="/legal/privacy" target="_blank" className="font-medium text-amber-700 hover:underline">
                    개인정보처리방침
                  </Link>
                  에 동의합니다. (필수)
                </span>
              </label>
            </div>

            {error && <p className="text-base text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-amber-500 px-4 py-3 text-base font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "가입 중..." : "회원가입"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-stone-500">
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
