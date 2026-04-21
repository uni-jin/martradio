export type PlanId = "free" | "small" | "medium" | "large";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  isUnlimited: boolean;
  planId?: PlanId;
};

export type UserSessionErrorCode =
  | "login_required"
  | "invalid_session"
  | "session_replaced"
  | "session_expired";

import {
  FREE_PLAN_BROADCAST_MAX_CHARS,
  getAdminProducts,
} from "@/lib/adminData";
let currentUserCache: AuthUser | null = null;
let authHydrating = false;
let lastSessionErrorCode: UserSessionErrorCode | null = null;

export type StoredUser = {
  id: string;
  username: string;
  name: string;
  martName: string;
  /** 주소검색으로 입력한 도로명·지번 주소 */
  martAddressBase?: string | null;
  /** 상세주소 */
  martAddressDetail?: string | null;
  /** 통합 (목록·표시용, base+detail 또는 예전 단일 필드) */
  martAddress?: string | null;
  phone: string;
  referrerId?: string | null;
  planId?: PlanId;
};

export type ReferrerOption = {
  id: string;
  name: string;
};

export function getCurrentUser(): AuthUser | null {
  if (typeof window !== "undefined" && !authHydrating && currentUserCache == null) {
    authHydrating = true;
    void refreshCurrentUser().finally(() => {
      authHydrating = false;
    });
  }
  return currentUserCache;
}

async function readAuthMe(): Promise<(AuthUser & Partial<StoredUser>) | null> {
  const res = await fetch("/api/public/auth/me", { cache: "no-store" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as {
      code?: UserSessionErrorCode;
    };
    lastSessionErrorCode = data.code ?? null;
    return null;
  }
  lastSessionErrorCode = null;
  const data = (await res.json().catch(() => ({}))) as {
    user?: (AuthUser & Partial<StoredUser>) | null;
  };
  return data.user ?? null;
}

export async function refreshCurrentUser(): Promise<AuthUser | null> {
  const me = await readAuthMe();
  currentUserCache = me
    ? {
        id: me.id,
        email: me.email,
        name: me.name,
        isUnlimited: false,
        planId: (me.planId ?? "free") as PlanId,
      }
    : null;
  return currentUserCache;
}

export function saveUser(user: AuthUser | null) {
  currentUserCache = user;
  if (user) lastSessionErrorCode = null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mart-auth-updated"));
  }
}

export function getLastSessionErrorCode(): UserSessionErrorCode | null {
  return lastSessionErrorCode;
}

export function getSessionErrorMessage(code: UserSessionErrorCode | null): string {
  if (code === "session_replaced") {
    return "중복 로그인으로 로그아웃되었습니다. 다시 로그인해 주세요.";
  }
  if (code === "session_expired") {
    return "24시간 동안 활동이 없어 세션이 만료되었습니다. 다시 로그인해 주세요.";
  }
  if (code === "invalid_session") {
    return "세션이 유효하지 않습니다. 다시 로그인해 주세요.";
  }
  return "로그인이 필요합니다.";
}

export type RegisterPayload = {
  username: string;
  password: string;
  name: string;
  martName: string;
  martAddressBase?: string;
  martAddressDetail?: string;
  phone: string;
  referrerId?: string;
};

const DEFAULT_REFERRERS: ReferrerOption[] = [
  { id: "ref-kim", name: "김영업" },
  { id: "ref-lee", name: "이대리" },
];

export async function fetchReferrerOptions(): Promise<ReferrerOption[]> {
  try {
    const res = await fetch("/api/public/referrer-options", { cache: "no-store" });
    if (!res.ok) return DEFAULT_REFERRERS;
    const data = (await res.json()) as { options?: unknown };
    if (!Array.isArray(data.options)) return DEFAULT_REFERRERS;
    const list = data.options.filter(
      (v): v is ReferrerOption =>
        v != null &&
        typeof v === "object" &&
        typeof (v as ReferrerOption).id === "string" &&
        typeof (v as ReferrerOption).name === "string"
    );
    return list.length > 0 ? list : DEFAULT_REFERRERS;
  } catch {
    return DEFAULT_REFERRERS;
  }
}

export function updateUserReferrerByAdmin(userId: string, referrerId: string | null): void {
  void userId;
  void referrerId;
  throw new Error("현재 추천인 수정은 서버 API 경로에서만 지원합니다.");
}

