import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/requireAdminApi.server";
import { getAdminUsersWithMergedSubscriptionPlan } from "@/lib/adminUsersEffectivePlan.server";

export async function GET() {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;
  try {
    const users = await getAdminUsersWithMergedSubscriptionPlan();
    return NextResponse.json({ ok: true, users });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "조회 실패" }, { status: 500 });
  }
}

