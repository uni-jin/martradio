import { readFile } from "node:fs/promises";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import type {
  LegalDocumentType,
  LegalDocumentVersion,
  LegalDocumentsStore,
} from "@/lib/legalDocuments";

const LEGAL_DOCUMENTS_KV = "legal_documents";

function newVersionId(type: LegalDocumentType): string {
  return `legal_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeVersions(raw: unknown): LegalDocumentVersion[] {
  if (!Array.isArray(raw)) return [];
  const out: LegalDocumentVersion[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const v = row as Partial<LegalDocumentVersion>;
    if (
      typeof v.id !== "string" ||
      typeof v.version !== "string" ||
      typeof v.effectiveDate !== "string" ||
      typeof v.updatedAt !== "string" ||
      typeof v.content !== "string" ||
      typeof v.isCurrent !== "boolean"
    ) {
      continue;
    }
    out.push({
      id: v.id,
      version: v.version,
      effectiveDate: v.effectiveDate,
      updatedAt: v.updatedAt,
      content: v.content,
      changeSummary: typeof v.changeSummary === "string" ? v.changeSummary : null,
      isCurrent: v.isCurrent,
    });
  }
  return out.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

async function readFallbackContent(type: LegalDocumentType): Promise<string> {
  const path =
    type === "privacy_policy"
      ? `${process.cwd()}/docs/legal/privacy-policy.md`
      : `${process.cwd()}/docs/legal/terms-of-service.md`;
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function fallbackVersion(type: LegalDocumentType, content: string): LegalDocumentVersion {
  const now = new Date().toISOString();
  return {
    id: `fallback_${type}_v1`,
    version: "1.0.0",
    effectiveDate: now.slice(0, 10),
    updatedAt: now,
    content,
    changeSummary: "초기 버전",
    isCurrent: true,
  };
}

async function readStoreRaw(): Promise<unknown> {
  const supabase = getSupabaseServerClient();
  const row = await supabase.from("admin_kv").select("value").eq("key", LEGAL_DOCUMENTS_KV).limit(1).maybeSingle();
  if (row.error) throw new Error(row.error.message);
  return row.data?.value ?? null;
}

async function writeStoreRaw(store: LegalDocumentsStore): Promise<void> {
  const supabase = getSupabaseServerClient();
  const now = new Date().toISOString();
  const upsert = await supabase
    .from("admin_kv")
    .upsert({ key: LEGAL_DOCUMENTS_KV, value: store, updated_at: now }, { onConflict: "key" });
  if (upsert.error) throw new Error(upsert.error.message);
}

export async function getLegalDocumentsStore(): Promise<LegalDocumentsStore> {
  const raw = await readStoreRaw();
  const asObj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const privacy = normalizeVersions(asObj.privacy_policy);
  const terms = normalizeVersions(asObj.terms_of_service);
  if (privacy.length > 0 && terms.length > 0) {
    return {
      privacy_policy: privacy,
      terms_of_service: terms,
    };
  }

  const privacyContent = await readFallbackContent("privacy_policy");
  const termsContent = await readFallbackContent("terms_of_service");

  return {
    privacy_policy: privacy.length > 0 ? privacy : [fallbackVersion("privacy_policy", privacyContent)],
    terms_of_service: terms.length > 0 ? terms : [fallbackVersion("terms_of_service", termsContent)],
  };
}

export async function getLegalDocumentVersions(
  type: LegalDocumentType
): Promise<LegalDocumentVersion[]> {
  const store = await getLegalDocumentsStore();
  return store[type];
}

export async function saveNewLegalDocumentVersion(params: {
  type: LegalDocumentType;
  version: string;
  effectiveDate: string;
  content: string;
  changeSummary?: string;
}): Promise<LegalDocumentVersion> {
  const store = await getLegalDocumentsStore();
  const now = new Date().toISOString();
  const next: LegalDocumentVersion = {
    id: newVersionId(params.type),
    version: params.version.trim(),
    effectiveDate: params.effectiveDate.trim(),
    updatedAt: now,
    content: params.content.trim(),
    changeSummary: params.changeSummary?.trim() ? params.changeSummary.trim() : null,
    isCurrent: true,
  };
  const prev = store[params.type].map((v) => ({ ...v, isCurrent: false }));
  const merged: LegalDocumentsStore = {
    ...store,
    [params.type]: [next, ...prev],
  };
  await writeStoreRaw(merged);
  return next;
}
