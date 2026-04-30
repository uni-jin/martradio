import { NextRequest, NextResponse } from "next/server";
import { requireAdminPathAccessApi, requireSuperAdminApi } from "@/lib/requireAdminApi.server";
import { ADMIN_PROMPTS_HREF } from "@/lib/adminMenuCatalog";
import { validatePromoScriptTemplate } from "@/lib/promoScriptPrompt";
import { getPromoScriptTemplateForEdit, writePromoScriptPromptPersisted } from "@/lib/promoScriptPromptStore.server";

export async function GET() {
  const admin = await requireAdminPathAccessApi(ADMIN_PROMPTS_HREF);
  if (admin instanceof NextResponse) return admin;

  const { template, updatedAt, source } = await getPromoScriptTemplateForEdit();
  return NextResponse.json({ template, updatedAt, source });
}

export async function PUT(request: NextRequest) {
  const admin = await requireSuperAdminApi();
  if (admin instanceof NextResponse) return admin;

  let body: { template?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const template = typeof body.template === "string" ? body.template : "";
  const err = validatePromoScriptTemplate(template);
  if (err) {
    return NextResponse.json({ error: err }, { status: 400 });
  }

  const saved = await writePromoScriptPromptPersisted(template);
  return NextResponse.json({
    ok: true,
    template: saved.template,
    updatedAt: saved.updatedAt,
    source: "db" as const,
  });
}
