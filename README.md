# 마트방송 (Mart Radio) - MVP

동네 마트에서 행사/타임세일 상품을 **표로 입력**하고,
자동으로 방송용 멘트를 생성한 뒤 **MP3로 생성/저장**하여
필요할 때 사람이 직접 ▶/⏸/⏹로 재생하는 웹 도구.

> 포지션: 준비형 운영 도구 (자동 스케줄러 아님)
> 목표: 사용법 단순화로 현장 사용자 1~2명 만족

---

## 1) 핵심 유저 플로우 (2단계 입력 + 실행)

### A. 새 방송 만들기
1. 행사 유형 선택 (타임세일 / 마감재고 / 자유입력)
2. 방송 제목 + (선택) 예정 방송일/시간 입력 (표시용, 자동 실행 X)
3. 상품 표 입력 (엑셀/전단지 데이터 복붙)
4. 멘트 생성 → 텍스트 미리보기에서 수정
5. 옵션 선택: `상품 끝에 "입니다" 붙이기` ON/OFF
6. MP3 파일 생성(저장) → ▶ 방송 시작
7. 언제든 ⏸ 일시정지 / ⏹ 완전정지

### B. 기존 방송 열기 (재사용/수정/재생성)
1. 리스트에서 방송 세션 선택
2. 상품 체크/수정 (품절 상품 제거 등)
3. 멘트 재생성(텍스트 확인) → MP3 재생성(덮어쓰기 또는 새 버전 생성)
4. ▶ 방송 시작

---

## 2) MVP 기능 범위

### 반드시 포함
- 첫 화면: `새 방송 만들기` / `기존 방송 열기`
  - 기존 방송: "마지막 재생" / "마지막 생성" / "예정 방송 시간(선택)" 표시
- 방송 세션 CRUD (최소: 생성/조회/수정/복제는 후순위)
- 상품 표 입력 (엑셀 복붙 가능한 UX)
  - 컬럼 최소: [선택] [상품명] [단위] [가격]
- 멘트 생성(템플릿 기반)
  - 시작/끝 문구 + 중간에 상품 나열 (상품 사이 자연스러운 쉼)
  - "입니다" 옵션 ON/OFF
- 텍스트 미리보기에서 최종 수정 가능
- MP3 생성/저장
- ▶/⏸/⏹ 재생 제어 + 반복 간격 설정

### 이번 MVP에서 제외 (Non-goals)
- 자동 스케줄 실행(특정 시간 되면 자동 재생)
- 배경음/효과음
- POS/매출 연동
- 대시보드/통계
- 복잡한 권한/계정 관리 (내부 테스트 기준)

---

## 3) 데이터 구조(권장)

### sessions (방송 세션)
- id (uuid)
- title (text)
- event_type (enum: TIME_SALE | CLEARANCE | FREE)
- scheduled_at (timestamp, nullable)  // 표시용
- repeat_minutes (int, default)
- item_suffix_isnida (bool)           // "입니다" 옵션
- last_generated_at (timestamp)
- last_played_at (timestamp)
- created_at / updated_at

### items (세션의 상품)
- id (uuid)
- session_id (uuid fk)
- is_selected (bool)
- name (text)
- unit (text)        // 예: 100g, 1팩
- price (int)        // 숫자만
- sort_order (int)
- created_at / updated_at

### audio_versions (생성된 mp3)
- id (uuid)
- session_id (uuid fk)
- generated_text (text)     // 생성 당시 최종 방송 문구
- audio_url (text)          // 저장소 URL
- created_at

> MVP 단순화: 세션당 최신 1개만 유지해도 OK.
> (audio_versions 없이 sessions에 latest_audio_url만 둬도 됨)

---

## 4) 템플릿(예시)

### 시작 문구(행사유형별)
- 타임세일: "지금부터 타임세일 상품 안내드립니다."
- 마감재고: "마감 임박 재고정리 상품 안내드립니다."
- 자유입력: 사용자가 직접 작성

### 상품 라인(반복)
- 기본: "{상품명} {단위} {가격}원{(옵션)입니다}."
- 상품 사이: 1~1.5초 쉼(오디오 레벨에서 silence 삽입 권장)

### 끝 문구
- 공통: "지금 바로 신선코너에서 만나보세요."

---

## 5) 기술 스택(권장)

- Frontend: Next.js (App Router) + TypeScript
- Storage/DB: Supabase (Postgres + Storage)
- TTS: (선택) Azure / Naver CLOVA / Google TTS
  - 목표: 한국어 숫자/단위 자연스러운 발화
- Hosting: Vercel (Next.js 배포)

> MVP 내부 테스트라면 인증은 최소화(또는 임시 비밀번호) 가능.
> 외부 판매 단계에서는 반드시 RLS/인증 설계 필요.

---

## 6) 로컬 실행 (개발자용)

### 1) 설치
- Node.js 18+ 권장
- pnpm 권장

```bash
pnpm install
pnpm dev
```

### 2) Azure TTS 설정 (MP3 생성용, 수동 작업)

MP3 생성(음성 합성)을 사용하려면 Azure Speech 리소스가 필요합니다.

1. **Azure 포털** (https://portal.azure.com) 로그인 후:
   - 리소스 만들기 → "Speech" 검색 → **Speech** 리소스 생성
   - 리소스가 만들어진 뒤 **키 및 엔드포인트** 메뉴에서 **키 1**과 **리전**(예: Korea Central) 확인

2. **프로젝트 루트**에 `.env.local` 파일 생성 후 아래 변수 설정:
   ```env
   AZURE_SPEECH_KEY=여기에_키1_값
   AZURE_SPEECH_REGION=koreacentral
   ```
   (예시는 `.env.example` 참고)

3. `.env.local` 은 git 에 올리지 마세요. (이미 .gitignore 에 있을 수 있음)

4. 개발 서버 재시작 후 재생 화면에서 "MP3 생성" 버튼을 사용할 수 있습니다.
