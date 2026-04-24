import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/requireAdminApi.server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

const PREVIEW_BUCKET = "voice-previews";

function decodeAudioBase64(raw: string): Buffer {
  const trimmed = raw.trim();
  const base64 = trimmed.includes(",") ? trimmed.split(",").pop() ?? "" : trimmed;
  return Buffer.from(base64, "base64");
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (gate instanceof NextResponse) return gate;

  const body = (await req.json().catch(() => ({}))) as {
    voiceId?: unknown;
    audioBase64?: unknown;
  };
  const voiceId = typeof body.voiceId === "string" ? body.voiceId.trim() : "";
  const audioBase64 = typeof body.audioBase64 === "string" ? body.audioBase64.trim() : "";
  if (!voiceId || !audioBase64) {
    return NextResponse.json({ error: "voiceId와 audioBase64가 필요합니다." }, { status: 400 });
  }

  try {
    const bytes = decodeAudioBase64(audioBase64);
    if (bytes.length === 0) {
      return NextResponse.json({ error: "오디오 데이터가 비어 있습니다." }, { status: 400 });
    }
    const supabase = getSupabaseServerClient();
    await supabase.storage.createBucket(PREVIEW_BUCKET, {
      public: true,
      fileSizeLimit: "5MB",
      allowedMimeTypes: ["audio/mpeg"],
    });
    const objectPath = `voice/${voiceId}.mp3`;
    const uploaded = await supabase.storage.from(PREVIEW_BUCKET).upload(objectPath, bytes, {
      contentType: "audio/mpeg",
      upsert: true,
      cacheControl: "31536000",
    });
    if (uploaded.error) throw new Error(uploaded.error.message);
    const publicUrl = supabase.storage.from(PREVIEW_BUCKET).getPublicUrl(objectPath).data.publicUrl;
    return NextResponse.json({ ok: true, url: publicUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "미리듣기 파일 저장에 실패했습니다." },
      { status: 500 }
    );
  }
}

