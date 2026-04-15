import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSuperAdminUsernameNormalized } from "@/lib/adminCredentials.server";
import { collectAssignableMenuHrefs, REFERRER_ADMIN_PASSWORD_HREF } from "@/lib/adminMenuCatalog";
import { hashAdminPassword, verifyAdminPassword } from "@/lib/adminPasswordCrypto.server";

const STORE_DIR = join(tmpdir(), ".martradio-data");
const STORE_PATH = join(STORE_DIR, "referrer-store.json");

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
  /** 추천인 관리자에게 허용할 메뉴 href 목록 */
  referrerAdminAllowedHrefs: string[];
};

function ensureDir(): void {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true });
  }
}

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

function readRaw(): ReferrerStoreFile | null {
  try {
    if (!existsSync(STORE_PATH)) return null;
    const raw = readFileSync(STORE_PATH, "utf8");
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw) as Partial<ReferrerStoreFile>;
    if (!Array.isArray(parsed.referrers)) return null;
    const allowed = Array.isArray(parsed.referrerAdminAllowedHrefs)
      ? parsed.referrerAdminAllowedHrefs.filter((x): x is string => typeof x === "string" && x.startsWith("/"))
      : [];
    return { referrers: parsed.referrers as StoredReferrer[], referrerAdminAllowedHrefs: allowed };
  } catch {
    return null;
  }
}

function writeRaw(state: ReferrerStoreFile): void {
  ensureDir();
  writeFileSync(STORE_PATH, JSON.stringify(state, null, 2), "utf8");
}

export async function readReferrerStore(): Promise<ReferrerStoreFile> {
  const now = new Date().toISOString();
  const existing = readRaw();
  if (existing) {
    return {
      referrers: existing.referrers.map(normalizeReferrerRow),
      referrerAdminAllowedHrefs: sanitizeAllowedHrefs(existing.referrerAdminAllowedHrefs),
    };
  }
  const seeded = await withPasswordHashes(defaultSeedReferrers(now));
  const initial: ReferrerStoreFile = {
    referrers: seeded,
    referrerAdminAllowedHrefs: [],
  };
  writeRaw(initial);
  return initial;
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

export async function writeReferrerStore(next: ReferrerStoreFile): Promise<void> {
  writeRaw({
    referrers: next.referrers.map(normalizeReferrerRow),
    referrerAdminAllowedHrefs: sanitizeAllowedHrefs(next.referrerAdminAllowedHrefs),
  });
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
  const { referrers } = await readReferrerStore();
  return referrers.find((r) => r.loginId === key) ?? null;
}

export async function findReferrerById(id: string): Promise<StoredReferrer | null> {
  const { referrers } = await readReferrerStore();
  return referrers.find((r) => r.id === id) ?? null;
}

export async function getAllowedHrefsForReferrerAdmins(): Promise<string[]> {
  const { referrerAdminAllowedHrefs } = await readReferrerStore();
  return referrerAdminAllowedHrefs;
}

export async function setAllowedHrefsForReferrerAdmins(hrefs: string[]): Promise<string[]> {
  const state = await readReferrerStore();
  const nextAllowed = sanitizeAllowedHrefs(hrefs);
  await writeReferrerStore({ ...state, referrerAdminAllowedHrefs: nextAllowed });
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
  const state = await readReferrerStore();
  if (state.referrers.some((r) => r.loginId === loginId)) {
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
  await writeReferrerStore({ ...state, referrers: [...state.referrers, row] });
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
  const state = await readReferrerStore();
  const idx = state.referrers.findIndex((r) => r.id === id);
  if (idx < 0) return { ok: false, error: "추천인을 찾을 수 없습니다." };
  const prev = state.referrers[idx]!;
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
  const nextList = [...state.referrers];
  nextList[idx] = row;
  await writeReferrerStore({ ...state, referrers: nextList });
  return { ok: true, row };
}

export async function resetReferrerPasswordToDefault(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const state = await readReferrerStore();
  const idx = state.referrers.findIndex((r) => r.id === id);
  if (idx < 0) return { ok: false, error: "추천인을 찾을 수 없습니다." };
  const prev = state.referrers[idx]!;
  const passwordHash = await hashAdminPassword(prev.loginId);
  const row: StoredReferrer = {
    ...prev,
    passwordHash,
    usesDefaultPassword: true,
    updatedAt: new Date().toISOString(),
  };
  const nextList = [...state.referrers];
  nextList[idx] = row;
  await writeReferrerStore({ ...state, referrers: nextList });
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
  const state = await readReferrerStore();
  const idx = state.referrers.findIndex((r) => r.id === params.referrerId);
  if (idx < 0) return { ok: false, error: "계정을 찾을 수 없습니다." };
  const prev = state.referrers[idx]!;
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
  const nextList = [...state.referrers];
  nextList[idx] = row;
  await writeReferrerStore({ ...state, referrers: nextList });
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
  const state = await readReferrerStore();
  if (state.referrers.length > 0) return;
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
  await writeReferrerStore({
    referrers: nextRows,
    referrerAdminAllowedHrefs: state.referrerAdminAllowedHrefs,
  });
}
