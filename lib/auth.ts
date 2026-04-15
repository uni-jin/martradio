export type PlanId = "free" | "small" | "medium" | "large";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  isUnlimited: boolean;
  planId?: PlanId;
};

import { syncPaymentReferrerForUser } from "@/lib/adminData";

const AUTH_STORAGE_KEY = "mart-radio-auth-user";
const USERS_STORAGE_KEY = "mart-radio-users";
const ADMIN_PRODUCTS_STORAGE_KEY = "mart-radio-admin-products";

export type StoredUser = {
  id: string;
  username: string;
  password: string;
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

function combineMartAddress(
  base?: string | null,
  detail?: string | null,
  legacy?: string | null
): string | null {
  const merged = [base?.trim(), detail?.trim()].filter(Boolean).join(" ").trim();
  if (merged) return merged;
  const leg = legacy?.trim();
  return leg || null;
}

export type ReferrerOption = {
  id: string;
  name: string;
};

export function getCurrentUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    return {
      ...parsed,
      isUnlimited: false,
      planId: parsed.planId ?? "free",
    };
  } catch {
    return null;
  }
}

export function saveUser(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  if (!user) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
}

function getAllStoredUsers(): StoredUser[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as StoredUser[];
  } catch {
    return [];
  }
}

function saveAllStoredUsers(users: StoredUser[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
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
  if (typeof window === "undefined") {
    throw new Error("브라우저 환경에서만 사용할 수 있습니다.");
  }
  const users = getAllStoredUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx < 0) {
    throw new Error("회원을 찾을 수 없습니다.");
  }
  const nextId = referrerId?.trim() || null;
  const next = [...users];
  next[idx] = {
    ...next[idx],
    referrerId: nextId,
  };
  saveAllStoredUsers(next);
  const row = next[idx];
  syncPaymentReferrerForUser({
    userId: row.id,
    username: row.username.trim(),
    referrerId: nextId,
  });
}

export async function register(payload: RegisterPayload): Promise<AuthUser> {
  if (typeof window === "undefined") {
    throw new Error("브라우저 환경에서만 회원가입을 사용할 수 있습니다.");
  }
  const username = payload.username.trim();
  const users = getAllStoredUsers();
  if (users.some((u) => u.username === username)) {
    throw new Error("이미 가입된 아이디입니다.");
  }
  const base = payload.martAddressBase?.trim() || null;
  const detail = payload.martAddressDetail?.trim() || null;
  const stored: StoredUser = {
    id: `user_${Date.now()}`,
    username,
    password: payload.password,
    name: payload.name.trim(),
    martName: payload.martName.trim(),
    martAddressBase: base,
    martAddressDetail: detail,
    martAddress: combineMartAddress(base, detail),
    phone: payload.phone.trim(),
    referrerId: payload.referrerId?.trim() || null,
    planId: "free",
  };
  const next = [...users, stored];
  saveAllStoredUsers(next);

  const user: AuthUser = {
    id: stored.id,
    email: stored.username,
    name: stored.name,
    isUnlimited: false,
    planId: "free",
  };
  saveUser(user);
  return user;
}

export async function login(username: string, password: string): Promise<AuthUser> {
  // 로컬 스토리지에 저장된 회원 정보에서 조회
  if (typeof window !== "undefined") {
    const users = getAllStoredUsers();
    const found = users.find((u) => u.username === username);
    if (!found || found.password !== password) {
      throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
    }
    const user: AuthUser = {
      id: found.id,
      email: found.username,
      name: found.name,
      isUnlimited: false,
      planId: found.planId ?? "free",
    };
    saveUser(user);
    return user;
  }

  throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
}

export function logout() {
  saveUser(null);
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

export function getMaxCharsForUser(user: AuthUser | null): number | null {
  if (!user) return 100;
  const plan = user.planId ?? "free";
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(ADMIN_PRODUCTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Array<{ id?: unknown; maxChars?: unknown }>;
        const matched = parsed.find((p) => p.id === plan);
        if (matched && ("maxChars" in matched)) {
          if (matched.maxChars === null) return null;
          if (typeof matched.maxChars === "number" && Number.isFinite(matched.maxChars)) {
            return matched.maxChars;
          }
        }
      }
    } catch {
      // fallback to default policy
    }
  }
  switch (plan) {
    case "free":
      return 100;
    case "small":
      return 500;
    case "medium":
      return 500;
    case "large":
      return null;
    default:
      return 100;
  }
}

export function getVisibleSessionCountForUser(user: AuthUser | null): number | null {
  if (!user) return 1;
  const plan = user.planId ?? "free";
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(ADMIN_PRODUCTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Array<{ id?: unknown; visibleSessionLimit?: unknown }>;
        const matched = parsed.find((p) => p.id === plan);
        if (matched && ("visibleSessionLimit" in matched)) {
          if (matched.visibleSessionLimit === null) return null;
          if (
            typeof matched.visibleSessionLimit === "number" &&
            Number.isFinite(matched.visibleSessionLimit)
          ) {
            return matched.visibleSessionLimit;
          }
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
export function getStoredUserForCurrentSession(): StoredUser | null {
  const cur = getCurrentUser();
  if (!cur) return null;
  const users = getAllStoredUsers();
  return users.find((u) => u.id === cur.id) ?? null;
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

export function updateCurrentUserProfile(payload: ProfileUpdatePayload): AuthUser {
  if (typeof window === "undefined") {
    throw new Error("브라우저에서만 수정할 수 있습니다.");
  }
  const current = getCurrentUser();
  if (!current) {
    throw new Error("로그인이 필요합니다.");
  }
  const users = getAllStoredUsers();
  const idx = users.findIndex((u) => u.id === current.id);
  if (idx < 0) {
    throw new Error("회원 정보를 찾을 수 없습니다.");
  }
  const prev = users[idx];
  let password = prev.password;
  const np = payload.newPassword?.trim();
  if (np) {
    const confirm = payload.newPasswordConfirm?.trim() ?? "";
    if (np.length < 6) {
      throw new Error("새 비밀번호는 6자 이상이어야 합니다.");
    }
    if (np !== confirm) {
      throw new Error("새 비밀번호와 확인이 일치하지 않습니다.");
    }
    password = np;
  }

  const base = payload.martAddressBase?.trim() || null;
  const detail = payload.martAddressDetail?.trim() || null;
  const mergedAddr = [base, detail].filter(Boolean).join(" ").trim();
  const martAddressResolved = mergedAddr || null;

  const updated: StoredUser = {
    ...prev,
    name: payload.name.trim(),
    martName: payload.martName.trim(),
    martAddressBase: base,
    martAddressDetail: detail,
    martAddress: martAddressResolved,
    phone: payload.phone.trim(),
    password,
  };

  const next = [...users];
  next[idx] = updated;
  saveAllStoredUsers(next);

  const nextAuth: AuthUser = {
    ...current,
    name: updated.name,
  };
  saveUser(nextAuth);
  return nextAuth;
}

export function updateCurrentUserPlan(planId: PlanId): AuthUser | null {
  if (typeof window === "undefined") return null;
  const current = getCurrentUser();
  if (!current) return null;
  const users = getAllStoredUsers();
  const updatedUsers = users.map((u) =>
    u.id === current.id
      ? {
          ...u,
          planId,
        }
      : u
  );
  saveAllStoredUsers(updatedUsers);
  const nextUser: AuthUser = {
    ...current,
    planId,
  };
  saveUser(nextUser);
  try {
    window.dispatchEvent(new CustomEvent("mart-plan-updated"));
  } catch {
    // noop
  }
  return nextUser;
}

