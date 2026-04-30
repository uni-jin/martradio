import type { VoiceTemplate } from "@/lib/voiceTemplateTypes";
import { DEFAULT_PROMO_SCRIPT_TEMPLATE } from "@/lib/promoScriptPrompt";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

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

const DEFAULT_PRODUCTS: AdminProduct[] = [
  { id: "free", name: "무료 방송", maxChars: 100, visibleSessionLimit: 1, priceMonthly: 0, templateEnabled: false, isActive: true },
  { id: "small", name: "기본 방송", maxChars: 500, visibleSessionLimit: 5, priceMonthly: 9900, templateEnabled: false, isActive: true },
  { id: "medium", name: "기본 방송", maxChars: 500, visibleSessionLimit: 5, priceMonthly: 9900, templateEnabled: false, isActive: false },
  { id: "large", name: "무제한 방송", maxChars: null, visibleSessionLimit: null, priceMonthly: 19900, templateEnabled: true, isActive: true },
];

const DEFAULT_VOICES: VoiceTemplate[] = [
  {
    id: "google-charon",
    label: "차분한 남성",
    voice: "ko-KR-Chirp3-HD-Charon",
    ttsEngine: "chirp3-hd",
    geminiPrompt: null,
    languageCode: "ko-KR",
    enabled: true,
    paidOnly: false,
    previewAudioDataUrl: null,
    speakingRate: 1,
    pitch: 0,
    volumeGainDb: 0,
    sampleRateHertz: null,
    effectsProfileId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

async function readKv<T>(key: string, fallback: T): Promise<T> {
  const supabase = getSupabaseServerClient();
  const row = await supabase.from("admin_kv").select("value").eq("key", key).limit(1).maybeSingle();
  if (row.error) throw new Error(row.error.message);
  if (!row.data) return fallback;
  return row.data.value as T;
}

async function writeKv<T>(key: string, value: T): Promise<void> {
  const supabase = getSupabaseServerClient();
  const now = new Date().toISOString();
  const upsert = await supabase.from("admin_kv").upsert({ key, value, updated_at: now }, { onConflict: "key" });
  if (upsert.error) throw new Error(upsert.error.message);
}

export async function getAdminProductsDb(): Promise<AdminProduct[]> {
  return readKv<AdminProduct[]>("products", DEFAULT_PRODUCTS);
}

export async function saveAdminProductsDb(list: AdminProduct[]): Promise<void> {
  await writeKv("products", list);
}

export async function getAdminTemplatesDb(): Promise<AdminTemplate[]> {
  return readKv<AdminTemplate[]>("templates", []);
}

export async function saveAdminTemplatesDb(list: AdminTemplate[]): Promise<void> {
  await writeKv("templates", list);
}

export async function getVoiceTemplatesDb(): Promise<VoiceTemplate[]> {
  const list = await readKv<VoiceTemplate[]>("voices", DEFAULT_VOICES);
  return list.map((voice, index) => ({
    ...voice,
    sortOrder:
      typeof voice.sortOrder === "number" && Number.isFinite(voice.sortOrder)
        ? Math.max(0, Math.floor(voice.sortOrder))
        : index,
  }));
}

export async function saveVoiceTemplatesDb(list: VoiceTemplate[]): Promise<void> {
  const normalized = list.map((voice, index) => ({
    ...voice,
    sortOrder:
      typeof voice.sortOrder === "number" && Number.isFinite(voice.sortOrder)
        ? Math.max(0, Math.floor(voice.sortOrder))
        : index,
  }));
  await writeKv("voices", normalized);
}

export async function getAdminPaymentsDb(): Promise<AdminPayment[]> {
  const supabase = getSupabaseServerClient();
  const rows = await supabase.from("admin_payments").select("*").order("paid_at", { ascending: false });
  if (rows.error) throw new Error(rows.error.message);
  return (rows.data ?? []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    username: r.username,
    productId: r.product_id,
    amount: Number(r.amount),
    paidAt: r.paid_at,
    referrerId: r.referrer_id,
    source: (r.source as "web_checkout" | "dummy" | null) ?? undefined,
    paymentKey: r.payment_key,
    orderId: r.order_id,
    status: r.status,
  }));
}

