import { NextResponse } from "next/server";
import { getAdminProductsDb } from "@/lib/adminDataSupabase.server";

export async function GET() {
  try {
    const products = await getAdminProductsDb();
    return NextResponse.json({ ok: true, products });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "조회 실패" }, { status: 500 });
  }
}
