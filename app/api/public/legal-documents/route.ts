import { NextRequest, NextResponse } from "next/server";
import { isLegalDocumentType } from "@/lib/legalDocuments";
import { getLegalDocumentVersions } from "@/lib/legalDocuments.server";

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type");
  if (!isLegalDocumentType(type)) {
    return NextResponse.json({ error: "type 값이 올바르지 않습니다." }, { status: 400 });
  }
  const versionId = (request.nextUrl.searchParams.get("versionId") ?? "").trim();
  const versions = await getLegalDocumentVersions(type);
  const current = versions.find((v) => v.isCurrent) ?? versions[0] ?? null;
  const selected =
    versionId.length > 0
      ? versions.find((v) => v.id === versionId) ?? current
      : current;
  return NextResponse.json({
    type,
    currentVersionId: current?.id ?? null,
    selectedVersion: selected,
    versions: versions.map((v) => ({
      id: v.id,
      version: v.version,
      effectiveDate: v.effectiveDate,
      updatedAt: v.updatedAt,
      changeSummary: v.changeSummary,
      isCurrent: v.isCurrent,
    })),
  });
}
