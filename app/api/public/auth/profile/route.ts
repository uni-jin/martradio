import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getValidatedUserSession } from "@/lib/userSession.server";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

export async function GET() {
  const validated = await getValidatedUserSession();
  if (!validated.ok) {
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
  if (!found.data) return NextResponse.json({ error: "회원 정보를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({
    ok: true,
    profile: {
      id: found.data.id,
      username: found.data.username,
      name: found.data.name,
      martName: found.data.mart_name,
      martAddressBase: found.data.mart_address_base,
      martAddressDetail: found.data.mart_address_detail,
      phone: found.data.phone,
      referrerId: found.data.referrer_id,
      planId: found.data.plan_id ?? "free",
    },
  });
}

export async function PATCH(req: NextRequest) {
  const validated = await getValidatedUserSession();
  if (!validated.ok) {
    return NextResponse.json({ error: validated.message, code: validated.code }, { status: 401 });
  }
  const userId = validated.userId;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    martName?: string;
    martAddressBase?: string;
    martAddressDetail?: string;
    phone?: string;
    newPassword?: string;
    newPasswordConfirm?: string;
  };
  const name = (body.name ?? "").trim();
  const martName = (body.martName ?? "").trim();
  const phone = (body.phone ?? "").trim();
  if (!name || !martName || !phone) {
    return NextResponse.json({ error: "필수 항목을 모두 입력해 주세요." }, { status: 400 });
  }
  const supabase = getSupabaseServerClient();
  const updates: Record<string, unknown> = {
    name,
    mart_name: martName,
    mart_address_base: (body.martAddressBase ?? "").trim() || null,
    mart_address_detail: (body.martAddressDetail ?? "").trim() || null,
    phone,
    updated_at: new Date().toISOString(),
  };
  const np = (body.newPassword ?? "").trim();
  const npc = (body.newPasswordConfirm ?? "").trim();
  if (np || npc) {
    if (np.length < 6) {
      return NextResponse.json({ error: "새 비밀번호는 6자 이상이어야 합니다." }, { status: 400 });
    }
    if (np !== npc) {
      return NextResponse.json({ error: "새 비밀번호와 확인이 일치하지 않습니다." }, { status: 400 });
    }
    updates.hashed_password = hashPassword(np);
  }
  const updated = await supabase.from("app_users").update(updates).eq("id", userId).select("id,username,name,plan_id").limit(1).maybeSingle();
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

