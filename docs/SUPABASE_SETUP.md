# Supabase 설정 가이드

## 1) Supabase 프로젝트 생성

1. Supabase에서 새 프로젝트를 생성합니다.
2. `Project Settings > API`에서 아래 값을 확인합니다.
   - `Project URL`
   - `service_role` key

## 2) 스키마 생성

Supabase SQL Editor에서 `supabase/schema.sql` 파일 내용을 실행합니다.

생성되는 테이블:
- `app_users`
- `broadcast_sessions`
- `broadcast_items`

## 3) 환경 변수 설정

`.env.local`에 아래 값을 추가합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
USER_SESSION_SECRET=your_random_32_plus_char_secret_for_user_cookie
```

## 4) 동작 방식

- 로컬 저장소(`localStorage`)는 기존과 동일하게 동작합니다.
- 로그인된 사용자가 방송을 저장/수정하면 `/api/supabase/sessions/sync`로 자동 동기화됩니다.
- 방송 삭제 시 Supabase에서도 같이 삭제됩니다.

## 5) 확인 방법

1. 앱에서 로그인 후 방송을 하나 저장합니다.
2. Supabase Table Editor에서 `broadcast_sessions`, `broadcast_items`에 행이 생겼는지 확인합니다.
