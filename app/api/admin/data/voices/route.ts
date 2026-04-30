import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, requireVoiceTemplateWriteApi } from "@/lib/requireAdminApi.server";
import { getVoiceTemplatesDb, saveVoiceTemplatesDb } from "@/lib/adminDataSupabase.server";

export async function GET() {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;
  try {
    const voices = await getVoiceTemplatesDb();
    return NextResponse.json({ ok: true, voices });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "조회 실패" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireVoiceTemplateWriteApi();
  if (gate instanceof NextResponse) return gate;
  const body = (await req.json().catch(() => ({}))) as { voices?: unknown };
  if (!Array.isArray(body.voices)) {
    return NextResponse.json({ error: "voices 배열이 필요합니다." }, { status: 400 });
  }
  try {
    await saveVoiceTemplatesDb(body.voices as any[]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "저장 실패" }, { status: 500 });
  }
}

