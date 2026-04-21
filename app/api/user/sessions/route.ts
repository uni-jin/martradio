import { NextRequest, NextResponse } from "next/server";
import type { BroadcastItem, Session, SessionWithItems } from "@/lib/types";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getValidatedUserSession } from "@/lib/userSession.server";

export const runtime = "nodejs";

function mapSessionRow(row: Record<string, any>): Session {
  return {
    id: row.session_id,
    title: row.title,
    promoRawText: row.promo_raw_text,
    eventType: row.event_type,
    customOpening: row.custom_opening ?? undefined,
    scheduledAt: row.scheduled_at,
    scheduledEndAt: row.scheduled_end_at,
    repeatMinutes: row.repeat_minutes,
    itemSuffixIsnida: row.item_suffix_isnida,
    lastGeneratedAt: row.last_generated_at,
    lastPlayedAt: row.last_played_at,
    latestAudioUrl: row.latest_audio_url,
    generatedText: row.generated_text,
    bgmYoutubeUrl: row.bgm_youtube_url,
    bgmStartSeconds: row.bgm_start_seconds,
    bgmEndSeconds: row.bgm_end_seconds,
    musicMode: row.music_mode,
    bgmVolume: row.bgm_volume,
    ttsProvider: row.tts_provider,
    ttsPresetId: row.tts_preset_id,
    ttsVoiceTemplateId: row.tts_voice_template_id,
    voice: row.voice,
    ttsStyle: row.tts_style,
    ttsStyleDegree: row.tts_style_degree,
    ttsRate: row.tts_rate,
    ttsPitch: row.tts_pitch,
    ttsBreakSeconds: row.tts_break_seconds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapItemRow(row: Record<string, any>): BroadcastItem {
  return {
    id: row.item_id,
    sessionId: row.session_id,
    isSelected: row.is_selected,
    name: row.name,
    unit: row.unit,
    price: Number(row.price),
    originalPrice: row.original_price != null ? Number(row.original_price) : null,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(req: NextRequest) {
  const validated = await getValidatedUserSession();
  if (!validated.ok) {
    return NextResponse.json({ error: validated.message, code: validated.code }, { status: 401 });
  }
  const userId = validated.userId;
  const sessionId = req.nextUrl.searchParams.get("sessionId")?.trim() ?? "";
  const supabase = getSupabaseServerClient();
  let sessionQuery = supabase.from("broadcast_sessions").select("*").eq("owner_user_id", userId);
  if (sessionId) sessionQuery = sessionQuery.eq("session_id", sessionId);
  const sessionsRes = await sessionQuery.order("updated_at", { ascending: false });
  if (sessionsRes.error) return NextResponse.json({ error: sessionsRes.error.message }, { status: 500 });
  const sessionRows = sessionsRes.data ?? [];
  if (sessionRows.length === 0) return NextResponse.json({ ok: true, sessions: [] });
  const ids = sessionRows.map((x) => x.session_id);
  const itemsRes = await supabase
    .from("broadcast_items")
    .select("*")
    .eq("owner_user_id", userId)
    .in("session_id", ids)
    .order("sort_order", { ascending: true });
  if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 500 });
  const grouped = new Map<string, { items: BroadcastItem[]; eventItems: BroadcastItem[] }>();
  for (const row of itemsRes.data ?? []) {
    const key = row.session_id as string;
    if (!grouped.has(key)) grouped.set(key, { items: [], eventItems: [] });
    const mapped = mapItemRow(row);
    if (row.item_type === "event") grouped.get(key)!.eventItems.push(mapped);
    else grouped.get(key)!.items.push(mapped);
  }
  const sessions: SessionWithItems[] = sessionRows.map((row) => {
    const g = grouped.get(row.session_id) ?? { items: [], eventItems: [] };
    return { ...mapSessionRow(row), items: g.items, eventItems: g.eventItems };
  });
  return NextResponse.json({ ok: true, sessions });
}

export async function POST(req: NextRequest) {
  const validated = await getValidatedUserSession();
  if (!validated.ok) {
    return NextResponse.json({ error: validated.message, code: validated.code }, { status: 401 });
  }
  const userId = validated.userId;
  const body = (await req.json().catch(() => ({}))) as { session?: Session; items?: BroadcastItem[]; eventItems?: BroadcastItem[] };
  const session = body.session;
  if (!session?.id) return NextResponse.json({ error: "session이 필요합니다." }, { status: 400 });
  const items = body.items ?? [];
  const eventItems = body.eventItems ?? [];
  const supabase = getSupabaseServerClient();
  const upsertSession = await supabase.from("broadcast_sessions").upsert({
    owner_user_id: userId,
    session_id: session.id,
    title: session.title,
    promo_raw_text: session.promoRawText ?? null,
    event_type: session.eventType,
    custom_opening: session.customOpening ?? null,
    scheduled_at: session.scheduledAt ?? null,
    scheduled_end_at: session.scheduledEndAt ?? null,
    repeat_minutes: session.repeatMinutes,
    item_suffix_isnida: session.itemSuffixIsnida,
    last_generated_at: session.lastGeneratedAt ?? null,
    last_played_at: session.lastPlayedAt ?? null,
    latest_audio_url: session.latestAudioUrl ?? null,
    generated_text: session.generatedText ?? null,
    bgm_youtube_url: session.bgmYoutubeUrl ?? null,
    bgm_start_seconds: session.bgmStartSeconds ?? null,
    bgm_end_seconds: session.bgmEndSeconds ?? null,
    music_mode: session.musicMode ?? null,
    bgm_volume: session.bgmVolume ?? null,
    tts_provider: session.ttsProvider ?? null,
    tts_preset_id: session.ttsPresetId ?? null,
    tts_voice_template_id: session.ttsVoiceTemplateId ?? null,
    voice: session.voice ?? null,
    tts_style: session.ttsStyle ?? null,
    tts_style_degree: session.ttsStyleDegree ?? null,
    tts_rate: session.ttsRate ?? null,
    tts_pitch: session.ttsPitch ?? null,
    tts_break_seconds: session.ttsBreakSeconds ?? null,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
  }, { onConflict: "owner_user_id,session_id" });
  if (upsertSession.error) return NextResponse.json({ error: upsertSession.error.message }, { status: 500 });

  const deleted = await supabase.from("broadcast_items").delete().eq("owner_user_id", userId).eq("session_id", session.id);
  if (deleted.error) return NextResponse.json({ error: deleted.error.message }, { status: 500 });
  const rows = [
    ...items.map((item) => ({ owner_user_id: userId, session_id: session.id, item_id: item.id, item_type: "item", is_selected: item.isSelected, name: item.name, unit: item.unit, price: item.price, original_price: item.originalPrice ?? null, sort_order: item.sortOrder, created_at: item.createdAt, updated_at: item.updatedAt })),
    ...eventItems.map((item) => ({ owner_user_id: userId, session_id: session.id, item_id: item.id, item_type: "event", is_selected: item.isSelected, name: item.name, unit: item.unit, price: item.price, original_price: item.originalPrice ?? null, sort_order: item.sortOrder, created_at: item.createdAt, updated_at: item.updatedAt })),
  ];
  if (rows.length > 0) {
    const inserted = await supabase.from("broadcast_items").insert(rows);
    if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const validated = await getValidatedUserSession();
  if (!validated.ok) {
    return NextResponse.json({ error: validated.message, code: validated.code }, { status: 401 });
  }
  const userId = validated.userId;
  const body = (await req.json().catch(() => ({}))) as { sessionId?: string };
  const sessionId = (body.sessionId ?? "").trim();
  if (!sessionId) return NextResponse.json({ error: "sessionId가 필요합니다." }, { status: 400 });
  const supabase = getSupabaseServerClient();
  const deleted = await supabase.from("broadcast_sessions").delete().eq("owner_user_id", userId).eq("session_id", sessionId);
  if (deleted.error) return NextResponse.json({ error: deleted.error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

