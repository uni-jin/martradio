import { NextRequest, NextResponse } from "next/server";
import { getWebhookLogs } from "@/lib/subscriptionServerStore";

export async function GET(request: NextRequest) {
  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Math.max(1, Math.min(200, Number(limitRaw) || 50)) : 50;
  const eventType = request.nextUrl.searchParams.get("eventType")?.trim() ?? "";
  const status = request.nextUrl.searchParams.get("status")?.trim() ?? "";
  const from = request.nextUrl.searchParams.get("from")?.trim() ?? "";
  const to = request.nextUrl.searchParams.get("to")?.trim() ?? "";
  const fromMs = from ? new Date(from).getTime() : NaN;
  const toMs = to ? new Date(to).getTime() : NaN;

  const logs = getWebhookLogs()
    .filter((log) => {
      if (eventType && log.eventType !== eventType) return false;
      if (status && (log.status ?? "") !== status) return false;
      const t = new Date(log.receivedAt).getTime();
      if (!Number.isNaN(fromMs) && (Number.isNaN(t) || t < fromMs)) return false;
      if (!Number.isNaN(toMs) && (Number.isNaN(t) || t > toMs)) return false;
      return true;
    })
    .slice(0, limit);
  return NextResponse.json({ ok: true, count: logs.length, logs });
}

