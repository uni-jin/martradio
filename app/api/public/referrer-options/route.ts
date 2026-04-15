import { NextResponse } from "next/server";
import { getReferrerOptionsPublic } from "@/lib/referrerStore.server";

export async function GET() {
  try {
    const options = await getReferrerOptionsPublic();
    return NextResponse.json({ ok: true, options });
  } catch {
    return NextResponse.json({ error: "추천인 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}
