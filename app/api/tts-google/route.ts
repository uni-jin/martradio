import { NextRequest, NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";

const TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";

/** Chirp 3 HD 한국어 보이스 (무료 100만 글자/월). 문서: https://cloud.google.com/text-to-speech/docs/chirp3-hd */
const DEFAULT_VOICE = "ko-KR-Chirp3-HD-Charon";

/** rate 퍼센트(예: +10%) → Google speakingRate (0.25~4.0) */
function ratePercentToSpeakingRate(rate: string | undefined): number {
  if (!rate) return 1;
  const n = parseInt(rate.replace(/%|\+/g, ""), 10);
  if (Number.isNaN(n)) return 1;
  return 1 + n / 100;
}

/** 줄 단위 텍스트에 쉼 적용: 줄 사이에 [pause short] 삽입 (Chirp 3 HD markup) */
function buildMarkupWithBreaks(text: string, breakSeconds: number): string {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  if (lines.length === 1) return lines[0];
  const tag = breakSeconds > 1 ? "[pause long]" : "[pause short]";
  return lines.join(` ${tag} `);
}

async function getAccessToken(): Promise<string> {
  const jsonPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const jsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (jsonStr) {
    try {
      const key = JSON.parse(jsonStr) as Record<string, unknown>;
      const auth = new GoogleAuth({
        credentials: key,
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      });
      const client = await auth.getClient();
      const token = await client.getAccessToken();
      if (token.token) return token.token;
    } catch (e) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON 파싱 실패: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  if (jsonPath) {
    const auth = new GoogleAuth({
      keyFile: jsonPath,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    if (token.token) return token.token;
  }

  throw new Error("Google TTS 인증 정보가 없습니다. GOOGLE_APPLICATION_CREDENTIALS 또는 GOOGLE_SERVICE_ACCOUNT_JSON을 .env.local에 설정하세요.");
}

export async function POST(request: NextRequest) {
  let body: {
    text?: string;
    voice?: string;
    rate?: string;
    breakSeconds?: number;
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
  const speakingRate = ratePercentToSpeakingRate(body.rate);
  const breakSeconds = typeof body.breakSeconds === "number" ? body.breakSeconds : 0.5;
  const inputText = buildMarkupWithBreaks(text, breakSeconds);

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const payload = {
    input: { markup: inputText },
    voice: { languageCode: "ko-KR", name: voiceName },
    audioConfig: {
      audioEncoding: "MP3" as const,
      speakingRate,
    },
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
      { error: `TTS 요청 실패: ${message}` },
      { status: 502 }
    );
  }
}
