import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getReferrerAdminAllowedHrefsDb,
  setReferrerAdminAllowedHrefsDb,
} from "@/lib/adminDataSupabase.server";
import { getSuperAdminUsernameNormalized } from "@/lib/adminCredentials.server";
import { ensureMartradioDataDir } from "@/lib/martradioDataDir.server";
import { collectAssignableMenuHrefs, REFERRER_ADMIN_PASSWORD_HREF } from "@/lib/adminMenuCatalog";
import { hashAdminPassword, verifyAdminPassword } from "@/lib/adminPasswordCrypto.server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

function legacyReferrerStorePath(): string {
  return join(ensureMartradioDataDir(), "referrer-store.json");
}

export type StoredReferrer = {
  id: string;
  loginId: string;
  name: string;
  personName: string;
  phone: string;
  email: string;
  isActive: boolean;
  passwordHash: string;
  usesDefaultPassword: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ReferrerPublic = Omit<StoredReferrer, "passwordHash">;

type ReferrerStoreFile = {
  referrers: StoredReferrer[];
  referrerAdminAllowedHrefs: string[];
};

type LegacyReferrerStoreFile = {
  referrers: StoredReferrer[];
  referrerAdminAllowedHrefs: string[];
};

function normalizeLoginId(raw: string): string {
  return raw.trim().toLowerCase();
}

function isValidLoginId(raw: string): boolean {
  const s = raw.trim();
  if (s.length < 2 || s.length > 64) return false;
  return /^[a-zA-Z0-9]+$/.test(s);
}

function defaultSeedReferrers(now: string): StoredReferrer[] {
  const seeds: Array<{ id: string; loginId: string; name: string; personName: string }> = [
    { id: "ref-kim", loginId: "kimsales", name: "kim-sales", personName: "김영업" },
    { id: "ref-lee", loginId: "leesales", name: "lee-sales", personName: "이대리" },
  ];
  return seeds.map((s) => ({
    id: s.id,
    loginId: normalizeLoginId(s.loginId),
    name: s.name,
    personName: s.personName,
    phone: "",
    email: "",
    isActive: true,
    passwordHash: "",
    usesDefaultPassword: true,
    createdAt: now,
    updatedAt: now,
  }));
}

async function withPasswordHashes(rows: StoredReferrer[]): Promise<StoredReferrer[]> {
  const out: StoredReferrer[] = [];
  for (const r of rows) {
    const hash =
      r.passwordHash && r.passwordHash.startsWith("scrypt1:")
        ? r.passwordHash
        : await hashAdminPassword(r.loginId);
    out.push({ ...r, passwordHash: hash });
  }
  return out;
}

function readLegacyFile(): LegacyReferrerStoreFile | null {
  try {
    const STORE_PATH = legacyReferrerStorePath();
    if (!existsSync(STORE_PATH)) return null;
    const raw = readFileSync(STORE_PATH, "utf8");
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw) as Partial<LegacyReferrerStoreFile>;
    if (!Array.isArray(parsed.referrers)) return null;
    const allowed = Array.isArray(parsed.referrerAdminAllowedHrefs)
      ? parsed.referrerAdminAllowedHrefs.filter((x): x is string => typeof x === "string" && x.startsWith("/"))
      : [];
    return { referrers: parsed.referrers as StoredReferrer[], referrerAdminAllowedHrefs: allowed };
  } catch {
    return null;
  }
}

