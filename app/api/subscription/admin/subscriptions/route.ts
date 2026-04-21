import { NextResponse } from "next/server";
import { getAllSubscriptionStatuses } from "@/lib/subscriptionServerStore";
import { requireSuperAdminApi } from "@/lib/requireAdminApi.server";

export async function GET() {
  const admin = await requireSuperAdminApi();
  if (admin instanceof NextResponse) return admin;
  const subscriptions = await getAllSubscriptionStatuses();
  return NextResponse.json({ ok: true, subscriptions });
}
