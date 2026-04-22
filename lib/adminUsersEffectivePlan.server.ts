import { getAdminUsersDb, type AdminUserRow } from "@/lib/adminDataSupabase.server";
import { getAllSubscriptionStatuses } from "@/lib/subscriptionServerStore";

function normalizePlanColumn(planId: string): string {
  if (planId === "small" || planId === "medium" || planId === "large") return planId;
  return "free";
}

/**
 * 관리자 회원 목록의 planId를 `subscription_statuses`와 맞춘다(행이 있으면 그 plan_id가 우선).
 * 사용자 API의 `resolveEffectivePlanIdForUser`와 동일한 우선순위다.
 */
export async function getAdminUsersWithMergedSubscriptionPlan(): Promise<AdminUserRow[]> {
  const [users, subs] = await Promise.all([getAdminUsersDb(), getAllSubscriptionStatuses()]);
  const planByUser = new Map(subs.map((s) => [s.userId, normalizePlanColumn(s.planId)]));
  return users.map((u) => {
    if (!planByUser.has(u.id)) return u;
    return { ...u, planId: planByUser.get(u.id)! };
  });
}
