import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { setSessionCookie } from "@/lib/userSession.server";
import { resolveEffectivePlanIdForUser } from "@/lib/userPlan.server";

function verifyPassword(password: string, stored: string): boolean {
  const [salt, digest] = stored.split(":");
  if (!salt || !digest) return false;
  const computed = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(digest, "hex"));
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
    const username = (body.username ?? "").trim();
    const password = body.password ?? "";
    if (!username || !password) {
      return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 400 });
    }
    const supabase = getSupabaseServerClient();
    const found = await supabase
      .from("app_users")
      .select("id,username,hashed_password,name,plan_id")
      .eq("username", username)
      .limit(1)
      .maybeSingle();
    if (found.error) return NextResponse.json({ error: found.error.message }, { status: 500 });
    if (!found.data || !verifyPassword(password, found.data.hashed_password)) {
      return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }
    await setSessionCookie(found.data.id);
    const planId = await resolveEffectivePlanIdForUser(found.data.id, found.data.plan_id);
    return NextResponse.json({
      ok: true,
      user: {
        id: found.data.id,
        email: found.data.username,
        name: found.data.name,
        isUnlimited: false,
        planId,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "로그인에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

