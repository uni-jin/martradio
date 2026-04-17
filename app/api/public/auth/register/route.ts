import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { setSessionCookie } from "@/lib/userSession.server";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      username?: string;
      password?: string;
      name?: string;
      martName?: string;
      martAddressBase?: string;
      martAddressDetail?: string;
      phone?: string;
      referrerId?: string;
    };
    const username = (body.username ?? "").trim();
    const password = body.password ?? "";
    const name = (body.name ?? "").trim();
    const martName = (body.martName ?? "").trim();
    const phone = (body.phone ?? "").trim();
    if (!username || !password || !name || !martName || !phone) {
      return NextResponse.json({ error: "필수 항목을 모두 입력해 주세요." }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "비밀번호는 6자 이상이어야 합니다." }, { status: 400 });
    }
    const supabase = getSupabaseServerClient();
    const exists = await supabase
      .from("app_users")
      .select("id")
      .eq("username", username)
      .limit(1)
      .maybeSingle();
    if (exists.error) return NextResponse.json({ error: exists.error.message }, { status: 500 });
    if (exists.data) {
      return NextResponse.json({ error: "이미 가입된 아이디입니다." }, { status: 409 });
    }

    const id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const hashedPassword = hashPassword(password);
    const inserted = await supabase.from("app_users").insert({
      id,
      username,
      hashed_password: hashedPassword,
      name,
      mart_name: martName,
      mart_address_base: (body.martAddressBase ?? "").trim() || null,
      mart_address_detail: (body.martAddressDetail ?? "").trim() || null,
      phone,
      referrer_id: (body.referrerId ?? "").trim() || null,
      plan_id: "free",
      created_at: now,
      updated_at: now,
    });
    if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 500 });

    await setSessionCookie(id);
    return NextResponse.json({
      ok: true,
      user: { id, email: username, name, isUnlimited: false, planId: "free" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "회원가입에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

