import { NextRequest, NextResponse } from "next/server";
import type { BroadcastItem, SessionWithItems } from "@/lib/types";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type UpsertBody = {
  userId?: string;
  session?: SessionWithItems;
};

type DeleteBody = {
  userId?: string;
  sessionId?: string;
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toItemRow(ownerUserId: string, sessionId: string, item: BroadcastItem, itemType: "item" | "event") {
  return {
    owner_user_id: ownerUserId,
    session_id: sessionId,
    item_id: item.id,
    item_type: itemType,
    is_selected: item.isSelected,
    name: item.name,
    unit: item.unit,
    price: item.price,
    original_price: item.originalPrice ?? null,
    sort_order: item.sortOrder,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as UpsertBody;
    const userId = normalizeString(body.userId);
    if (!userId) {
      return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });
    }
    const session = body.session;
    if (!session || typeof session !== "object" || typeof session.id !== "string") {
      return NextResponse.json({ error: "session이 올바르지 않습니다." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const sessionRow = {
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
    };

    const upsertSession = await supabase
      .from("broadcast_sessions")
      .upsert(sessionRow, { onConflict: "owner_user_id,session_id" });
    if (upsertSession.error) {
      return NextResponse.json({ error: upsertSession.error.message }, { status: 500 });
    }

    const deleteItems = await supabase
      .from("broadcast_items")
      .delete()
      .eq("owner_user_id", userId)
      .eq("session_id", session.id);
    if (deleteItems.error) {
      return NextResponse.json({ error: deleteItems.error.message }, { status: 500 });
    }

    const itemRows = [
      ...(session.items ?? []).map((item) => toItemRow(userId, session.id, item, "item")),
      ...(session.eventItems ?? []).map((item) => toItemRow(userId, session.id, item, "event")),
    ];

    if (itemRows.length > 0) {
      const insertItems = await supabase.from("broadcast_items").insert(itemRows);
      if (insertItems.error) {
        return NextResponse.json({ error: insertItems.error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "동기화 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as DeleteBody;
    const userId = normalizeString(body.userId);
    const sessionId = normalizeString(body.sessionId);
    if (!userId || !sessionId) {
      return NextResponse.json({ error: "userId와 sessionId가 필요합니다." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const deletedItems = await supabase
      .from("broadcast_items")
      .delete()
      .eq("owner_user_id", userId)
      .eq("session_id", sessionId);
    if (deletedItems.error) {
      return NextResponse.json({ error: deletedItems.error.message }, { status: 500 });
    }
    const deletedSession = await supabase
      .from("broadcast_sessions")
      .delete()
      .eq("owner_user_id", userId)
      .eq("session_id", sessionId);
    if (deletedSession.error) {
      return NextResponse.json({ error: deletedSession.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "삭제 동기화 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
