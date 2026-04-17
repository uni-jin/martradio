import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, requireSuperAdminApi } from "@/lib/requireAdminApi.server";
import { getAdminProductsDb, saveAdminProductsDb } from "@/lib/adminDataSupabase.server";

export async function GET() {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;
  try {
    const products = await getAdminProductsDb();
    return NextResponse.json({ ok: true, products });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "조회 실패" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (gate instanceof NextResponse) return gate;
  const body = (await req.json().catch(() => ({}))) as { products?: unknown };
  if (!Array.isArray(body.products)) {
    return NextResponse.json({ error: "products 배열이 필요합니다." }, { status: 400 });
  }
  try {
    await saveAdminProductsDb(body.products as any[]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "저장 실패" }, { status: 500 });
  }
}

