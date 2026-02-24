# Google Cloud Text-to-Speech 연동 가이드

Azure TTS는 그대로 두고, **라디오 프리셋(Google)** 영역을 추가하려면 아래 순서대로 진행하면 됩니다.

---

## 0. Vertex AI / Gemini와 TTS 구분 (최신 정리)

### 사용하신 curl이 하는 일

아래 예시는 **텍스트 생성(LLM)** API이며, **음성 합성(TTS)이 아닙니다.**

```bash
curl "https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash-lite:streamGenerateContent?key=${API_KEY}" \
  -X POST -H "Content-Type: application/json" \
  -d '{"contents":[{"role":"user","parts":[{"text":"Explain how AI works in a few words"}]}]}'
```

- **엔드포인트**: `streamGenerateContent` → Gemini **텍스트/채팅** 생성
- **API 키**: Vertex AI Express 모드에서 발급한 키로 위처럼 `?key=${API_KEY}` 사용 가능
- **역할**: 문장 생성만 하고, **오디오(음성)를 만들지는 않음**

### 음성 합성(TTS)은 별도

| 구분 | 텍스트 생성 (사용하신 curl) | 음성 합성 (TTS) |
|------|-----------------------------|------------------|
| 용도 | 질문 → 답변 텍스트 | 텍스트 → 음성(MP3 등) |
| Vertex AI 예시 | `generateContent` / `streamGenerateContent` | **Gemini-TTS** 전용 API 사용 |
| 모델 예시 | `gemini-2.5-flash-lite` | `gemini-2.5-flash-tts`, `gemini-2.5-pro-tts` 등 |

### Google TTS 구조 (2024~2025 기준)

1. **기존 Cloud Text-to-Speech**  
   - 엔드포인트: `https://texttospeech.googleapis.com/v1/text:synthesize`  
   - **Gemini-TTS** 모델 사용 가능: `gemini-2.5-flash-tts`, `gemini-2.5-flash-lite-preview-tts`, `gemini-2.5-pro-tts`  
   - 공식 문서 기준 인증: **OAuth 2.0(서비스 계정)**  
     - `Authorization: Bearer $(gcloud auth application-default print-access-token)`  
     - **API 키**로 이 엔드포인트를 쓰는 방식은 공식 문서에 없음.