function rowToStored(r: {
  id: string;
  login_id: string;
  name: string;
  person_name: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  password_hash: string;
  uses_default_password: boolean;
  created_at: string;
  updated_at: string;
}): StoredReferrer {
  return normalizeReferrerRow({
    id: r.id,
    loginId: r.login_id,
    name: r.name,
    personName: r.person_name ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
    isActive: r.is_active,
    passwordHash: r.password_hash,
    usesDefaultPassword: r.uses_default_password,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
}

function storedToRow(r: StoredReferrer): Record<string, unknown> {
  return {
    id: r.id,
    login_id: r.loginId,
    name: r.name,
    person_name: r.personName,
    phone: r.phone,
    email: r.email,
    is_active: r.isActive,
    password_hash: r.passwordHash,
    uses_default_password: r.usesDefaultPassword,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

let migratedLegacyFile = false;

async function migrateLegacyFileToDbIfNeeded(): Promise<void> {
  if (migratedLegacyFile) return;
  migratedLegacyFile = true;
  const supabase = getSupabaseServerClient();
  const cnt = await supabase.from("referrer_accounts").select("id", { count: "exact", head: true });
  if (cnt.error) return;
  if ((cnt.count ?? 0) > 0) return;

  const legacy = readLegacyFile();
  if (legacy?.referrers?.length) {
    const hashed = await withPasswordHashes(legacy.referrers.map(normalizeReferrerRow));
    for (const r of hashed) {
      await supabase.from("referrer_accounts").upsert(storedToRow(r), { onConflict: "id" });
    }
    if (legacy.referrerAdminAllowedHrefs.length > 0) {
      await setReferrerAdminAllowedHrefsDb(sanitizeAllowedHrefs(legacy.referrerAdminAllowedHrefs));
    }
    return;
  }

  const now = new Date().toISOString();
  const seeded = await withPasswordHashes(defaultSeedReferrers(now));
  for (const r of seeded) {
    await supabase.from("referrer_accounts").insert(storedToRow(r));
  }
}

function normalizeReferrerRow(r: StoredReferrer): StoredReferrer {
  return {
    ...r,
    loginId: normalizeLoginId(r.loginId),
    name: typeof r.name === "string" ? r.name : "",
    personName: typeof r.personName === "string" ? r.personName : "",
    phone: typeof r.phone === "string" ? r.phone : "",
    email: typeof r.email === "string" ? r.email : "",
    isActive: r.isActive !== false,
    usesDefaultPassword: r.usesDefaultPassword === true,
  };
}

function sanitizeAllowedHrefs(list: string[]): string[] {
  const assignable = new Set(collectAssignableMenuHrefs());
  const out: string[] = [];
  for (const h of list) {
    if (assignable.has(h) && h !== REFERRER_ADMIN_PASSWORD_HREF) {
      out.push(h);
    }
  }
  return [...new Set(out)];
}

export async function readReferrerStore(): Promise<ReferrerStoreFile> {
  await migrateLegacyFileToDbIfNeeded();
  const supabase = getSupabaseServerClient();
  const res = await supabase.from("referrer_accounts").select("*").order("created_at", { ascending: true });
  if (res.error) throw new Error(res.error.message);
  const rows = res.data ?? [];
  if (rows.length === 0) {
    const now = new Date().toISOString();
    const seeded = await withPasswordHashes(defaultSeedReferrers(now));
    for (const r of seeded) {
      await supabase.from("referrer_accounts").insert(storedToRow(r));
    }
    const again = await supabase.from("referrer_accounts").select("*").order("created_at", { ascending: true });
    if (again.error) throw new Error(again.error.message);
    const referrers = (again.data ?? []).map((x) => rowToStored(x as Parameters<typeof rowToStored>[0]));
    const referrerAdminAllowedHrefs = sanitizeAllowedHrefs(await getReferrerAdminAllowedHrefsDb());
    return { referrers, referrerAdminAllowedHrefs };
  }
  const referrers = rows.map((x) => rowToStored(x as Parameters<typeof rowToStored>[0]));
  const referrerAdminAllowedHrefs = sanitizeAllowedHrefs(await getReferrerAdminAllowedHrefsDb());
  return { referrers, referrerAdminAllowedHrefs };
}

export async function writeReferrerStore(next: ReferrerStoreFile): Promise<void> {
  const supabase = getSupabaseServerClient();
  const normalized = next.referrers.map(normalizeReferrerRow);
  const ids = new Set(normalized.map((r) => r.id));
  const existing = await supabase.from("referrer_accounts").select("id");
  if (existing.error) throw new Error(existing.error.message);
  for (const row of existing.data ?? []) {
    const id = row.id as string;
    if (!ids.has(id)) {
      const del = await supabase.from("referrer_accounts").delete().eq("id", id);
      if (del.error) throw new Error(del.error.message);
    }
  }
  for (const r of normalized) {
    const up = await supabase.from("referrer_accounts").upsert(storedToRow(r), { onConflict: "id" });
    if (up.error) throw new Error(up.error.message);
  }
  await setReferrerAdminAllowedHrefsDb(sanitizeAllowedHrefs(next.referrerAdminAllowedHrefs));
}

export function toPublicReferrer(r: StoredReferrer): ReferrerPublic {
  const { passwordHash: _p, ...rest } = r;
  return rest;
}

export async function getReferrerOptionsPublic(): Promise<{ id: string; name: string }[]> {
  const { referrers } = await readReferrerStore();
  return referrers
    .filter((r) => r.isActive)
    .map((r) => ({ id: r.id, name: r.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export async function findReferrerByLoginId(loginId: string): Promise<StoredReferrer | null> {
  const key = normalizeLoginId(loginId);
  const supabase = getSupabaseServerClient();
  const res = await supabase.from("referrer_accounts").select("*").eq("login_id", key).limit(1).maybeSingle();
  if (res.error || !res.data) return null;
  return rowToStored(res.data as Parameters<typeof rowToStored>[0]);
}

export async function findReferrerById(id: string): Promise<StoredReferrer | null> {
  const supabase = getSupabaseServerClient();
  const res = await supabase.from("referrer_accounts").select("*").eq("id", id).limit(1).maybeSingle();
  if (res.error || !res.data) return null;
  return rowToStored(res.data as Parameters<typeof rowToStored>[0]);
}

export async function getAllowedHrefsForReferrerAdmins(): Promise<string[]> {
  return sanitizeAllowedHrefs(await getReferrerAdminAllowedHrefsDb());
}

export async function setAllowedHrefsForReferrerAdmins(hrefs: string[]): Promise<string[]> {
  const nextAllowed = sanitizeAllowedHrefs(hrefs);
  await setReferrerAdminAllowedHrefsDb(nextAllowed);
  return nextAllowed;
}

export async function verifyReferrerCredentials(
  loginId: string,
  password: string
): Promise<StoredReferrer | null> {
  const r = await findReferrerByLoginId(loginId);
  if (!r || !r.isActive) return null;
  const ok = await verifyAdminPassword(password, r.passwordHash);
  return ok ? r : null;
}

export async function createReferrerRecord(input: {
  loginId: string;
  name: string;
  personName: string;
  phone: string;
  email: string;
  isActive: boolean;
}): Promise<{ ok: true; row: StoredReferrer } | { ok: false; error: string }> {
  const loginId = normalizeLoginId(input.loginId);
  if (!isValidLoginId(input.loginId)) {
    return { ok: false, error: "추천인 ID는 영문·숫자만 사용할 수 있으며 2~64자여야 합니다." };
  }
  if (loginId === getSuperAdminUsernameNormalized()) {
    return { ok: false, error: "최고 관리자 아이디와 동일한 추천인 ID는 사용할 수 없습니다." };
  }
  const dup = await findReferrerByLoginId(loginId);
  if (dup) {
    return { ok: false, error: "이미 사용 중인 추천인 ID입니다." };
  }
  const now = new Date().toISOString();
  const id = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const passwordHash = await hashAdminPassword(loginId);
  const row: StoredReferrer = {
    id,
    loginId,
    name: input.name.trim(),
    personName: input.personName.trim(),
    phone: input.phone.trim(),
    email: input.email.trim(),
    isActive: input.isActive,
    passwordHash,
    usesDefaultPassword: true,
    createdAt: now,
    updatedAt: now,
  };
  const supabase = getSupabaseServerClient();
  const ins = await supabase.from("referrer_accounts").insert(storedToRow(row));
  if (ins.error) return { ok: false, error: ins.error.message };
  return { ok: true, row };
}

export async function updateReferrerRecord(
  id: string,
  patch: {
    name: string;
    personName: string;
    phone: string;
    email: string;
    isActive: boolean;
  }
): Promise<{ ok: true; row: StoredReferrer } | { ok: false; error: string }> {
  const prev = await findReferrerById(id);
  if (!prev) return { ok: false, error: "추천인을 찾을 수 없습니다." };
  const now = new Date().toISOString();
  const row: StoredReferrer = {
    ...prev,
    name: patch.name.trim(),
    personName: patch.personName.trim(),
    phone: patch.phone.trim(),
    email: patch.email.trim(),
    isActive: patch.isActive,
    updatedAt: now,
  };
  const supabase = getSupabaseServerClient();
  const up = await supabase.from("referrer_accounts").update(storedToRow(row)).eq("id", id);
  if (up.error) return { ok: false, error: up.error.message };
  return { ok: true, row };
}

export async function resetReferrerPasswordToDefault(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const prev = await findReferrerById(id);
  if (!prev) return { ok: false, error: "추천인을 찾을 수 없습니다." };
  const passwordHash = await hashAdminPassword(prev.loginId);
  const row: StoredReferrer = {
    ...prev,
    passwordHash,
    usesDefaultPassword: true,
    updatedAt: new Date().toISOString(),
  };
  const supabase = getSupabaseServerClient();
  const up = await supabase.from("referrer_accounts").update(storedToRow(row)).eq("id", id);
  if (up.error) return { ok: false, error: up.error.message };
  return { ok: true };
}

export async function changeReferrerPassword(params: {
  referrerId: string;
  loginId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const newPw = params.newPassword;
  if (newPw.length < 4) {
    return { ok: false, error: "새 비밀번호는 4자 이상이어야 합니다." };
  }
  if (newPw === params.loginId) {
    return { ok: false, error: "새 비밀번호는 추천인 ID와 같을 수 없습니다." };
  }
  const prev = await findReferrerById(params.referrerId);
  if (!prev) return { ok: false, error: "계정을 찾을 수 없습니다." };
  if (prev.loginId !== params.loginId) {
    return { ok: false, error: "계정을 찾을 수 없습니다." };
  }
  const curOk = await verifyAdminPassword(params.currentPassword, prev.passwordHash);
  if (!curOk) {
    return { ok: false, error: "현재 비밀번호가 올바르지 않습니다." };
  }
  const passwordHash = await hashAdminPassword(newPw);
  const row: StoredReferrer = {
    ...prev,
    passwordHash,
    usesDefaultPassword: false,
    updatedAt: new Date().toISOString(),
  };
  const supabase = getSupabaseServerClient();
  const up = await supabase.from("referrer_accounts").update(storedToRow(row)).eq("id", params.referrerId);
  if (up.error) return { ok: false, error: up.error.message };
  return { ok: true };
}

export function validateLoginIdFormat(raw: string): boolean {
  return isValidLoginId(raw);
}

export async function importLegacyLocalReferrersIfEmpty(
  rows: Array<{
    id: string;
    name: string;
    personName?: string;
    phone?: string;
    email?: string;
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
  }>
): Promise<void> {
  const { referrers } = await readReferrerStore();
  if (referrers.length > 0) return;
  if (!rows.length) return;
  const now = new Date().toISOString();
  const used = new Set<string>();
  const nextRows: StoredReferrer[] = [];
  for (const r of rows) {
    if (typeof r.id !== "string" || typeof r.name !== "string") continue;
    let base = r.name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (base.length < 2) {
      base = `r${r.id.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 20)}`;
    }
    let loginId = base;
    let n = 0;
    while (used.has(loginId)) {
      n += 1;
      loginId = `${base}${n}`;
    }
    used.add(loginId);
    const passwordHash = await hashAdminPassword(loginId);
    nextRows.push({
      id: r.id,
      loginId,
      name: r.name.trim(),
      personName: typeof r.personName === "string" ? r.personName : "",
      phone: typeof r.phone === "string" ? r.phone : "",
      email: typeof r.email === "string" ? r.email : "",
      isActive: r.isActive !== false,
      passwordHash,
      usesDefaultPassword: true,
      createdAt: typeof r.createdAt === "string" && r.createdAt ? r.createdAt : now,
      updatedAt: typeof r.updatedAt === "string" && r.updatedAt ? r.updatedAt : now,
    });
  }
  if (nextRows.length === 0) return;
  const allowed = await getReferrerAdminAllowedHrefsDb();
  await writeReferrerStore({
    referrers: nextRows,
    referrerAdminAllowedHrefs: allowed,
  });
}
