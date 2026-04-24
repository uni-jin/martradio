import { NextRequest, NextResponse } from "next/server";
import { getVoiceTemplatesDb } from "@/lib/adminDataSupabase.server";

function parseDataUrl(dataUrl: string): { contentType: string; body: Buffer } | null {
  const trimmed = dataUrl.trim();
  if (!trimmed.toLowerCase().startsWith("data:")) return null;
  const comma = trimmed.indexOf(",");
  if (comma < 0) return null;
  const header = trimmed.slice(5, comma);
  if (!/;base64/i.test(header)) return null;
  const contentType =
    header
      .replace(/;base64.*/i, "")
      .trim()
      .split(";")[0]!
      .trim() || "application/octet-stream";
  const b64 = trimmed.slice(comma + 1).replace(/\s/g, "");
  if (!b64) return null;
  try {
    return { contentType, body: Buffer.from(b64, "base64") };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const voiceId = req.nextUrl.searchParams.get("voiceId")?.trim() ?? "";
  if (!voiceId) {
    return NextResponse.json({ error: "voiceId가 필요합니다." }, { status: 400 });
  }

  let previewRaw: string;
  try {
    const all = await getVoiceTemplatesDb();
    const voice = all.find((v) => v.id === voiceId);
    if (!voice) {
      return NextResponse.json({ error: "음성을 찾을 수 없습니다." }, { status: 404 });
    }
    const raw = voice.previewAudioDataUrl?.trim();
    if (!raw) {
      return NextResponse.json({ error: "미리듣기가 없습니다." }, { status: 404 });
    }
    previewRaw = raw;
  } catch (e) {
    const message = e instanceof Error ? e.message : "조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (previewRaw.toLowerCase().startsWith("data:")) {
    const parsed = parseDataUrl(previewRaw);
    if (!parsed || parsed.body.length === 0) {
      return NextResponse.json({ error: "미리듣기 데이터 형식이 올바르지 않습니다." }, { status: 502 });
    }
    return new NextResponse(new Uint8Array(parsed.body), {
      status: 200,
      headers: {
        "Content-Type": parsed.contentType,
        "Content-Length": String(parsed.body.length),
        "Cache-Control": "public, max-age=60",
      },
    });
  }

  if (!/^https?:\/\//i.test(previewRaw)) {
    return NextResponse.json({ error: "미리듣기 주소를 해석할 수 없습니다." }, { status: 400 });
  }

  try {
    const res = await fetch(previewRaw, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `미리듣기 파일을 가져오지 못했습니다. (${res.status})` },
        { status: 502 }
      );
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) {
      return NextResponse.json({ error: "미리듣기 파일이 비어 있습니다." }, { status: 502 });
    }
    const ct = res.headers.get("content-type") || "audio/mpeg";
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": ct,
        "Content-Length": String(buf.length),
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `미리듣기 파일을 불러오지 못했습니다. ${message}` }, { status: 502 });
  }
}
