/** 공개 API userId 등 — 경로·제어 문자 제외, 길이 제한 */

const USER_ID_MAX = 256;

export function isValidPublicUserId(raw: string | null | undefined): raw is string {
  if (typeof raw !== "string") return false;
  const s = raw.trim();
  if (!s || s.length > USER_ID_MAX) return false;
  if (/[\u0000-\u001f\u007f<>\\]/.test(s)) return false;
  return true;
}
