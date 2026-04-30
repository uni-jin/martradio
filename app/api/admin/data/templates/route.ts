import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, requireVoiceTemplateWriteApi } from "@/lib/requireAdminApi.server";
import { getAdminTemplatesDb, saveAdminTemplatesDb } from "@/lib/adminDataSupabase.server";

export async function GET() {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;
  try {
    const templates = await getAdminTemplatesDb();
    return NextResponse.json({ ok: true, templates });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "조회 실패" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireVoiceTemplateWriteApi();
  if (gate instanceof NextResponse) return gate;
  const body = (await req.json().catch(() => ({}))) as { templates?: unknown };
  if (!Array.isArray(body.templates)) {
    return NextResponse.json({ error: "templates 배열이 필요합니다." }, { status: 400 });
  }
  try {
    await saveAdminTemplatesDb(body.templates as any[]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "저장 실패" }, { status: 500 });
  }
}

