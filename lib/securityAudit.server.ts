import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const LOG_PATH = join(process.cwd(), ".martradio-data", "security-audit.jsonl");

export function appendSecurityAudit(entry: Record<string, unknown>): void {
  try {
    const dir = dirname(LOG_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({ ...entry, at: new Date().toISOString() }) + "\n";
    appendFileSync(LOG_PATH, line, "utf8");
  } catch {
    // 감사 로그 실패로 API 응답을 막지 않음
  }
}
