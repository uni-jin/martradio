import { NextResponse } from "next/server";
import { getAdminPaymentsDb, type AdminPayment } from "@/lib/adminDataSupabase.server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getValidatedUserSession } from "@/lib/userSession.server";

export async function GET() {
  const validated = await getValidatedUserSession();
  if (!validated.ok) {
    return NextResponse.json({ error: validated.message, code: validated.code }, { status: 401 });
  }
  const userId = validated.userId;
  try {
    const supabase = getSupabaseServerClient();
    const u = await supabase.from("app_users").select("username").eq("id", userId).limit(1).maybeSingle();
    const username = u.data?.username?.trim() ?? "";
    const all = await getAdminPaymentsDb();
    const mine: AdminPayment[] = all
      .filter((p) => p.userId === userId || (username.length > 0 && p.username === username))
      .slice()
      .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
    return NextResponse.json({ ok: true, payments: mine });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "조회 실패" }, { status: 500 });
  }
}
