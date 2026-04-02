import { NextRequest, NextResponse } from "next/server";
import { getGoogleTtsAccessToken } from "@/lib/googleTtsAuth";
import { safeApiErrorMessage } from "@/lib/apiSafeError";
import { buildMarkupWithBreaks } from "@/lib/ttsGoogleRequest";
import { ratePercentStringToSpeakingRate } from "@/lib/ttsOptions";

const TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";

/** Chirp 3 HD 한국어 보이스 (무료 100만 글자/월). 문서: https://cloud.google.com/text-to-speech/docs/chirp3-hd */
const DEFAULT_VOICE = "ko-KR-Chirp3-HD-Charon";

export async function POST(request: NextRequest) {
  let body: {
    text?: string;
    voice?: string;
    languageCode?: string;
    /** 최종 말하기 속도 (0.25~4). 새 클라이언트가 보냄 */
    speakingRate?: number;
    /** 레거시: rate 퍼센트 문자열 — speakingRate 없을 때만 사용 */
    rate?: string;
    breakSeconds?: number;
    pitch?: number;
    volumeGainDb?: number;
    sampleRateHertz?: number | null;
    effectsProfileId?: string[] | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "text 필드가 비어 있습니다." }, { status: 400 });
  }

  const voiceName = typeof body.voice === "string" && body.voice ? body.voice : DEFAULT_VOICE;
  const languageCode =
    typeof body.languageCode === "string" && body.languageCode.trim()
      ? body.languageCode.trim()
      : "ko-KR";

  let speakingRate: number;
  if (typeof body.speakingRate === "number" && Number.isFinite(body.speakingRate)) {
    speakingRate = Math.min(4, Math.max(0.25, body.speakingRate));
  } else {
    speakingRate = ratePercentStringToSpeakingRate(body.rate);
    speakingRate = Math.min(4, Math.max(0.25, speakingRate));
  }

  const pitch =
    typeof body.pitch === "number" && Number.isFinite(body.pitch)
      ? Math.min(20, Math.max(-20, body.pitch))
      : 0;

  const volumeGainDb =
    typeof body.volumeGainDb === "number" && Number.isFinite(body.volumeGainDb)
      ? Math.min(16, Math.max(-96, body.volumeGainDb))
      : 0;

  const breakSeconds = typeof body.breakSeconds === "number" ? body.breakSeconds : 0.5;
  const inputText = buildMarkupWithBreaks(text, breakSeconds);

  const sampleRateHertz =
    typeof body.sampleRateHertz === "number" && Number.isFinite(body.sampleRateHertz) && body.sampleRateHertz > 0
      ? body.sampleRateHertz
      : undefined;

  const effectsProfileId =
    Array.isArray(body.effectsProfileId) && body.effectsProfileId.length > 0
      ? body.effectsProfileId.filter((x): x is string => typeof x === "string" && x.length > 0)
      : undefined;

  let accessToken: string;
  try {
    accessToken = await getGoogleTtsAccessToken();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: safeApiErrorMessage(message, "음성 합성 인증에 실패했습니다.") },
      { status: 503 }
    );
  }

  const audioConfig: Record<string, unknown> = {
    audioEncoding: "MP3" as const,
    speakingRate,
    pitch,
    volumeGainDb,
  };
  if (sampleRateHertz) {
    audioConfig.sampleRateHertz = sampleRateHertz;
  }
  if (effectsProfileId?.length) {
    audioConfig.effectsProfileId = effectsProfileId;
  }

  const payload = {
    input: { markup: inputText },
    voice: { languageCode, name: voiceName },
    audioConfig,
  };

  try {
    const res = await fetch(TTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const msg = (errData.error?.message as string) || (await res.text()).slice(0, 300);
      return NextResponse.json(
        { error: `Google TTS 오류: ${res.status} ${msg}` },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    const data = (await res.json()) as { audioContent?: string };
    const b64 = data.audioContent;
    if (!b64) {
      return NextResponse.json({ error: "Google TTS 응답에 오디오가 없습니다." }, { status: 502 });
    }

    const buf = Buffer.from(b64, "base64");
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(buf.length),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: safeApiErrorMessage(`TTS 요청 실패: ${message}`, "음성 합성 요청에 실패했습니다.") },
      { status: 502 }
    );
  }
}
