import { NextResponse } from "next/server";
import { requireAdminApi, requireAdminPathAccessApi } from "@/lib/requireAdminApi.server";
import { ADMIN_PRODUCTS_HREF } from "@/lib/adminMenuCatalog";
import { getAdminUsersWithMergedSubscriptionPlan } from "@/lib/adminUsersEffectivePlan.server";
import { getAdminPaymentsDb, getAdminProductsDb } from "@/lib/adminDataSupabase.server";
import { readReferrerStore, toPublicReferrer } from "@/lib/referrerStore.server";
import { getAllSubscriptionStatuses } from "@/lib/subscriptionServerStore";

export async function GET() {
  const admin = await requireAdminApi();
  if (admin instanceof NextResponse) return admin;

  try {
    const [refData, users, payments] = await Promise.all([
      readReferrerStore(),
      getAdminUsersWithMergedSubscriptionPlan(),
      getAdminPaymentsDb(),
    ]);
    let products: { id: string; name: string; priceMonthly: number; isActive?: boolean }[] = [];
    const productAccess = await requireAdminPathAccessApi(ADMIN_PRODUCTS_HREF);
    if (!(productAccess instanceof NextResponse)) {
      products = await getAdminProductsDb();
    }

    const subscriptions =
      admin.role === "super"
        ? await getAllSubscriptionStatuses()
        : [];

    return NextResponse.json({
      ok: true,
      referrers: refData.referrers.map(toPublicReferrer),
      users,
      payments,
      products,
      subscriptions,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "조회 실패" }, { status: 500 });
  }
}

