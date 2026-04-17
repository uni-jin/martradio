import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/requireAdminApi.server";
import { updateUserReferrerDb } from "@/lib/adminDataSupabase.server";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const gate = await requireSuperAdminApi();
  if (gate instanceof NextResponse) return gate;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { referrerId?: unknown };
  const referrerId =
    typeof body.referrerId === "string" && body.referrerId.trim() ? body.referrerId.trim() : null;
  try {
    await updateUserReferrerDb(id, referrerId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "저장 실패" }, { status: 500 });
  }
}

