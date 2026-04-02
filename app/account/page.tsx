"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AddressSearchFields from "@/app/_components/AddressSearchFields";
import {
  getCurrentUser,
  getReferrerOptions,
  getStoredUserForCurrentSession,
  updateCurrentUserProfile,
} from "@/lib/auth";

function normalizePhone(p: string) {
  return p.replace(/\D/g, "");
}

export default function AccountPage() {
  const router = useRouter();
  const referrerOptions = getReferrerOptions();

  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [savedPhone, setSavedPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [martName, setMartName] = useState("");
  const [martAddressBase, setMartAddressBase] = useState("");
  const [martAddressDetail, setMartAddressDetail] = useState("");
  const [referrerId, setReferrerId] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const hasRequestedPhoneVerification = sentCode !== null;

  const phoneNeedsVerify = normalizePhone(phone) !== normalizePhone(savedPhone);

  useEffect(() => {
    const cur = getCurrentUser();
    if (!cur) {
      router.replace("/login");
      return;
    }
    const su = getStoredUserForCurrentSession();
    if (!su) {
      router.replace("/");
      return;
    }
    setUsername(su.username);
    setName(su.name);
    setPhone(su.phone);
    setSavedPhone(su.phone);
    setMartName(su.martName);
    setMartAddressBase(su.martAddressBase?.trim() || su.martAddress?.trim() || "");
    setMartAddressDetail(su.martAddressDetail?.trim() || "");
    setReferrerId(su.referrerId ?? "");
    setReady(true);
  }, [router]);

  useEffect(() => {
    if (!phoneNeedsVerify) {
      setPhoneVerified(true);
      setSentCode(null);
      setPhoneCode("");
    } else {
      setPhoneVerified(false);
    }
  }, [phoneNeedsVerify]);

  const requestPhoneVerification = () => {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      setError("전화번호를 먼저 입력해 주세요.");
      return;
    }
    if (!phoneNeedsVerify) {
      setError("전화번호를 변경하려면 인증을 다시 해야 합니다.");
      return;
    }
    const code = String(Math.floor(1000 + Math.random() * 9000));
    setSentCode(code);
    setPhoneVerified(false);
    setPhoneCode("");
    setError(null);
    setSuccess(null);
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

  const handlePhoneInput = (v: string) => {
    setPhone(v);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name.trim() || !martName.trim() || !phone.trim()) {
      setError("필수 항목을 모두 입력해 주세요.");
      return;
    }
    if (phoneNeedsVerify && !phoneVerified) {
      setError("전화번호를 변경하려면 인증을 다시 해야 합니다.");
      return;
    }
    if (newPassword.trim() || newPasswordConfirm.trim()) {
      if (newPassword.length < 6) {
        setError("새 비밀번호는 6자 이상이어야 합니다.");
        return;
      }
      if (newPassword !== newPasswordConfirm) {
        setError("새 비밀번호와 확인이 일치하지 않습니다.");
        return;
      }
    }

    setLoading(true);
    try {
      updateCurrentUserProfile({
        name,
        martName,
        martAddressBase: martAddressBase.trim() || undefined,
        martAddressDetail: martAddressDetail.trim() || undefined,
        phone,
        newPassword: newPassword.trim() || undefined,
        newPasswordConfirm: newPasswordConfirm.trim() || undefined,
      });
      setSavedPhone(phone.trim());
      setNewPassword("");
      setNewPasswordConfirm("");
      setSentCode(null);
      setPhoneCode("");
      setSuccess("저장되었습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <main className="min-h-screen bg-[var(--bg)]">
        <div className="flex min-h-screen items-center justify-center text-stone-500">로딩 중...</div>
      </main>
    );
  }

  const referrerLabel =
    referrerOptions.find((r) => r.id === referrerId)?.name ?? (referrerId ? referrerId : "—");

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <div className="mx-auto max-w-md px-4 py-8">
        <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-stone-800">회원 정보 수정</h1>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-sm text-stone-600">아이디</label>
              <input
                type="text"
                value={username}
                readOnly
                className="mt-1 w-full rounded-lg border border-stone-100 bg-stone-50 px-3 py-2 text-sm text-stone-600"
              />
            </div>
            <div>
              <label className="text-sm text-stone-600">이름 (필수)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800"
              />
            </div>
            <div>
              <label className="text-sm text-stone-600">전화번호 (필수)</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => handlePhoneInput(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800"
                />
                <button
                  type="button"
                  onClick={requestPhoneVerification}
                  className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100"
                >
                  인증요청
                </button>
              </div>
              {phoneNeedsVerify && hasRequestedPhoneVerification && (
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={phoneCode}
                    onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    className="w-28 rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800"
                    placeholder="4자리"
                  />
                  <button
                    type="button"
                    onClick={verifyPhoneCode}
                    className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50"
                  >
                    인증확인
                  </button>
                </div>
              )}
              <p className={`mt-1 text-xs ${!phoneNeedsVerify || phoneVerified ? "text-green-600" : "text-stone-400"}`}>
                {!phoneNeedsVerify
                  ? "등록된 전화번호입니다."
                  : phoneVerified
                    ? "변경된 전화번호 인증이 완료되었습니다."
                    : "번호를 바꾼 경우 인증이 필요합니다."}
              </p>
            </div>
            <div>
              <label className="text-sm text-stone-600">새 비밀번호 (선택)</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800"
                autoComplete="new-password"
                placeholder="변경하지 않으면 비워 두세요"
              />
            </div>
            <div>
              <label className="text-sm text-stone-600">새 비밀번호 확인</label>
              <input
                type="password"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="text-sm text-stone-600">마트명 (필수)</label>
              <input
                type="text"
                value={martName}
                onChange={(e) => setMartName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800"
              />
            </div>
            <AddressSearchFields
              baseValue={martAddressBase}
              detailValue={martAddressDetail}
              onBaseChange={setMartAddressBase}
              onDetailChange={setMartAddressDetail}
              allowClear
            />
            <div>
              <label className="text-sm text-stone-600">추천인</label>
              <input
                type="text"
                value={referrerLabel}
                readOnly
                className="mt-1 w-full rounded-lg border border-stone-100 bg-stone-50 px-3 py-2 text-sm text-stone-600"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "저장 중..." : "저장"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-stone-500">
            <Link href="/" className="font-medium text-amber-600 hover:underline">
              메인으로
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
