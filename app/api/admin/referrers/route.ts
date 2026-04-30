import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, requireSuperAdminApi } from "@/lib/requireAdminApi.server";
import {
  createReferrerRecord,
  readReferrerStore,
  toPublicReferrer,
  importLegacyLocalReferrersIfEmpty,
} from "@/lib/referrerStore.server";

export async function GET() {
  const admin = await requireAdminApi();
  if (admin instanceof NextResponse) return admin;

  if (admin.role === "super" || admin.role === "admin") {
    const { referrers } = await readReferrerStore();
    return NextResponse.json({ ok: true, referrers: referrers.map(toPublicReferrer) });
  }

  // 추천인 관리 페이지 권한 여부와 무관하게, 추천인 관리자 본인 데이터 1건은 항상 반환합니다.
  if (!admin.referrerId) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  const { referrers } = await readReferrerStore();
  const self = referrers.find((r) => r.id === admin.referrerId);
  if (!self) {
    return NextResponse.json({ error: "추천인 정보를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, referrers: [toPublicReferrer(self)] });
}

export async function POST(request: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (gate instanceof NextResponse) return gate;

  let body: {
    loginId?: unknown;
    name?: unknown;
    personName?: unknown;
    phone?: unknown;
    email?: unknown;
    isActive?: unknown;
    importLocalRows?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  if (Array.isArray(body.importLocalRows)) {
    const rows = body.importLocalRows.filter(
      (x): x is Record<string, unknown> => x != null && typeof x === "object"
    );
    await importLegacyLocalReferrersIfEmpty(
      rows.map((r) => ({
        id: String(r.id ?? ""),
        name: String(r.name ?? ""),
        personName: typeof r.personName === "string" ? r.personName : undefined,
        phone: typeof r.phone === "string" ? r.phone : undefined,
        email: typeof r.email === "string" ? r.email : undefined,
        isActive: r.isActive !== false,
        createdAt: typeof r.createdAt === "string" ? r.createdAt : undefined,
        updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : undefined,
      }))
    );
    const { referrers } = await readReferrerStore();
    return NextResponse.json({ ok: true, referrers: referrers.map(toPublicReferrer) });
  }

  const loginId = typeof body.loginId === "string" ? body.loginId : "";
  const name = typeof body.name === "string" ? body.name : "";
  if (!name.trim()) {
    return NextResponse.json({ error: "추천인(코드명)을 입력하세요." }, { status: 400 });
  }
  const created = await createReferrerRecord({
    loginId,
    name,
    personName: typeof body.personName === "string" ? body.personName : "",
    phone: typeof body.phone === "string" ? body.phone : "",
    email: typeof body.email === "string" ? body.email : "",
    isActive: body.isActive !== false,
  });
  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, referrer: toPublicReferrer(created.row) });
}
