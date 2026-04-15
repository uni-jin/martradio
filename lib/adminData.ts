"use client";
import { GOOGLE_TTS_PRESETS } from "./ttsOptions";
import type { VoiceTemplate } from "./voiceTemplateTypes";

export type { VoiceTemplate } from "./voiceTemplateTypes";

export type AdminReferrer = {
  id: string;
  /** 관리자 사이트 로그인 ID (영문·숫자) */
  loginId: string;
  /** 추천인 코드명 */
  name: string;
  /** 실제 담당자 이름 */
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

const TEMPLATES_KEY = "mart-radio-admin-templates";
const VOICES_KEY_V2 = "mart-radio-voice-templates-v2";
const VOICES_KEY_LEGACY = "mart-radio-admin-voices";
const PRODUCTS_KEY = "mart-radio-admin-products";
const PAYMENTS_KEY = "mart-radio-admin-payments";

const now = () => new Date().toISOString();

function readList<T>(key: string, fallback: T[]): T[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function writeList<T>(key: string, data: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(data));
}

/** @deprecated 추천인 데이터는 `/api/admin/referrers`를 사용합니다. */
export function getAdminReferrers(): AdminReferrer[] {
  return [];
}

/** @deprecated 추천인 데이터는 `/api/admin/referrers`를 사용합니다. */
export function saveAdminReferrers(_list: AdminReferrer[]) {}

export function getAdminTemplates(): AdminTemplate[] {
  return readList<AdminTemplate>(TEMPLATES_KEY, []).map((t) => ({
    ...t,
    enabled: t.enabled !== false,
  }));
}

export function saveAdminTemplates(list: AdminTemplate[]) {
  writeList(TEMPLATES_KEY, list);
}

function seedVoiceTemplates(): VoiceTemplate[] {
  const t = now();
  return GOOGLE_TTS_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.label,
    voice: preset.voice,
    languageCode: "ko-KR",
    enabled: true,
    paidOnly: false,
    speakingRate: 1,
    pitch: 0,
    volumeGainDb: 0,
    sampleRateHertz: null,
    effectsProfileId: null,
    createdAt: t,
    updatedAt: t,
  }));
}

function migrateLegacyVoiceRow(row: Record<string, unknown>): VoiceTemplate | null {
  if (typeof row.id !== "string" || typeof row.voice !== "string") return null;
  const t = now();
  return {
    id: row.id,
    label: typeof row.label === "string" ? row.label : row.id,
    voice: row.voice,
    languageCode: typeof row.languageCode === "string" ? row.languageCode : "ko-KR",
    enabled: row.enabled !== false,
    paidOnly: row.paidOnly === true,
    speakingRate: typeof row.speakingRate === "number" && Number.isFinite(row.speakingRate) ? row.speakingRate : 1,
    pitch: typeof row.pitch === "number" && Number.isFinite(row.pitch) ? row.pitch : 0,
    volumeGainDb:
      typeof row.volumeGainDb === "number" && Number.isFinite(row.volumeGainDb) ? row.volumeGainDb : 0,
    sampleRateHertz:
      typeof row.sampleRateHertz === "number" && row.sampleRateHertz > 0 ? row.sampleRateHertz : null,
    effectsProfileId: Array.isArray(row.effectsProfileId)
      ? (row.effectsProfileId as unknown[]).filter((x): x is string => typeof x === "string")
      : null,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : t,
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : t,
  };
}

function ensureVoiceTemplateShape(v: VoiceTemplate): VoiceTemplate {
  const t = now();
  return {
    id: v.id,
    label: v.label || v.id,
    voice: v.voice,
    languageCode: v.languageCode || "ko-KR",
    enabled: v.enabled !== false,
    paidOnly: v.paidOnly === true,
    speakingRate:
      typeof v.speakingRate === "number" && Number.isFinite(v.speakingRate) ? v.speakingRate : 1,
    pitch: typeof v.pitch === "number" && Number.isFinite(v.pitch) ? v.pitch : 0,
    volumeGainDb:
      typeof v.volumeGainDb === "number" && Number.isFinite(v.volumeGainDb) ? v.volumeGainDb : 0,
    sampleRateHertz:
      typeof v.sampleRateHertz === "number" && v.sampleRateHertz > 0 ? v.sampleRateHertz : null,
    effectsProfileId: Array.isArray(v.effectsProfileId) ? v.effectsProfileId : null,
    createdAt: v.createdAt || t,
    updatedAt: v.updatedAt || t,
  };
}

/** 저장된 Google 음성 템플릿 전체 */
export function getVoiceTemplates(): VoiceTemplate[] {
  if (typeof window === "undefined") return [];

  const v2 = readList<VoiceTemplate>(VOICES_KEY_V2, []);
  if (v2.length > 0) {
    return v2.map(ensureVoiceTemplateShape);
  }

  const legacy = readList<Record<string, unknown>>(VOICES_KEY_LEGACY, []);
  if (legacy.length > 0) {
    const migrated = legacy.map(migrateLegacyVoiceRow).filter((x): x is VoiceTemplate => x != null);
    if (migrated.length > 0) {
      writeList(VOICES_KEY_V2, migrated);
      return migrated;
    }
  }

  const seeded = seedVoiceTemplates();
  writeList(VOICES_KEY_V2, seeded);
  return seeded;
}

