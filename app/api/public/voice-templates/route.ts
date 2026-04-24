import { NextRequest, NextResponse } from "next/server";
import { getVoiceTemplatesDb } from "@/lib/adminDataSupabase.server";

export async function GET(req: NextRequest) {
  const planId = req.nextUrl.searchParams.get("planId")?.trim() || "free";
  const isPaidPlan = planId === "small" || planId === "medium" || planId === "large";
  const includePaidPreview = req.nextUrl.searchParams.get("includePaidPreview") === "1";
  try {
    const all = await getVoiceTemplatesDb();
    const voices = all
      .filter((v) => v.enabled)
      .filter((v) => (v.paidOnly ? isPaidPlan || includePaidPreview : true))
      .slice()
      .sort((a, b) => {
        const aOrder =
          typeof a.sortOrder === "number" && Number.isFinite(a.sortOrder)
            ? Math.max(0, Math.floor(a.sortOrder))
            : Number.MAX_SAFE_INTEGER;
        const bOrder =
          typeof b.sortOrder === "number" && Number.isFinite(b.sortOrder)
            ? Math.max(0, Math.floor(b.sortOrder))
            : Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.label.localeCompare(b.label, "ko");
      });
    return NextResponse.json({ ok: true, voices });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "조회 실패" }, { status: 500 });
  }
}
