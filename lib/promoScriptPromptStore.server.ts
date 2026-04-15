import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_PROMO_SCRIPT_TEMPLATE } from "@/lib/promoScriptPrompt";
import { ensureMartradioDataDir } from "@/lib/martradioDataDir.server";

function promoScriptPromptStorePath(): string {
  return join(ensureMartradioDataDir(), "promo-script-prompt.json");
}

type Persisted = {
  template: string;
  updatedAt: string;
};

export function readPromoScriptPromptPersisted(): Persisted | null {
  try {
    const STORE_PATH = promoScriptPromptStorePath();
    if (!existsSync(STORE_PATH)) return null;
    const raw = readFileSync(STORE_PATH, "utf8");
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (typeof parsed.template !== "string" || !parsed.template.trim()) return null;
    return {
      template: parsed.template.trim(),
      updatedAt: typeof parsed.updatedAt === "string" && parsed.updatedAt ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function writePromoScriptPromptPersisted(template: string): Persisted {
  const STORE_PATH = promoScriptPromptStorePath();
  const updatedAt = new Date().toISOString();
  const state: Persisted = { template: template.trim(), updatedAt };
  writeFileSync(STORE_PATH, JSON.stringify(state, null, 2), "utf8");
  return state;
}

/** API·관리자 화면용: 저장 없으면 코드 기본값 */
export function getPromoScriptTemplateForEdit(): { template: string; updatedAt: string | null; source: "file" | "default" } {
  const persisted = readPromoScriptPromptPersisted();
  if (persisted) {
    return { template: persisted.template, updatedAt: persisted.updatedAt, source: "file" };
  }
  return {
    template: DEFAULT_PROMO_SCRIPT_TEMPLATE,
    updatedAt: null,
    source: "default",
  };
}
