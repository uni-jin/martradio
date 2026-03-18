export type PlanId = "free" | "small" | "medium" | "large";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  isUnlimited: boolean;
  planId?: PlanId;
};

const AUTH_STORAGE_KEY = "mart-radio-auth-user";
const USERS_STORAGE_KEY = "mart-radio-users";

type StoredUser = {
  id: string;
  email: string;
  password: string;
  name: string;
  martName: string;
  phone: string;
  businessNumber?: string | null;
  referralCodeUsed?: string | null;
  planId?: PlanId;
};

export function getCurrentUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
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
  email: string;
  password: string;
  name: string;
  martName: string;
  phone: string;
  businessNumber?: string;
  referralCode?: string;
};

export async function register(payload: RegisterPayload): Promise<AuthUser> {
  if (typeof window === "undefined") {
    throw new Error("브라우저 환경에서만 회원가입을 사용할 수 있습니다.");
  }
  const email = payload.email.trim();
  const users = getAllStoredUsers();
  if (users.some((u) => u.email === email)) {
    throw new Error("이미 가입된 아이디입니다.");
  }
  const stored: StoredUser = {
    id: `user_${Date.now()}`,
    email,
    password: payload.password,
    name: payload.name.trim(),
    martName: payload.martName.trim(),
    phone: payload.phone.trim(),
    businessNumber: payload.businessNumber?.trim() || null,
    referralCodeUsed: payload.referralCode?.trim() || null,
    planId: "free",
  };
  const next = [...users, stored];
  saveAllStoredUsers(next);

  const user: AuthUser = {
    id: stored.id,
    email: stored.email,
    name: stored.name,
    isUnlimited: false,
    planId: "free",
  };
  saveUser(user);
  return user;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  // 로컬 개발 초기 단계에서는 하드코딩된 테스트 계정만 허용
  if (email === "test" && password === "123qwe") {
    const user: AuthUser = {
      id: "test",
      email: "test",
      name: "테스트 계정",
      isUnlimited: true,
      planId: "large",
    };
    saveUser(user);
    return user;
  }

  // 로컬 스토리지에 저장된 회원 정보에서 조회
  if (typeof window !== "undefined") {
    const users = getAllStoredUsers();
    const found = users.find((u) => u.email === email);
    if (!found || found.password !== password) {
      throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
    }
    const user: AuthUser = {
      id: found.id,
      email: found.email,
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
  if (isUnlimited) return "테스트 (무제한)";
  switch (planId) {
    case "small":
      return "소형마트 (200자 제한)";
    case "medium":
      return "중형마트 (1000자 제한)";
    case "large":
      return "대형마트 (무제한)";
    case "free":
    default:
      return "무료 (50자 제한)";
  }
}

export function getMaxCharsForUser(user: AuthUser | null): number | null {
  if (!user) return 50;
  if (user.isUnlimited) return null;
  const plan = user.planId ?? "free";
  switch (plan) {
    case "free":
      return 50;
    case "small":
      return 200;
    case "medium":
      return 1000;
    case "large":
      return null;
    default:
      return 50;
  }
}

export function updateCurrentUserPlan(planId: PlanId): AuthUser | null {
  if (typeof window === "undefined") return null;
  const current = getCurrentUser();
  if (!current) return null;
  if (current.isUnlimited) {
    // 테스트 계정은 강제로 플랜 변경하지 않음
    return current;
  }
  const users = getAllStoredUsers();
  const updatedUsers = users.map((u) =>
    u.email === current.email
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

