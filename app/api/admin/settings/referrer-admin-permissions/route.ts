import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/requireAdminApi.server";
import { ADMIN_MENU_GROUPS } from "@/lib/adminMenuCatalog";
import { getAllowedHrefsForReferrerAdmins, setAllowedHrefsForReferrerAdmins } from "@/lib/referrerStore.server";

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (gate instanceof NextResponse) return gate;
  const allowedHrefs = await getAllowedHrefsForReferrerAdmins();
  return NextResponse.json({ ok: true, menuGroups: ADMIN_MENU_GROUPS, allowedHrefs });
}

export async function PUT(request: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (gate instanceof NextResponse) return gate;
  let body: { allowedHrefs?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  if (!Array.isArray(body.allowedHrefs)) {
    return NextResponse.json({ error: "allowedHrefs 배열이 필요합니다." }, { status: 400 });
  }
  const hrefs = body.allowedHrefs.filter((x): x is string => typeof x === "string");
  const next = await setAllowedHrefsForReferrerAdmins(hrefs);
  return NextResponse.json({ ok: true, allowedHrefs: next });
}
