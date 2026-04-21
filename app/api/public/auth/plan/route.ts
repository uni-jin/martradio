import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getValidatedUserSession } from "@/lib/userSession.server";

export async function PATCH(req: NextRequest) {
  const validated = await getValidatedUserSession();
  if (!validated.ok) {
    return NextResponse.json({ error: validated.message, code: validated.code }, { status: 401 });
  }
  const userId = validated.userId;
  const body = (await req.json().catch(() => ({}))) as { planId?: string };
  const planId = (body.planId ?? "").trim();
  if (!["free", "small", "medium", "large"].includes(planId)) {
    return NextResponse.json({ error: "유효하지 않은 플랜입니다." }, { status: 400 });
  }
  const supabase = getSupabaseServerClient();
  const updated = await supabase
    .from("app_users")
    .update({ plan_id: planId, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("id,username,name,plan_id")
    .limit(1)
    .maybeSingle();
  if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 500 });
  if (!updated.data) return NextResponse.json({ error: "회원 정보를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({
    ok: true,
    user: {
      id: updated.data.id,
      email: updated.data.username,
      name: updated.data.name,
      isUnlimited: false,
      planId: updated.data.plan_id ?? "free",
    },
  });
}

