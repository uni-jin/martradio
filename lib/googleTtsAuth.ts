import { GoogleAuth } from "google-auth-library";

/** Cloud Text-to-speech API용 액세스 토큰 */
export async function getGoogleTtsAccessToken(): Promise<string> {
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
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON 파싱 실패: " + (e instanceof Error ? e.message : String(e))
      );
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

  throw new Error(
    "Google TTS 인증 정보가 없습니다. GOOGLE_APPLICATION_CREDENTIALS 또는 GOOGLE_SERVICE_ACCOUNT_JSON을 .env.local에 설정하세요."
  );
}
