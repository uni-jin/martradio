import { NextResponse } from "next/server";
import { requireAdminApi, requireAdminPathAccessApi } from "@/lib/requireAdminApi.server";
import { ADMIN_PRODUCTS_HREF } from "@/lib/adminMenuCatalog";
import {
  getAdminPaymentsDb,
  getAdminProductsDb,
  getVoiceTemplatesDb,
  type AdminPayment,
} from "@/lib/adminDataSupabase.server";
import { getAdminUsersWithMergedSubscriptionPlan } from "@/lib/adminUsersEffectivePlan.server";
import { readReferrerStore, toPublicReferrer } from "@/lib/referrerStore.server";

type PublicReferrer = ReturnType<typeof toPublicReferrer>;

function buildTopReferrers(
  referrers: PublicReferrer[],
  users: Array<Record<string, unknown>>,
  payments: AdminPayment[]
) {
  const signupsByRef = new Map<string, number>();
  for (const u of users) {
    const refId = u.referrerId;
    if (typeof refId === "string" && refId.trim()) {
      const key = refId.trim();
      signupsByRef.set(key, (signupsByRef.get(key) ?? 0) + 1);
    }
  }

  const userRefById = new Map<string, string>();
  for (const u of users) {
    const uid = typeof u.id === "string" ? u.id.trim() : "";
    const rid = typeof u.referrerId === "string" ? u.referrerId.trim() : "";
    if (uid && rid) userRefById.set(uid, rid);
  }

  const revenueByRef = new Map<string, number>();
  const paymentCountByRef = new Map<string, number>();
  for (const p of payments) {
    const fromPayment = typeof p.referrerId === "string" ? p.referrerId.trim() : "";
    const key = fromPayment || userRefById.get((p.userId ?? "").trim()) || "";
    if (!key) continue;
    revenueByRef.set(key, (revenueByRef.get(key) ?? 0) + p.amount);
    paymentCountByRef.set(key, (paymentCountByRef.get(key) ?? 0) + 1);
  }

  return referrers
    .map((r) => ({
      id: r.id,
      name: r.name,
      signups: signupsByRef.get(r.id) ?? 0,
      paymentCount: paymentCountByRef.get(r.id) ?? 0,
      revenue: revenueByRef.get(r.id) ?? 0,
    }))
    .sort((a, b) => {
      if (b.signups !== a.signups) return b.signups - a.signups;
      return b.revenue - a.revenue;
    })
    .slice(0, 3);
}

export async function GET() {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  try {
    const [refData, usersData, payments, voices] = await Promise.all([
      readReferrerStore(),
      getAdminUsersWithMergedSubscriptionPlan(),
      getAdminPaymentsDb(),
      getVoiceTemplatesDb(),
    ]);

    let products: { id: string; name: string; isActive?: boolean }[] = [];
    const productAccess = await requireAdminPathAccessApi(ADMIN_PRODUCTS_HREF);
    if (!(productAccess instanceof NextResponse)) {
      products = await getAdminProductsDb();
    }

    const referrers = refData.referrers.map(toPublicReferrer);
    const users = usersData as Array<Record<string, unknown>>;

    const paidUsers = users.filter((u) => String(u.planId ?? "free") !== "free").length;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const paymentsThisMonth = payments.filter((p) => new Date(p.paidAt).getTime() >= monthStart).length;
    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
    const planMap = new Map<string, number>();
    for (const u of users) {
      const k = String(u.planId ?? "free");
      planMap.set(k, (planMap.get(k) ?? 0) + 1);
    }

    return NextResponse.json({
      ok: true,
      referrers,
      users,
      products: products.map((p) => ({ id: p.id, name: p.name, isActive: p.isActive })),
      payments,
      voices,
      stats: {
        totalUsers: users.length,
        paidUsers,
        paymentCount: payments.length,
        totalRevenue,
        paymentsThisMonth,
        referrersTotal: referrers.length,
        referrersActive: referrers.filter((r) => r.isActive).length,
        templatesTotal: 0,
        templatesPaidOnly: 0,
        productsActive: products.filter((p) => p.isActive !== false).length,
        voicesEnabled: voices.filter((v) => v.enabled !== false).length,
        voicesTotal: voices.length,
        payments7d: payments.filter((p) => new Date(p.paidAt).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000)
          .length,
        revenue7d: payments
          .filter((p) => new Date(p.paidAt).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000)
          .reduce((sum, p) => sum + p.amount, 0),
        planBreakdown: [...planMap.entries()].map(([key, count]) => ({ key, label: key, count })),
        topReferrers: buildTopReferrers(referrers, users, payments),
        recentPayments: payments
          .slice()
          .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
          .slice(0, 10),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "조회 실패" }, { status: 500 });
  }
}

