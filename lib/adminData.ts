"use client";

export type { VoiceTemplate } from "./voiceTemplateTypes";

export type AdminReferrer = {
  id: string;
  loginId: string;
  name: string;
  personName?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminTemplate = {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
  paidOnly: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminProduct = {
  id: string;
  name: string;
  maxChars: number | null;
  visibleSessionLimit: number | null;
  priceMonthly: number;
  templateEnabled: boolean;
  isActive: boolean;
};

export const FREE_PLAN_BROADCAST_MAX_CHARS = 100;

export type AdminPayment = {
  id: string;
  userId: string;
  username: string;
  productId: string;
  amount: number;
  paidAt: string;
  referrerId?: string | null;
  source?: "web_checkout" | "dummy";
  paymentKey?: string | null;
  orderId?: string | null;
  status?: string | null;
};

export type AdminTemplateOption = {
  id: string;
  name: string;
  content: string;
};

/** 서버 `/api/public/plan-catalog` 응답 캐시 — 운영 상품은 DB(admin_kv)가 소스 */
let planCatalogCache: AdminProduct[] | null = null;
let planCatalogFetchedAt = 0;
let planCatalogInFlight: Promise<AdminProduct[]> | null = null;
const PLAN_CATALOG_CACHE_TTL_MS = 60000;

const DEFAULT_ADMIN_PRODUCTS: AdminProduct[] = [
  {
    id: "free",
    name: "무료 방송",
    maxChars: FREE_PLAN_BROADCAST_MAX_CHARS,
    visibleSessionLimit: 1,
    priceMonthly: 0,
    templateEnabled: false,
    isActive: true,
  },
  {
    id: "small",
    name: "기본 방송",
    maxChars: 500,
    visibleSessionLimit: 5,
    priceMonthly: 9900,
    templateEnabled: false,
    isActive: true,
  },
  {
    id: "medium",
    name: "기본 방송",
    maxChars: 500,
    visibleSessionLimit: 5,
    priceMonthly: 9900,
    templateEnabled: false,
    isActive: false,
  },
  {
    id: "large",
    name: "무제한 방송",
    maxChars: null,
    visibleSessionLimit: null,
    priceMonthly: 19900,
    templateEnabled: true,
    isActive: true,
  },
];

export async function fetchPlanCatalog(): Promise<AdminProduct[]> {
  if (planCatalogCache && Date.now() - planCatalogFetchedAt < PLAN_CATALOG_CACHE_TTL_MS) {
    return getAdminProducts();
  }
  if (planCatalogInFlight) {
    return planCatalogInFlight;
  }
  planCatalogInFlight = (async () => {
    try {
      const res = await fetch("/api/public/plan-catalog", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { products?: AdminProduct[] };
      const list = Array.isArray(data.products) ? data.products : [];
      planCatalogCache = list.length > 0 ? list : null;
      planCatalogFetchedAt = Date.now();
    } catch {
      planCatalogCache = null;
      planCatalogFetchedAt = Date.now();
    }
    return getAdminProducts();
  })();
  try {
    return await planCatalogInFlight;
  } finally {
    planCatalogInFlight = null;
  }
}

export function getAdminProducts(): AdminProduct[] {
  const list = planCatalogCache ?? [];
  const byId = new Map(DEFAULT_ADMIN_PRODUCTS.map((p) => [p.id, p]));
  const merged = (list.length > 0 ? list : DEFAULT_ADMIN_PRODUCTS).map((p) => {
    const def = byId.get(p.id);
    if (!def) return p;
    const next: AdminProduct = { ...def, ...p };
    if (p.id === "free") {
      next.maxChars = FREE_PLAN_BROADCAST_MAX_CHARS;
    }
    return next;
  });
  const seen = new Set(merged.map((p) => p.id));
  for (const def of DEFAULT_ADMIN_PRODUCTS) {
    if (!seen.has(def.id)) merged.push(def);
  }
  return merged.map((p) => ({
    ...p,
    visibleSessionLimit:
      p.visibleSessionLimit === undefined
        ? p.id === "free"
          ? 1
          : p.id === "small" || p.id === "medium"
            ? 5
            : null
        : p.visibleSessionLimit,
  }));
}

export async function fetchUserPaymentsFromApi(): Promise<AdminPayment[]> {
  const res = await fetch("/api/public/user/payments", { cache: "no-store", credentials: "include" });
  const data = (await res.json().catch(() => ({}))) as { payments?: AdminPayment[] };
  return Array.isArray(data.payments) ? data.payments : [];
}

export {
  fetchVoiceTemplatesForPlan,
  findVoiceTemplateByIdInList,
  getVoiceTemplatesUserFacingSync as getVoiceTemplatesUserFacing,
  useVoiceTemplatesForPlan,
} from "./voiceTemplatesClient";

/** @deprecated 추천인 데이터는 `/api/admin/referrers`를 사용합니다. */
export function getAdminReferrers(): AdminReferrer[] {
  return [];
}

/** @deprecated 추천인 데이터는 `/api/admin/referrers`를 사용합니다. */
export function saveAdminReferrers(_list: AdminReferrer[]) {}

export type AdminDashboardStats = {
  totalUsers: number;
  paidUsers: number;
  planBreakdown: { key: string; label: string; count: number }[];
  referrersTotal: number;
  referrersActive: number;
  templatesTotal: number;
  templatesPaidOnly: number;
  productsActive: number;
  voicesEnabled: number;
  voicesTotal: number;
  paymentCount: number;
  paymentsThisMonth: number;
  totalRevenue: number;
  payments7d: number;
  revenue7d: number;
  topReferrers: { id: string; name: string; signups: number; paymentCount: number; revenue: number }[];
  recentPayments: AdminPayment[];
};

export function computeTopReferrers(
  referrers: AdminReferrer[],
  users: Array<Record<string, unknown>>,
  payments: AdminPayment[]
): { id: string; name: string; signups: number; paymentCount: number; revenue: number }[] {
  const signupsByRef = new Map<string, number>();
  for (const u of users) {
    const refId = u.referrerId;
    if (typeof refId === "string" && refId.trim()) {
      signupsByRef.set(refId.trim(), (signupsByRef.get(refId.trim()) ?? 0) + 1);
    }
  }
  const revenueByRef = new Map<string, number>();
  const paymentCountByRef = new Map<string, number>();
  for (const p of payments) {
    if (p.referrerId) {
      revenueByRef.set(p.referrerId, (revenueByRef.get(p.referrerId) ?? 0) + p.amount);
      paymentCountByRef.set(p.referrerId, (paymentCountByRef.get(p.referrerId) ?? 0) + 1);
    }
  }
  return referrers
    .map((r) => ({
      id: r.id,
      name: r.name,
      signups: signupsByRef.get(r.id) ?? 0,
      paymentCount: paymentCountByRef.get(r.id) ?? 0,
      revenue: revenueByRef.get(r.id) ?? 0,
    }))
    .sort((a, b) => {
      if (b.signups !== a.signups) return b.signups - a.signups;
      return b.revenue - a.revenue;
    })
    .slice(0, 3);
}
