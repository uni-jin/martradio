import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getValidatedUserSession } from "@/lib/userSession.server";

export async function GET() {
  const validated = await getValidatedUserSession();
  if (!validated.ok) {
    if (validated.code === "login_required") return NextResponse.json({ user: null });
    return NextResponse.json({ error: validated.message, code: validated.code }, { status: 401 });
  }
  const userId = validated.userId;
  const supabase = getSupabaseServerClient();
  const found = await supabase
    .from("app_users")
    .select("id,username,name,mart_name,mart_address_base,mart_address_detail,phone,referrer_id,plan_id")
    .eq("id", userId)
    .limit(1)
    .maybeSingle();
  if (found.error) return NextResponse.json({ error: found.error.message }, { status: 500 });
  if (!found.data) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: {
      id: found.data.id,
      email: found.data.username,
      name: found.data.name,
      isUnlimited: false,
      planId: found.data.plan_id ?? "free",
      martName: found.data.mart_name,
      martAddressBase: found.data.mart_address_base,
      martAddressDetail: found.data.mart_address_detail,
      phone: found.data.phone,
      referrerId: found.data.referrer_id,
    },
  });
}