export async function syncAppUserPlanIdDb(userId: string, planId: string): Promise<void> {
  const normalized =
    planId === "small" || planId === "medium" || planId === "large" ? planId : "free";
  const supabase = getSupabaseServerClient();
  const row = await supabase
    .from("app_users")
    .update({ plan_id: normalized, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (row.error) throw new Error(row.error.message);
}

export async function saveAdminPaymentDb(payment: AdminPayment): Promise<void> {
  const supabase = getSupabaseServerClient();
  const row = await supabase.from("admin_payments").upsert({
    id: payment.id,
    user_id: payment.userId,
    username: payment.username,
    product_id: payment.productId,
    amount: payment.amount,
    paid_at: payment.paidAt,
    referrer_id: payment.referrerId ?? null,
    source: payment.source ?? null,
    payment_key: payment.paymentKey ?? null,
    order_id: payment.orderId ?? null,
    status: payment.status ?? null,
  });
  if (row.error) throw new Error(row.error.message);
}

export type AdminUserRow = {
  id: string;
  username: string;
  name: string;
  martName: string;
  martAddressBase?: string | null;
  martAddressDetail?: string | null;
  martAddress?: string | null;
  phone: string;
  referrerId?: string | null;
  planId?: string;
  createdAt: string;
  updatedAt: string;
};

export async function getAdminUsersDb(): Promise<AdminUserRow[]> {
  const supabase = getSupabaseServerClient();
  const rows = await supabase
    .from("app_users")
    .select("id,username,name,mart_name,mart_address_base,mart_address_detail,phone,referrer_id,plan_id,created_at,updated_at")
    .order("created_at", { ascending: false });
  if (rows.error) throw new Error(rows.error.message);
  return (rows.data ?? []).map((r) => ({
    id: r.id,
    username: r.username,
    name: r.name,
    martName: r.mart_name,
    martAddressBase: r.mart_address_base,
    martAddressDetail: r.mart_address_detail,
    martAddress: [r.mart_address_base, r.mart_address_detail].filter(Boolean).join(" ").trim() || null,
    phone: r.phone,
    referrerId: r.referrer_id,
    planId: r.plan_id ?? "free",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function updateUserReferrerDb(userId: string, referrerId: string | null): Promise<void> {
  const supabase = getSupabaseServerClient();
  const row = await supabase
    .from("app_users")
    .update({ referrer_id: referrerId, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (row.error) throw new Error(row.error.message);
}

const PROMO_SCRIPT_PROMPT_KV = "promo_script_prompt";
const REFERRER_ADMIN_ALLOWED_HREFS_KV = "referrer_admin_allowed_hrefs";
const ADMIN_PERMISSIONS_KV = "admin_permissions";

let legacyPromoMigrated = false;

async function migrateLegacyPromoFileOnce(): Promise<void> {
  if (legacyPromoMigrated) return;
  legacyPromoMigrated = true;
  try {
    const cur = await readKv<{ template?: string; updated_at?: string } | null>(PROMO_SCRIPT_PROMPT_KV, null);
    if (cur && typeof cur.template === "string" && cur.template.trim()) return;
    const { existsSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { ensureMartradioDataDir } = await import("@/lib/martradioDataDir.server");
    const p = join(ensureMartradioDataDir(), "promo-script-prompt.json");
    if (!existsSync(p)) return;
    const raw = readFileSync(p, "utf8");
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw) as { template?: string; updatedAt?: string };
    if (typeof parsed.template !== "string" || !parsed.template.trim()) return;
    const updatedAt =
      typeof parsed.updatedAt === "string" && parsed.updatedAt
        ? parsed.updatedAt
        : new Date().toISOString();
    await writeKv(PROMO_SCRIPT_PROMPT_KV, { template: parsed.template.trim(), updated_at: updatedAt });
  } catch {
    // 레거시 파일 없음 또는 파싱 실패 시 무시
  }
}

export async function getPromoScriptPromptForEditDb(): Promise<{
  template: string;
  updatedAt: string | null;
  source: "db" | "default";
}> {
  await migrateLegacyPromoFileOnce();
  const row = await readKv<{ template?: string; updated_at?: string } | null>(PROMO_SCRIPT_PROMPT_KV, null);
  if (row && typeof row.template === "string" && row.template.trim()) {
    return {
      template: row.template.trim(),
      updatedAt: typeof row.updated_at === "string" && row.updated_at ? row.updated_at : null,
      source: "db",
    };
  }
  return {
    template: DEFAULT_PROMO_SCRIPT_TEMPLATE,
    updatedAt: null,
    source: "default",
  };
}

export async function savePromoScriptPromptDb(template: string): Promise<{ template: string; updatedAt: string }> {
  const updatedAt = new Date().toISOString();
  await writeKv(PROMO_SCRIPT_PROMPT_KV, { template: template.trim(), updated_at: updatedAt });
  return { template: template.trim(), updatedAt };
}

export async function getReferrerAdminAllowedHrefsDb(): Promise<string[]> {
  const v = await readKv<unknown>(REFERRER_ADMIN_ALLOWED_HREFS_KV, []);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export async function setReferrerAdminAllowedHrefsDb(hrefs: string[]): Promise<void> {
  await writeKv(REFERRER_ADMIN_ALLOWED_HREFS_KV, hrefs);
}

export async function getAdminPermissionsDb(): Promise<{
  allowedHrefs?: string[];
  canManageVoiceTemplates?: boolean;
} | null> {
  const v = await readKv<unknown>(ADMIN_PERMISSIONS_KV, null);
  if (!v || typeof v !== "object") return null;
  return v as { allowedHrefs?: string[]; canManageVoiceTemplates?: boolean };
}

export async function setAdminPermissionsDb(input: {
  allowedHrefs: string[];
  canManageVoiceTemplates: boolean;
}): Promise<void> {
  await writeKv(ADMIN_PERMISSIONS_KV, input);
}

/** 구독 결제 확정 시 관리자 결제 목록에 반영(동일 orderId면 upsert로 덮어씀). */
export async function recordAdminPaymentForSubscriptionCharge(params: {
  userId: string;
  planId: string;
  orderId: string;
  paymentKey: string;
  amountKrw: number;
  paidAtIso: string;
}): Promise<void> {
  if (!Number.isFinite(params.amountKrw) || params.amountKrw < 0) return;
  const supabase = getSupabaseServerClient();
  const u = await supabase
    .from("app_users")
    .select("username,referrer_id")
    .eq("id", params.userId)
    .limit(1)
    .maybeSingle();
  if (u.error || !u.data) return;
  const id = `pay_${params.orderId}`;
  await saveAdminPaymentDb({
    id,
    userId: params.userId,
    username: u.data.username,
    productId: params.planId,
    amount: Math.max(0, Math.floor(params.amountKrw)),
    paidAt: params.paidAtIso,
    referrerId: u.data.referrer_id,
    source: "web_checkout",
    paymentKey: params.paymentKey,
    orderId: params.orderId,
    status: "DONE",
  });
}

