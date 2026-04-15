import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { safeApiErrorBody } from "@/lib/apiSafeError";
import {
  DEFAULT_PROMO_SCRIPT_TEMPLATE,
  applyPromoScriptTemplate,
  validatePromoScriptTemplate,
} from "@/lib/promoScriptPrompt";
import { getPromoScriptTemplateForEdit } from "@/lib/promoScriptPromptStore.server";

function buildPrompt(rawText: string): string {
  const { template } = getPromoScriptTemplateForEdit();
  const err = validatePromoScriptTemplate(template);
  const effective = err ? DEFAULT_PROMO_SCRIPT_TEMPLATE : template;
  return applyPromoScriptTemplate(effective, rawText);
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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY가 설정되지 않았습니다. .env.local에 추가해 주세요." },
      { status: 503 }
    );
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const client = new OpenAI({ apiKey });

  try {
    const prompt = buildPrompt(rawText);
    const response = await client.responses.create({
      model,
      input: prompt,
      max_output_tokens: 500,
    });

    const script = (response.output_text || "").trim();
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
