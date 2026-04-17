import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/requireAdminApi.server";
import { getAdminPaymentsDb, saveAdminPaymentDb, type AdminPayment } from "@/lib/adminDataSupabase.server";

export async function GET() {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;
  try {
    const payments = await getAdminPaymentsDb();
    return NextResponse.json({ ok: true, payments });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;
  const body = (await req.json().catch(() => ({}))) as { payment?: AdminPayment };
  if (!body.payment || typeof body.payment !== "object") {
    return NextResponse.json({ error: "payment 객체가 필요합니다." }, { status: 400 });
  }
  try {
    await saveAdminPaymentDb(body.payment);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "저장 실패" }, { status: 500 });
  }
}

