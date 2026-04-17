import type { VoiceTemplate } from "@/lib/voiceTemplateTypes";
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
  return readKv<VoiceTemplate[]>("voices", DEFAULT_VOICES);
}

export async function saveVoiceTemplatesDb(list: VoiceTemplate[]): Promise<void> {
  await writeKv("voices", list);
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