export async function register(payload: RegisterPayload): Promise<AuthUser> {
  const res = await fetch("/api/public/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as { user?: AuthUser; error?: string };
  if (!res.ok || !data.user) {
    throw new Error(data.error || "회원가입에 실패했습니다.");
  }
  saveUser(data.user);
  return data.user;
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await fetch("/api/public/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = (await res.json().catch(() => ({}))) as { user?: AuthUser; error?: string };
  if (!res.ok || !data.user) {
    throw new Error(data.error || "아이디 또는 비밀번호가 올바르지 않습니다.");
  }
  saveUser(data.user);
  return data.user;
}

export async function logout() {
  try {
    await fetch("/api/public/auth/logout", { method: "POST" });
  } finally {
    saveUser(null);
  }
}

export function getPlanLabel(planId: PlanId | undefined, isUnlimited: boolean | undefined): string {
  void isUnlimited;
  switch (planId) {
    case "small":
      return "기본 방송";
    case "medium":
      return "기본 방송";
    case "large":
      return "무제한 방송";
    case "free":
    default:
      return "무료 방송";
  }
}

/** 관리자·목록 등에서 planId 문자열을 사용자·관리자와 동일한 한글 상품 표시명으로 표시 */
export function getPlanDisplayLabel(planId: string | undefined | null): string {
  const raw = typeof planId === "string" && planId.trim() ? planId.trim() : "free";
  if (raw === "free" || raw === "small" || raw === "medium" || raw === "large") {
    return getPlanLabel(raw, false);
  }
  return raw;
}

export function getPricingCtaLabel(planId: PlanId | undefined): string {
  const tier = planId ?? "free";
  if (tier === "free" || tier === "large") return "구독";
  return "구독 업그레이드";
}

export { FREE_PLAN_BROADCAST_MAX_CHARS } from "@/lib/adminData";

export function getMaxCharsForUser(user: AuthUser | null): number | null {
  if (!user) return FREE_PLAN_BROADCAST_MAX_CHARS;
  const plan = user.planId ?? "free";
  if (plan === "free") {
    return FREE_PLAN_BROADCAST_MAX_CHARS;
  }
  if (typeof window !== "undefined") {
    try {
      const products = getAdminProducts();
      const matched = products.find((p) => p.id === plan);
      if (matched && "maxChars" in matched) {
        if (matched.maxChars === null) return null;
        if (typeof matched.maxChars === "number" && Number.isFinite(matched.maxChars)) {
          return matched.maxChars;
        }
      }
    } catch {
      // fallback to default policy
    }
  }
  switch (plan) {
    case "small":
      return 500;
    case "medium":
      return 500;
    case "large":
      return null;
    default:
      return FREE_PLAN_BROADCAST_MAX_CHARS;
  }
}

export function getVisibleSessionCountForUser(user: AuthUser | null): number | null {
  if (!user) return 1;
  const plan = user.planId ?? "free";
  if (typeof window !== "undefined") {
    try {
      const products = getAdminProducts();
      const matched = products.find((p) => p.id === plan);
      if (matched && "visibleSessionLimit" in matched) {
        if (matched.visibleSessionLimit === null) return null;
        if (
          typeof matched.visibleSessionLimit === "number" &&
          Number.isFinite(matched.visibleSessionLimit)
        ) {
          return matched.visibleSessionLimit;
        }
      }
    } catch {
      // fallback to default policy
    }
  }
  switch (plan) {
    case "free":
      return 1;
    case "small":
      return 5;
    case "medium":
      return 5;
    case "large":
      return null;
    default:
      return 1;
  }
}

/** 로그인한 회원의 저장소 레코드 */
export async function getStoredUserForCurrentSession(): Promise<StoredUser | null> {
  const res = await fetch("/api/public/auth/profile", { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as {
    profile?: {
      id: string;
      username: string;
      name: string;
      martName: string;
      martAddressBase?: string | null;
      martAddressDetail?: string | null;
      phone: string;
      referrerId?: string | null;
      planId?: PlanId;
    };
  };
  if (!data.profile) return null;
  return {
    id: data.profile.id,
    username: data.profile.username,
    name: data.profile.name,
    martName: data.profile.martName,
    martAddressBase: data.profile.martAddressBase ?? null,
    martAddressDetail: data.profile.martAddressDetail ?? null,
    martAddress:
      [data.profile.martAddressBase?.trim(), data.profile.martAddressDetail?.trim()].filter(Boolean).join(" ").trim() || null,
    phone: data.profile.phone,
    referrerId: data.profile.referrerId ?? null,
    planId: data.profile.planId ?? "free",
  };
}

export type ProfileUpdatePayload = {
  name: string;
  martName: string;
  martAddressBase?: string;
  martAddressDetail?: string;
  phone: string;
  newPassword?: string;
  newPasswordConfirm?: string;
};

export async function updateCurrentUserProfile(payload: ProfileUpdatePayload): Promise<AuthUser> {
  const res = await fetch("/api/public/auth/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as { user?: AuthUser; error?: string };
  if (!res.ok || !data.user) {
    throw new Error(data.error || "저장에 실패했습니다.");
  }
  saveUser(data.user);
  return data.user;
}

export async function updateCurrentUserPlan(planId: PlanId): Promise<AuthUser | null> {
  const res = await fetch("/api/public/auth/plan", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId }),
  });
  const data = (await res.json().catch(() => ({}))) as { user?: AuthUser; error?: string };
  if (!res.ok || !data.user) {
    if (res.status === 401) return null;
    throw new Error(data.error || "플랜 변경에 실패했습니다.");
  }
  const nextUser: AuthUser = data.user;
  saveUser(nextUser);
  try {
    window.dispatchEvent(new CustomEvent("mart-plan-updated"));
  } catch {
    // noop
  }
  return nextUser;
}

