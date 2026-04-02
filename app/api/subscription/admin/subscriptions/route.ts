import { NextResponse } from "next/server";
import { getAllSubscriptionStatuses } from "@/lib/subscriptionServerStore";

export async function GET() {
  const subscriptions = getAllSubscriptionStatuses();
  return NextResponse.json({ ok: true, subscriptions });
}
