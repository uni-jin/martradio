import { NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/requireAdminApi.server";
import { resetReferrerPasswordToDefault } from "@/lib/referrerStore.server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  const gate = await requireSuperAdminApi();
  if (gate instanceof NextResponse) return gate;
  const { id } = await ctx.params;
  const res = await resetReferrerPasswordToDefault(id);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