2. **Vertex AI / AI Studio**  
   - **Vertex AI**는 **API 키**로 `generateContent` 호출 가능 (Express 모드).  
   - **TTS**는 “Generate Content 응답을 오디오로” 받는 방식이 문서에 있음  
     (예: `responseModalities: ["AUDIO"]`, `speechConfig` 등).  
   - 즉, **같은 API 키**로 **generateContent**를 **오디오 모드**로 호출하면 TTS처럼 쓸 수 있는 경로가 있음.  
   - 정확한 REST 스펙은 [Vertex AI Generate Content](https://cloud.google.com/vertex-ai/generative-ai/docs/reference/rest) 또는 [Gemini API Speech](https://ai.google.dev/gemini-api/docs/speech-generation) 참고.

### 발급받은 API 키로 할 수 있는 것

- **지금 사용 중인 curl처럼**  
  - `https://aiplatform.googleapis.com/v1/.../generateContent?key=...`  
  - → **텍스트 생성**은 그대로 사용 가능.
- **TTS(음성)** 를 쓰려면 둘 중 하나:
  - **방법 A (API 키 활용)**  
    Vertex AI / Gemini의 **generateContent**에서 **오디오 출력** 옵션을 켠 뒤,  
    같은 API 키로 `generateContent` 호출 (모델은 TTS용 모델로 지정).  
    → 문서: [Convert text to speech (Vertex AI)](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/speech/text-to-speech), [Gemini API speech-generation](https://ai.google.dev/gemini-api/docs/speech-generation).
  - **방법 B (서비스 계정)**  
    **Cloud Text-to-Speech API** (`texttospeech.googleapis.com/v1/text:synthesize`)  
    → **서비스 계정 JSON**으로 Access Token 발급 후 `Authorization: Bearer <token>` 으로 호출.  
    → 아래 1~5절은 이 방식 기준으로 작성됨.

**요약**:  
- 사용하신 curl = **텍스트 생성 전용**, TTS 아님.  
- **TTS** = Vertex/Gemini **오디오 출력 generateContent** (API 키 가능) **또는** Cloud TTS `text:synthesize` (서비스 계정).  
- 이미 발급한 **API 키**는 **오디오 출력 가능한 generateContent**가 지원되는 리전/모델이면 TTS 용도로 활용 가능; 그렇지 않으면 **서비스 계정**으로 Cloud TTS를 쓰면 됨.

---

## 1. 어디서 무엇을 하나요? (Cloud TTS · 서비스 계정 방식)

| 단계 | 어디서 | 무엇을 |
|------|--------|--------|
| 1 | [Google Cloud Console](https://console.cloud.google.com/) | 프로젝트 생성 또는 기존 프로젝트 선택 |
| 2 | 결제(빌링) | 프로젝트에 **결제 계정 연결** (무료 할당량 있지만 결제 활성화 필요) |
| 3 | **API 및 서비스** → **라이브러리** | **Cloud Text-to-Speech API** 검색 후 **사용 설정** |
| 4 | **API 및 서비스** → **사용자 인증 정보** | **서비스 계정** 생성 후 **키(JSON)** 다운로드 |

---

## 2. 키/인증 정보 정리

- **Google TTS는 “API 키” 한 개만 쓰는 방식이 아닙니다.**  
  REST API는 **OAuth 2.0(서비스 계정)** 으로만 인증합니다.

- 따라서 다음이 필요합니다.

| 항목 | 설명 |
|------|------|
| **서비스 계정 키(JSON)** | 콘솔에서 서비스 계정 → 키 추가 → JSON 선택 후 다운로드한 파일 |
| **프로젝트 ID** | 콘솔 상단/프로젝트 선택기에 나오는 프로젝트 ID (예: `my-mart-radio`) |

---

## 3. 구체적으로 할 일

### 3-1. 프로젝트 & 결제

1. [Google Cloud Console](https://console.cloud.google.com/) 로그인.
2. 상단 프로젝트 선택에서 **새 프로젝트** 만들거나 기존 프로젝트 선택.
3. **결제** 메뉴에서 해당 프로젝트에 결제 계정 연결 (무료 크레딧/할당량만 써도 결제 활성화는 필요).

### 3-2. Text-to-Speech API 사용 설정

1. 왼쪽 메뉴 **API 및 서비스** → **라이브러리**.
2. 검색창에 **Cloud Text-to-Speech API** 입력.
3. 선택 후 **사용** 클릭.

### 3-3. 서비스 계정 & 키 발급

1. **API 및 서비스** → **사용자 인증 정보**.
2. **+ 사용자 인증 정보 만들기** → **서비스 계정**.
3. 서비스 계정 이름 예: `mart-radio-tts`, 역할은 **기본** 또는 **Cloud Text-to-Speech API 사용자** 등 필요한 최소 권한.
4. 생성 후 목록에서 해당 서비스 계정 클릭 → **키** 탭 → **키 추가** → **새 키 만들기** → **JSON** 선택 → 만들기 시 **JSON 키 파일이 다운로드**됩니다.

### 3-4. 프로젝트에 넣을 값

- **서비스 계정 JSON 파일**  
  - 보안을 위해 프로젝트 루트에 두지 말고, 한 단계 위 등 다른 폴더에 두거나,  
  - **환경 변수로 JSON 내용 전체**를 문자열로 넣는 방식을 권장합니다.

- **.env.local 예시 (JSON 경로 방식)**  
  ```env
  GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\your\service-account-key.json
  ```
  또는 **JSON 문자열** (한 줄, 이스케이프 없이 따옴표 안에 전체 JSON):
  ```env
  GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...",...}
  ```
  둘 중 하나만 설정하면 됩니다. `GOOGLE_SERVICE_ACCOUNT_JSON`이 있으면 해당 값을 우선 사용합니다.

- **프로젝트 ID**  
  - API 호출 시 `x-goog-user-project` 헤더에 넣거나, 서비스 계정 JSON 안의 `project_id`를 쓰면 됩니다.

---

## 4. 앱에서 할 일 (구현 시)

1. **서버(API 라우트)** 에서만 사용  
   - 클라이언트에 JSON 키를 노출하지 말고, Next.js API Route(서버)에서만 Google TTS 호출.

2. **인증**  
   - `google-auth-library` 등으로 서비스 계정 JSON에서 **Access Token** 발급.  
   - REST 호출 시 헤더:  
     `Authorization: Bearer <access_token>`

3. **호출 엔드포인트**  
   - `POST https://texttospeech.googleapis.com/v1/text:synthesize`  
   - Body: `input`(텍스트 또는 SSML), `voice`(languageCode: `ko-KR`, name 등), `audioConfig`(encoding: MP3 등).  
   - 응답: `audioContent` (base64 인코딩 오디오).

4. **한국어 음성 (Chirp 3 HD)**  
   - **Chirp 3: HD**는 한국어(ko-KR)를 지원하며, **월 0~100만 글자 무료** ([가격 정책](https://cloud.google.com/text-to-speech/pricing)).  
   - `languageCode`: `ko-KR`, `voice.name`: `ko-KR-Chirp3-HD-Charon`, `ko-KR-Chirp3-HD-Kore` 등 ([Chirp 3 HD 문서](https://cloud.google.com/text-to-speech/docs/chirp3-hd)).  
   - 앱에서는 **라디오 프리셋(Google – Chirp 3 HD)** 로 여러 보이스 중 선택해 사용합니다.

---

## 5. 요약 체크리스트

- [ ] Google Cloud 프로젝트 생성/선택
- [ ] 결제(빌링) 연결
- [ ] **Cloud Text-to-Speech API** 사용 설정
- [ ] **서비스 계정** 생성 후 **키(JSON)** 다운로드
- [ ] `.env.local`에 `GOOGLE_APPLICATION_CREDENTIALS` 경로 또는 `GOOGLE_TTS_SERVICE_ACCOUNT_JSON` 내용 설정
- [ ] 재생 페이지: 기존 영역은 **라디오 프리셋(Azure)**, 아래에 **라디오 프리셋(Google)** 영역 추가
- [ ] 서버 API에서 Google TTS 호출용 라우트 추가 (Azure `/api/tts` 와 별도로 `/api/tts-google` 등)

이 순서대로 진행한 뒤, 라디오 프리셋(Google) UI와 `/api/tts-google` 연동을 구현하면 됩니다.
