import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { ensureMartradioDataDir } from "@/lib/martradioDataDir.server";

export function appendSecurityAudit(entry: Record<string, unknown>): void {
  try {
    const logPath = join(ensureMartradioDataDir(), "security-audit.jsonl");
    const line = JSON.stringify({ ...entry, at: new Date().toISOString() }) + "\n";
    appendFileSync(logPath, line, "utf8");
  } catch {
    // 감사 로그 실패로 API 응답을 막지 않음
  }
}
