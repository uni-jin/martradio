import { NextRequest, NextResponse } from "next/server";

const DEFAULT_VOICE = "ko-KR-InJoonNeural";
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

function escapeSsml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface TtsOptions {
  voice?: string;
  style?: string;
  styleDegree?: number;
  rate?: string;
  pitch?: string;
  breakSeconds?: number;
}

/** 옵션에 따라 SSML 생성 (voice, mstts:express-as, prosody, break) */
function buildSsml(plainText: string, options: TtsOptions = {}): string {
  const voice = options.voice || DEFAULT_VOICE;
  const style = options.style && options.style !== "default" ? options.style : "";
  const styleDegree = options.styleDegree ?? 1.2;
  const rate = options.rate ?? "0%";
  const pitch = options.pitch ?? "0%";
  const breakSec = options.breakSeconds ?? 1.2;
  const breakTime = breakSec <= 0 ? "500ms" : `${breakSec}s`;

  const lines = plainText
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";

  const parts = lines.map((line) => escapeSsml(line));
  const withBreaks = parts
    .map((p, i) => (i < parts.length - 1 ? `${p}<break time="${breakTime}"/>` : p))
    .join(" ");

  const rateAttr = rate ? ` rate="${rate}"` : "";
  const pitchAttr = pitch ? ` pitch="${pitch}"` : "";
  const prosodyInner = rateAttr || pitchAttr
    ? `<prosody${rateAttr}${pitchAttr}>${withBreaks}</prosody>`
    : withBreaks;

  const voiceInner = style
    ? `<mstts:express-as style="${escapeSsml(style)}" styledegree="${styleDegree}">${prosodyInner}</mstts:express-as>`
    : prosodyInner;

  return `<?xml version="1.0" encoding="UTF-8"?>
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="ko-KR">
  <voice name="${voice}">${voiceInner}</voice>
</speak>`;
}

export async function POST(request: NextRequest) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION?.toLowerCase().replace(/\s/g, "") || "koreacentral";

  if (!key) {
    return NextResponse.json(
      { error: "TTS가 설정되지 않았습니다. AZURE_SPEECH_KEY를 .env.local에 설정해 주세요." },
      { status: 503 }
    );
  }

  let body: {
    text?: string;
    voice?: string;
    style?: string;
    styleDegree?: number;
    rate?: string;
    pitch?: string;
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

  const options: TtsOptions = {
    voice: typeof body.voice === "string" ? body.voice : undefined,
    style: typeof body.style === "string" ? body.style : undefined,
    styleDegree: typeof body.styleDegree === "number" ? body.styleDegree : undefined,
    rate: typeof body.rate === "string" ? body.rate : undefined,
    pitch: typeof body.pitch === "string" ? body.pitch : undefined,
    breakSeconds: typeof body.breakSeconds === "number" ? body.breakSeconds : undefined,
  };

  const ssml = buildSsml(text, options);
  const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
        "User-Agent": "MartRadio-TTS",
      },
      body: ssml,
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Azure TTS 오류: ${res.status} ${errText.slice(0, 200)}` },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    const audioBuffer = await res.arrayBuffer();
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBuffer.byteLength),
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
