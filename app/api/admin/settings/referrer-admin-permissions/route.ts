import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/requireAdminApi.server";
import { ADMIN_MENU_GROUPS } from "@/lib/adminMenuCatalog";
import { getAdminPermissions, updateAdminPermissions } from "@/lib/adminPermissions.server";
import { getAllowedHrefsForReferrerAdmins, setAllowedHrefsForReferrerAdmins } from "@/lib/referrerStore.server";

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (gate instanceof NextResponse) return gate;
  const [referrerAllowedHrefs, adminPermissions] = await Promise.all([
    getAllowedHrefsForReferrerAdmins(),
    getAdminPermissions(),
  ]);
  return NextResponse.json({ ok: true, menuGroups: ADMIN_MENU_GROUPS, referrerAllowedHrefs, adminPermissions });
}

export async function PUT(request: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (gate instanceof NextResponse) return gate;
  let body: {
    referrerAllowedHrefs?: unknown;
    adminPermissions?: { allowedHrefs?: unknown; canManageVoiceTemplates?: unknown };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  if (!Array.isArray(body.referrerAllowedHrefs)) {
    return NextResponse.json({ error: "referrerAllowedHrefs 배열이 필요합니다." }, { status: 400 });
  }
  if (!body.adminPermissions || !Array.isArray(body.adminPermissions.allowedHrefs)) {
    return NextResponse.json({ error: "adminPermissions.allowedHrefs 배열이 필요합니다." }, { status: 400 });
  }
  const referrerHrefs = body.referrerAllowedHrefs.filter((x): x is string => typeof x === "string");
  const [nextReferrer, nextAdmin] = await Promise.all([
    setAllowedHrefsForReferrerAdmins(referrerHrefs),
    updateAdminPermissions({
      allowedHrefs: body.adminPermissions.allowedHrefs.filter((x): x is string => typeof x === "string"),
      canManageVoiceTemplates: body.adminPermissions.canManageVoiceTemplates === true,
    }),
  ]);
  return NextResponse.json({
    ok: true,
    referrerAllowedHrefs: nextReferrer,
    adminPermissions: nextAdmin,
  });
}
