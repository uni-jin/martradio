import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, requireSuperAdminApi } from "@/lib/requireAdminApi.server";
import { referrerSessionCanAccessHref } from "@/lib/referrerAdminAccess.server";
import { findReferrerById, toPublicReferrer, updateReferrerRecord } from "@/lib/referrerStore.server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApi();
  if (admin instanceof NextResponse) return admin;
  const { id } = await ctx.params;

  if (admin.role === "referrer_admin") {
    const can = await referrerSessionCanAccessHref(admin, "/admin/referrers");
    if (!can || admin.referrerId !== id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
  }

  const row = await findReferrerById(id);
  if (!row) {
    return NextResponse.json({ error: "추천인을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, referrer: toPublicReferrer(row) });
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const gate = await requireSuperAdminApi();
  if (gate instanceof NextResponse) return gate;
  const { id } = await ctx.params;

  let body: {
    name?: unknown;
    personName?: unknown;
    phone?: unknown;
    email?: unknown;
    isActive?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name : "";
  if (!name.trim()) {
    return NextResponse.json({ error: "추천인(코드명)을 입력하세요." }, { status: 400 });
  }
  const updated = await updateReferrerRecord(id, {
    name,
    personName: typeof body.personName === "string" ? body.personName : "",
    phone: typeof body.phone === "string" ? body.phone : "",
    email: typeof body.email === "string" ? body.email : "",
    isActive: body.isActive !== false,
  });
  if (!updated.ok) {
    return NextResponse.json({ error: updated.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, referrer: toPublicReferrer(updated.row) });
}
