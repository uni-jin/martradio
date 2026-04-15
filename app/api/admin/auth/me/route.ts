import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/requireAdminApi.server";
import { REFERRER_ADMIN_PASSWORD_HREF } from "@/lib/adminMenuCatalog";
import { findReferrerById, getAllowedHrefsForReferrerAdmins } from "@/lib/referrerStore.server";

export async function GET() {
  const admin = await requireAdminApi();
  if (admin instanceof NextResponse) return admin;

  if (admin.role === "admin") {
    return NextResponse.json({
      ok: true,
      username: admin.username,
      role: "admin" as const,
      referrerId: null,
      mustChangePassword: false,
      allowedHrefs: null,
    });
  }

  const ref = admin.referrerId ? await findReferrerById(admin.referrerId) : null;
  const mustChangePassword = ref?.usesDefaultPassword ?? false;
  const base = await getAllowedHrefsForReferrerAdmins();
  const allowedHrefs = [...new Set([...base, REFERRER_ADMIN_PASSWORD_HREF])];

  return NextResponse.json({
    ok: true,
    username: admin.username,
    role: "referrer_admin" as const,
    referrerId: admin.referrerId,
    mustChangePassword,
    allowedHrefs,
  });
}
