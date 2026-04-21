import { NextRequest, NextResponse } from "next/server";
import { getVoiceTemplatesDb } from "@/lib/adminDataSupabase.server";

export async function GET(req: NextRequest) {
  const planId = req.nextUrl.searchParams.get("planId")?.trim() || "free";
  const isPaidPlan = planId === "small" || planId === "medium" || planId === "large";
  try {
    const all = await getVoiceTemplatesDb();
    const voices = all
      .filter((v) => v.enabled)
      .filter((v) => (v.paidOnly ? isPaidPlan : true))
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label, "ko"));
    return NextResponse.json({ ok: true, voices });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "조회 실패" }, { status: 500 });
  }
}
