import { NextRequest, NextResponse } from "next/server";
import { safeApiErrorBody } from "@/lib/apiSafeError";
import {
  DEFAULT_PROMO_SCRIPT_TEMPLATE,
  applyPromoScriptTemplate,
  validatePromoScriptTemplate,
} from "@/lib/promoScriptPrompt";
import { getPromoScriptTemplateForEdit } from "@/lib/promoScriptPromptStore.server";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

async function buildPrompt(rawText: string): Promise<string> {
  const { template } = await getPromoScriptTemplateForEdit();
  const err = validatePromoScriptTemplate(template);
  const effective = err ? DEFAULT_PROMO_SCRIPT_TEMPLATE : template;
  return applyPromoScriptTemplate(effective, rawText);
}

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; code?: number };
};

function scriptFromGeminiResponse(data: GeminiGenerateContentResponse): string {
  const block = data.promptFeedback?.blockReason;
  if (block) {
    throw new Error(`프롬프트가 차단되었습니다: ${block}`);
  }
  const parts = data.candidates?.[0]?.content?.parts;
  if (!parts?.length) {
    throw new Error("Gemini 응답에 후보 텍스트가 없습니다.");
  }
  return parts
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("")
    .trim();
}

export async function POST(request: NextRequest) {
  let body: { rawText?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const rawText = typeof body.rawText === "string" ? body.rawText.trim() : "";
  if (!rawText) {
    return NextResponse.json({ error: "원문 문자(rawText)를 입력해 주세요." }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY가 설정되지 않았습니다. .env.local에 추가해 주세요." },
      { status: 503 }
    );
  }

  const model = (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;

  try {
    const prompt = await buildPrompt(rawText);
    const url = new URL(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
    );
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 500,
        },
      }),
    });

    const data = (await res.json().catch(() => ({}))) as GeminiGenerateContentResponse;

    if (!res.ok) {
      const msg =
        (typeof data.error?.message === "string" && data.error.message) ||
        `HTTP ${res.status}`;
      return NextResponse.json(
        safeApiErrorBody(`Gemini 방송문 생성 실패: ${msg}`, "방송문 생성에 실패했습니다."),
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    const script = scriptFromGeminiResponse(data);
    if (!script) {
      return NextResponse.json({ error: "방송문 생성 결과가 비어 있습니다." }, { status: 502 });
    }

    return NextResponse.json({ script });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      safeApiErrorBody(`방송문 생성 요청 실패: ${message}`, "방송문 생성에 실패했습니다."),
      { status: 502 }
    );
  }
}
