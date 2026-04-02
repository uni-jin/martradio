import { NextRequest, NextResponse } from "next/server";
import { getGoogleTtsAccessToken } from "@/lib/googleTtsAuth";

const VOICES_URL = "https://texttospeech.googleapis.com/v1/voices";

export type GoogleListedVoice = {
  name: string;
  languageCodes: string[];
  ssmlGender?: string;
  naturalSampleRateHertz?: number;
};

export async function GET(request: NextRequest) {
  const languageCode = request.nextUrl.searchParams.get("languageCode")?.trim() || "ko-KR";

  let accessToken: string;
  try {
    accessToken = await getGoogleTtsAccessToken();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 503 });
  }

  try {
    const res = await fetch(`${VOICES_URL}?languageCode=${encodeURIComponent(languageCode)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const msg = (errData.error?.message as string) || (await res.text()).slice(0, 300);
      return NextResponse.json(
        { error: `Google voices 오류: ${res.status} ${msg}` },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    const data = (await res.json()) as { voices?: GoogleListedVoice[] };
    const voices = (data.voices ?? []).map((v) => ({
      name: v.name,
      languageCodes: v.languageCodes ?? [],
      ssmlGender: v.ssmlGender,
      naturalSampleRateHertz: v.naturalSampleRateHertz,
    }));

    return NextResponse.json({ voices, languageCode });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `voices 요청 실패: ${message}` }, { status: 502 });
  }
}
