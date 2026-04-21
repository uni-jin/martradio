import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function appendSecurityAudit(entry: Record<string, unknown>): Promise<void> {
  try {
    const supabase = getSupabaseServerClient();
    const at = new Date().toISOString();
    await supabase.from("security_audit_events").insert({ payload: { ...entry, at } });
  } catch {
    // 감사 로그 실패로 API 응답을 막지 않음
  }
}