export function saveVoiceTemplates(list: VoiceTemplate[]) {
  writeList(VOICES_KEY_V2, list);
}

/** @deprecated 이름 호환 — getVoiceTemplates 사용 권장 */
export function getAdminVoices(): VoiceTemplate[] {
  return getVoiceTemplates();
}

/** @deprecated saveVoiceTemplates 사용 권장 */
export function saveAdminVoices(list: VoiceTemplate[]) {
  saveVoiceTemplates(list);
}

/** 사용자 방송 화면에 노출할 활성 템플릿 (이름순) */
export function getVoiceTemplatesUserFacing(planId?: string): VoiceTemplate[] {
  const isPaidPlan = planId === "small" || planId === "medium" || planId === "large";
  return getVoiceTemplates()
    .filter((v) => v.enabled)
    .filter((v) => (v.paidOnly ? isPaidPlan : true))
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label, "ko"));
}

export function getVoiceTemplateById(id: string): VoiceTemplate | undefined {
  return getVoiceTemplates().find((v) => v.id === id);
}

export function getAdminProducts(): AdminProduct[] {
  const list = readList<AdminProduct>(PRODUCTS_KEY, [
    {
      id: "free",
      name: "무료 방송",
      maxChars: 100,
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
  ]);
  return list.map((p) => ({
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

export function saveAdminProducts(list: AdminProduct[]) {
  writeList(PRODUCTS_KEY, list);
}

export function getAdminPayments(): AdminPayment[] {
  return readList<AdminPayment>(PAYMENTS_KEY, []);
}

export function saveAdminPayments(list: AdminPayment[]) {
  writeList(PAYMENTS_KEY, list);
}

/** 로그인 회원의 결제 이력 (최신순) */
export function getPaymentsForUser(userId: string, username: string): AdminPayment[] {
  return getAdminPayments()
    .filter((p) => p.userId === userId || p.username === username)
    .slice()
    .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
}

export function appendUserPayment(params: {
  userId: string;
  username: string;
  productId: string;
  amount: number;
  referrerId?: string | null;
  source?: "web_checkout" | "dummy";
  paymentKey?: string | null;
  orderId?: string | null;
  status?: string | null;
}): void {
  if (typeof window === "undefined") return;
  const payment: AdminPayment = {
    id: `pay-${Date.now()}`,
    userId: params.userId,
    username: params.username,
    productId: params.productId,
    amount: params.amount,
    paidAt: new Date().toISOString(),
    referrerId: params.referrerId ?? null,
    source: params.source ?? "web_checkout",
    paymentKey: params.paymentKey ?? null,
    orderId: params.orderId ?? null,
    status: params.status ?? "DONE",
  };
  saveAdminPayments([payment, ...getAdminPayments()]);
}

/** 회원의 추천인이 바뀔 때, 해당 회원 결제 건의 referrerId를 동일 값으로 맞춥니다(추천인 결제 통계 등). */
export function syncPaymentReferrerForUser(params: {
  userId: string;
  username: string;
  referrerId: string | null;
}): void {
  if (typeof window === "undefined") return;
  const uid = params.userId.trim();
  if (!uid) return;
  const uname = params.username.trim();
  const ref = params.referrerId?.trim() ? params.referrerId.trim() : null;
  const list = getAdminPayments();
  let changed = false;
  const next = list.map((p) => {
    const match = p.userId === uid || (uname.length > 0 && p.username === uname);
    if (!match) return p;
    const prev = p.referrerId ?? null;
    if (prev === ref) return p;
    changed = true;
    return { ...p, referrerId: ref };
  });
  if (changed) saveAdminPayments(next);
}

export function getAdminUsers(): Array<Record<string, unknown>> {
  return readList<Record<string, unknown>>("mart-radio-users", []);
}

export function getEnabledGoogleTtsPresetIds(): string[] {
  return getVoiceTemplates()
    .filter((v) => v.enabled)
    .map((v) => v.id);
}

export function getTemplateOptionsForPlan(planId: string | undefined): AdminTemplateOption[] {
  const templates = getAdminTemplates();
  if (templates.length === 0) return [];
  const products = getAdminProducts();
  const current = products.find((p) => p.id === (planId ?? "free"));
  const canUseTemplate = current?.templateEnabled ?? false;
  return templates
    .filter((t) => t.enabled !== false)
    .filter((t) => (t.paidOnly ? canUseTemplate : true))
    .map((t) => ({ id: t.id, name: t.name, content: t.content }));
}

export type AdminDashboardStats = {
  totalUsers: number;
  paidUsers: number;
  /** 구독별 가입자 수 (무료 방송/기본 방송/무제한 방송) */
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
  /** 가입 연결 수 기준 상위 추천인 */
  topReferrers: { id: string; name: string; signups: number; paymentCount: number; revenue: number }[];
  recentPayments: AdminPayment[];
};

type PlanKey = "free" | "small" | "medium" | "large";

function userPlanKey(u: Record<string, unknown>): PlanKey {
  const p = u.planId;
  if (p === "small" || p === "medium" || p === "large" || p === "free") return p;
  return "free";
}

/** 클라이언트에서 localStorage 기준으로 집계. `referrers`는 API에서 받은 목록을 넘깁니다. */
export function computeAdminDashboardStats(referrers: AdminReferrer[]): AdminDashboardStats {
  const emptyPlanBreakdown = [
    { key: "free", label: "무료 방송", count: 0 },
    { key: "basic", label: "기본 방송", count: 0 },
    { key: "large", label: "무제한 방송", count: 0 },
  ];

  if (typeof window === "undefined") {
    return {
      totalUsers: 0,
      paidUsers: 0,
      planBreakdown: emptyPlanBreakdown,
      referrersTotal: referrers.length,
      referrersActive: referrers.filter((r) => r.isActive).length,
      templatesTotal: 0,
      templatesPaidOnly: 0,
      productsActive: 0,
      voicesEnabled: 0,
      voicesTotal: 0,
      paymentCount: 0,
      paymentsThisMonth: 0,
      totalRevenue: 0,
      payments7d: 0,
      revenue7d: 0,
      topReferrers: [],
      recentPayments: [],
    };
  }

  const users = getAdminUsers();
  const templates = getAdminTemplates();
  const products = getAdminProducts();
  const voices = getVoiceTemplates();
  const payments = getAdminPayments();

  const planCounts = new Map<string, number>();
  for (const u of users) {
    const k = userPlanKey(u);
    planCounts.set(k, (planCounts.get(k) ?? 0) + 1);
  }
  const planBreakdown = [
    {
      key: "free",
      label: "무료 방송",
      count: planCounts.get("free") ?? 0,
    },
    {
      key: "basic",
      label: "기본 방송",
      count: (planCounts.get("small") ?? 0) + (planCounts.get("medium") ?? 0),
    },
    {
      key: "large",
      label: "무제한 방송",
      count: planCounts.get("large") ?? 0,
    },
  ];

  const signupsByRef = new Map<string, number>();
  for (const u of users) {
    const refId = u.referrerId;
    if (typeof refId === "string" && refId.trim()) {
      signupsByRef.set(refId, (signupsByRef.get(refId) ?? 0) + 1);
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

  const topReferrers = referrers
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

  const now = Date.now();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartMs = monthStart.getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  let payments7d = 0;
  let revenue7d = 0;
  let paymentsThisMonth = 0;
  for (const p of payments) {
    const t = new Date(p.paidAt).getTime();
    if (!Number.isNaN(t) && t >= monthStartMs) {
      paymentsThisMonth += 1;
    }
    if (!Number.isNaN(t) && now - t <= sevenDaysMs) {
      payments7d += 1;
      revenue7d += p.amount;
    }
  }

  const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
  const sortedPayments = [...payments].sort(
    (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()
  );

  return {
    totalUsers: users.length,
    paidUsers: users.filter((u) => userPlanKey(u) !== "free").length,
    planBreakdown,
    referrersTotal: referrers.length,
    referrersActive: referrers.filter((r) => r.isActive).length,
    templatesTotal: templates.filter((t) => t.enabled !== false).length,
    templatesPaidOnly: templates.filter((t) => t.enabled !== false && t.paidOnly).length,
    productsActive: products.filter((p) => p.isActive).length,
    voicesEnabled: voices.filter((v) => v.enabled).length,
    voicesTotal: voices.length,
    paymentCount: payments.length,
    paymentsThisMonth,
    totalRevenue,
    payments7d,
    revenue7d,
    topReferrers,
    recentPayments: sortedPayments.slice(0, 8),
  };
}

export function generateDummyPayment(): AdminPayment | null {
  const users = getAdminUsers();
  const products = getAdminProducts().filter((p) => p.isActive && p.priceMonthly > 0);
  if (users.length === 0 || products.length === 0) return null;

  const randomUser = users[Math.floor(Math.random() * users.length)];
  const randomProduct = products[Math.floor(Math.random() * products.length)];
  const payment: AdminPayment = {
    id: `pay-${Date.now()}`,
    userId: String(randomUser.id ?? ""),
    username: String(randomUser.username ?? "unknown"),
    productId: randomProduct.id,
    amount: randomProduct.priceMonthly,
    paidAt: new Date().toISOString(),
    referrerId: (randomUser.referrerId as string | undefined) ?? null,
    source: "dummy",
    paymentKey: null,
    orderId: null,
    status: "DONE",
  };
  const list = getAdminPayments();
  saveAdminPayments([payment, ...list]);
  return payment;
}

