import { getPromoScriptPromptForEditDb, savePromoScriptPromptDb } from "@/lib/adminDataSupabase.server";

export async function getPromoScriptTemplateForEdit(): Promise<{
  template: string;
  updatedAt: string | null;
  source: "db" | "default";
}> {
  return getPromoScriptPromptForEditDb();
}

export async function writePromoScriptPromptPersisted(template: string): Promise<{ template: string; updatedAt: string }> {
  return savePromoScriptPromptDb(template);
}
