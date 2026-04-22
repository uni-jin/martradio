import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  appendWebhookLog,
  applyPaymentStatusWebhook,
  isWebhookEventProcessed,
} from "@/lib/subscriptionServerStore";

function verifyWebhookSignature(rawBody: string, transmissionTime: string, signatureHeader: string): boolean {
  const secret = process.env.TOSS_WEBHOOK_SECURITY_KEY?.trim();
  if (!secret) return true;
  if (!transmissionTime || !signatureHeader) return false;

  const base = `${rawBody}:${transmissionTime}`;
  const digestB64 = createHmac("sha256", secret).update(base).digest("base64");
  const expected = Buffer.from(digestB64, "base64");

  const candidates = signatureHeader
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.startsWith("v1:") ? part.slice(3) : part))
    .flatMap((b64) => {
      try {
        return [Buffer.from(b64, "base64")];
      } catch {
        return [];
      }
    });

  return candidates.some((cand) => cand.length === expected.length && timingSafeEqual(cand, expected));
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "유효한 JSON 본문이 필요합니다." }, { status: 400 });
  }

  const transmissionTime = request.headers.get("tosspayments-webhook-transmission-time") ?? "";
  const signature = request.headers.get("tosspayments-webhook-signature") ?? "";
  const verified = verifyWebhookSignature(rawBody, transmissionTime, signature);
  if (!verified) {
    return NextResponse.json({ error: "웹훅 서명 검증에 실패했습니다." }, { status: 401 });
  }

  const eventType =
    typeof body.eventType === "string"
      ? body.eventType
      : typeof body.type === "string"
        ? body.type
        : "UNKNOWN";
  const data = (body.data as Record<string, unknown> | undefined) ?? body;
  const orderId = typeof data.orderId === "string" ? data.orderId : undefined;
  const paymentKey = typeof data.paymentKey === "string" ? data.paymentKey : undefined;
  const status = typeof data.status === "string" ? data.status : undefined;
  const approvedAt = typeof data.approvedAt === "string" ? data.approvedAt : undefined;
  const totalAmountRaw = data.totalAmount;
  const chargedAmountKrw =
    typeof totalAmountRaw === "number" && Number.isFinite(totalAmountRaw) && totalAmountRaw >= 0
      ? totalAmountRaw
      : undefined;
  const eventId = typeof body.eventId === "string" ? body.eventId : undefined;
  const duplicate = Boolean(eventId && (await isWebhookEventProcessed(eventId)));
  const shouldProcessPaymentEvent =
    eventType === "PAYMENT_STATUS_CHANGED" ||
    eventType === "PAYMENT_CANCELED" ||
    eventType === "PAYMENT_EXPIRED";
  const nextStatus =
    eventType === "PAYMENT_CANCELED"
      ? "CANCELED"
      : eventType === "PAYMENT_EXPIRED"
        ? "EXPIRED"
        : status;

  if (!duplicate && shouldProcessPaymentEvent) {
    await applyPaymentStatusWebhook({
      eventId,
      orderId,
      paymentKey,
      status: nextStatus,
      approvedAt,
      chargedAmountKrw,
    });
  }

  await appendWebhookLog({
    receivedAt: new Date().toISOString(),
    eventType,
    orderId,
    paymentKey,
    status: nextStatus,
    eventId,
    duplicate,
    processed: !duplicate && shouldProcessPaymentEvent,
    raw: body,
  });

  return NextResponse.json({ ok: true, eventType, status: nextStatus, duplicate });
}

