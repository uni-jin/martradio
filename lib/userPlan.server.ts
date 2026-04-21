import { getSubscriptionStatusByUser } from "@/lib/subscriptionServerStore";

export type EffectivePlanId = "free" | "small" | "medium" | "large";

function normalizePlanId(raw: unknown): EffectivePlanId {
  if (raw === "small" || raw === "medium" || raw === "large") return raw;
  return "free";
}

/**
 * 결제/권한 정합성 보장을 위해 구독 스냅샷(subscription_statuses)을 우선 사용한다.
 * 레거시 데이터 호환을 위해 구독 스냅샷이 없을 때만 app_users.plan_id를 보조값으로 사용한다.
 */
export async function resolveEffectivePlanIdForUser(
  userId: string,
  fallbackPlanIdFromUser: unknown
): Promise<EffectivePlanId> {
  const sub = await getSubscriptionStatusByUser(userId);
  if (sub) {
    return normalizePlanId(sub.planId);
  }
  return normalizePlanId(fallbackPlanIdFromUser);
}

