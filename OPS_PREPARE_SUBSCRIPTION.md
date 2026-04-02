# 운영 준비 메모: 구독/결제(임시 스토어 → 실제 DB)

이 문서는 `subscriptionServerStore` 기반 구독/결제 흐름을 운영에 올리기 전에 확인할 내용과, 추후 실제 DB로 전환할 때 어떤 범위만 바꾸면 되는지 정리한 메모입니다.

## 1) 현재 구현 요약

- 구독/결제 상태 관리는 `lib/subscriptionServerStore.ts`의 export 함수들을 통해서만 라우트들이 접근합니다.
- 현재 스토어는 프로세스 메모리(Map) + JSON 파일로 상태를 유지합니다.
- Vercel(서버리스) 환경에서는 쓰기 가능한 위치가 제한될 수 있어, 저장 경로를 `os.tmpdir()` 아래로 바꿨습니다.

관련 코드:
- `lib/subscriptionServerStore.ts`
- `app/api/subscription/status/route.ts`
- `app/api/subscription/billing/activate/route.ts`
- `app/api/subscription/billing/charge-due/route.ts`
- `app/api/subscription/cancel-scheduled-plan/route.ts`
- `app/api/webhooks/toss/route.ts`
- `app/pricing/page.tsx`

## 2) Vercel 배포/런타임 이슈(ENOENT) 정리

- 운영에서 발생했던 얼럿: `ENOENT: no such file or directory, mkdir '/var/task/.martradio-data'`
- 원인: 스토어가 `process.cwd()` 기반 경로(`/var/task/...`)에 디렉토리를 생성하려고 시도했기 때문.
- 해결: `subscriptionServerStore.ts`에서 저장 경로를 `join(tmpdir(), ".martradio-data")`로 변경.

확인 포인트:
- 배포 후에도 저장/갱신이 실패하면, 동일하게 파일 쓰기 경로(`tmpdir`) 접근권한 문제인지 먼저 확인합니다.

## 3) CSP/보안 헤더로 인한 결제 UI 차단 대응

- 토스 결제창이 뜨는데 마지막 단계에서 차단/오류가 나타날 수 있습니다.
- 기존 CSP에서 `frame-src`가 토스 결제 UI 관련 origin을 포함하지 않아 iframe 차단이 발생할 수 있어, 토스 관련 origin을 CSP에 반영했습니다.
- `Permissions-Policy`의 `payment=()` 항목은 결제 UI가 필요한 경우 충돌 가능성이 있어 제거했습니다.

관련 코드:
- `next.config.mjs`

## 4) 결제 실패 디버깅(운영에서 무엇을 봐야 하는가)

### 4-1. 브라우저에서 확인할 요청

- 결제 후 `pricing` 화면의 `checkout=billing_success` 플로우에서 호출되는 요청은:
  - `/api/subscription/billing/activate`

### 4-2. DevTools에서 보는 위치

- DevTools → `Network`
- `billing/activate`로 검색한 뒤 해당 요청을 클릭
- `Response` 탭에서 JSON 바디를 확인합니다.
- 특히 `{ "error": "..." }` 형태의 문자열을 확인하면 서버에서 어떤 단계가 실패했는지 추적이 쉬워집니다.

참고:
- 서버 예외가 발생해도, `billing/activate`는 예외 시에도 `{ error: "..." }` JSON이 반환되도록(try/catch 보강) 수정되어 있습니다.

## 5) “정기결제 시작에 실패했습니다.”가 뜨는 조건

- `app/pricing/page.tsx`에서 `billing_success` 처리 중 `/api/subscription/billing/activate` 응답이 실패하면 기본 메시지로 이 문구가 뜹니다.
- 서버가 `error`를 내려주면 “정기결제 시작에 실패했습니다.” 대신 또는 그 내부에 표시되는 오류 문자열로 원인을 좁힐 수 있습니다.

## 6) 플랜 변경 예약 취소 기능(추후 운영 UX)

- `app/pricing/page.tsx`:
  - “다음 결제일부터 플랜 변경 예정” 앰버 배너에 `플랜 변경 예약 취소` 버튼 추가
  - 현재 플랜 카드를 다시 선택했을 때, 예약이 존재하면 예약 취소 확인 후 진행
- 서버:
  - `app/api/subscription/cancel-scheduled-plan/route.ts` 생성
  - `lib/subscriptionServerStore.ts`에 `cancelScheduledPlanChange(userId)` 추가

## 7) 실제 DB로 전환할 때 코드 수정 범위

결론부터 말하면, 운영에서 “실제 DB를 붙일 때”는 `subscriptionServerStore`의 persistence 구현만 교체하면 되는 방향이 정석입니다.

이 프로젝트는 라우트들이 `lib/subscriptionServerStore.ts`의 export 함수들을 import해서 동작합니다.

따라서 DB 전환 시 필요한 범위:
- `lib/subscriptionServerStore.ts` 내부에서
  - 구독 상태 저장/조회
  - pending checkout 저장/삭제
  - webhook log / billing method / billing failure attempt 저장
  등을 JSON 파일/메모리 대신 DB 쿼리로 교체

바꾸지 않아도 되는 범위(목표):
- 라우트들(`app/api/...`, `app/pricing/page.tsx`)은 export 함수의 시그니처와 반환 형태가 유지되면 대체로 수정이 필요 없습니다.

전환 시 주의:
- 함수 시그니처(입력/출력 형태)를 유지하는 것을 목표로 설계합니다.
- 서버리스 환경에서는 파일 기반 저장소를 쓰지 않게 되므로, `tmpdir()` 경로 이슈는 사라집니다.

## 8) 운영 체크리스트(권장)

- 배포 후 `/api/subscription/billing/activate`에서 실패 시 `{ error: ... }` JSON이 반드시 내려오는지 확인
- 토스 결제 단계에서 CSP 위반 로그가 발생하지 않는지(특히 `frame-src`) 확인
- DB 전환 계획이 있다면 `subscriptionServerStore.ts`의 export 인터페이스를 고정하고 구현만 DB로 교체

