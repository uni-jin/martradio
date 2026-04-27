import { NextRequest, NextResponse } from "next/server";
import { isLegalDocumentType } from "@/lib/legalDocuments";
import {
  getLegalDocumentVersions,
  saveNewLegalDocumentVersion,
} from "@/lib/legalDocuments.server";
import { requireSuperAdminApi } from "@/lib/requireAdminApi.server";

export async function GET(request: NextRequest) {
  const admin = await requireSuperAdminApi();
  if (admin instanceof NextResponse) return admin;
  const type = request.nextUrl.searchParams.get("type");
  if (!isLegalDocumentType(type)) {
    return NextResponse.json({ error: "type 값이 올바르지 않습니다." }, { status: 400 });
  }
  const versions = await getLegalDocumentVersions(type);
  return NextResponse.json({ type, versions });
}

export async function PUT(request: NextRequest) {
  const admin = await requireSuperAdminApi();
  if (admin instanceof NextResponse) return admin;

  let body: {
    type?: unknown;
    version?: unknown;
    effectiveDate?: unknown;
    content?: unknown;
    changeSummary?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  if (!isLegalDocumentType(body.type)) {
    return NextResponse.json({ error: "type 값이 올바르지 않습니다." }, { status: 400 });
  }
  const version = typeof body.version === "string" ? body.version.trim() : "";
  const effectiveDate = typeof body.effectiveDate === "string" ? body.effectiveDate.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const changeSummary = typeof body.changeSummary === "string" ? body.changeSummary : "";
  if (!version) {
    return NextResponse.json({ error: "버전을 입력해 주세요." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    return NextResponse.json({ error: "시행일 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ error: "본문을 입력해 주세요." }, { status: 400 });
  }

  const saved = await saveNewLegalDocumentVersion({
    type: body.type,
    version,
    effectiveDate,
    content,
    changeSummary,
  });
  return NextResponse.json({ ok: true, type: body.type, saved });
}
