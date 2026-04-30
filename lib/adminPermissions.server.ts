import {
  collectAssignableMenuHrefs,
  ADMIN_PERMISSION_MANAGEMENT_HREF,
  ADMIN_PRODUCTS_HREF,
  ADMIN_PROMPTS_HREF,
} from "@/lib/adminMenuCatalog";
import { getAdminPermissionsDb, setAdminPermissionsDb } from "@/lib/adminDataSupabase.server";

export type AdminPermissions = {
  allowedHrefs: string[];
  canManageVoiceTemplates: boolean;
};

const DEFAULT_BLOCKED_HREFS = new Set<string>([
  ADMIN_PRODUCTS_HREF,
  ADMIN_PROMPTS_HREF,
  ADMIN_PERMISSION_MANAGEMENT_HREF,
]);

function defaultAllowedHrefs(): string[] {
  return collectAssignableMenuHrefs().filter((href) => !DEFAULT_BLOCKED_HREFS.has(href));
}

function sanitizeAllowedHrefs(hrefs: string[]): string[] {
  const assignable = new Set(collectAssignableMenuHrefs());
  const out = hrefs.filter((x) => assignable.has(x));
  return [...new Set(out)];
}

function sanitizePermissions(raw: Partial<AdminPermissions> | null | undefined): AdminPermissions {
  const allowed = Array.isArray(raw?.allowedHrefs)
    ? raw?.allowedHrefs.filter((x): x is string => typeof x === "string")
    : defaultAllowedHrefs();
  return {
    allowedHrefs: sanitizeAllowedHrefs(allowed),
    canManageVoiceTemplates: raw?.canManageVoiceTemplates === true,
  };
}

export async function getAdminPermissions(): Promise<AdminPermissions> {
  const stored = await getAdminPermissionsDb();
  return sanitizePermissions(stored);
}

export async function updateAdminPermissions(next: AdminPermissions): Promise<AdminPermissions> {
  const sanitized = sanitizePermissions(next);
  await setAdminPermissionsDb(sanitized);
  return sanitized;
}
