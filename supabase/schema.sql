create table if not exists public.app_users (
  id text primary key,
  username text not null unique,
  hashed_password text not null,
  name text not null,
  mart_name text not null,
  mart_address_base text null,
  mart_address_detail text null,
  phone text not null,
  referrer_id text null,
  plan_id text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_user_sessions (
  session_id text primary key,
  user_id text not null references public.app_users (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz null,
  revoked_reason text null,
  replaced_by_session_id text null
);

create index if not exists idx_app_user_sessions_user_last_seen
  on public.app_user_sessions (user_id, last_seen_at desc);

create unique index if not exists uq_app_user_sessions_single_active
  on public.app_user_sessions (user_id)
  where revoked_at is null;

create table if not exists public.subscription_statuses (
  user_id text primary key references public.app_users (id) on delete cascade,
  plan_id text not null default 'free' check (plan_id in ('free', 'small', 'medium', 'large')),
  cancel_requested boolean not null default false,
  latest_payment_key text null,
  latest_order_id text null,
  current_period_start timestamptz null,
  current_period_end timestamptz null,
  next_payment_due_at timestamptz null,
  billing_day_of_month integer null check (billing_day_of_month between 1 and 31),
  scheduled_plan_after_period text null check (scheduled_plan_after_period in ('small', 'medium', 'large')),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscription_statuses_plan_due
  on public.subscription_statuses (plan_id, cancel_requested, next_payment_due_at);

create table if not exists public.subscription_pending_checkouts (
  order_id text primary key,
  user_id text not null references public.app_users (id) on delete cascade,
  plan_id text not null check (plan_id in ('small', 'medium', 'large')),
  amount integer not null check (amount >= 0),
  created_at timestamptz not null default now(),
  new_billing_cycle boolean not null default false
);

create index if not exists idx_subscription_pending_checkouts_user
  on public.subscription_pending_checkouts (user_id, created_at desc);

create table if not exists public.subscription_billing_methods (
  user_id text primary key references public.app_users (id) on delete cascade,
  customer_key text not null,
  billing_key text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.subscription_billing_charge_attempts (
  user_id text primary key references public.app_users (id) on delete cascade,
  due_at timestamptz not null,
  primary_failed_at timestamptz null,
  retry_failed_at timestamptz null,
  last_error text null,
  updated_at timestamptz not null default now()
);

create table if not exists public.subscription_payment_links (
  id bigserial primary key,
  user_id text not null references public.app_users (id) on delete cascade,
  order_id text null unique,
  payment_key text null unique,
  created_at timestamptz not null default now()
);

create index if not exists idx_subscription_payment_links_user
  on public.subscription_payment_links (user_id, created_at desc);

create table if not exists public.subscription_processed_events (
  event_id text primary key,
  processed_at timestamptz not null default now()
);

create table if not exists public.subscription_webhook_logs (
  id bigserial primary key,
  received_at timestamptz not null default now(),
  event_type text not null,
  order_id text null,
  payment_key text null,
  status text null,
  event_id text null,
  duplicate boolean not null default false,
  processed boolean not null default false,
  raw jsonb not null default '{}'::jsonb
);

create index if not exists idx_subscription_webhook_logs_received
  on public.subscription_webhook_logs (received_at desc);

alter table public.subscription_statuses enable row level security;
alter table public.subscription_pending_checkouts enable row level security;
alter table public.subscription_billing_methods enable row level security;
alter table public.subscription_billing_charge_attempts enable row level security;
alter table public.subscription_payment_links enable row level security;
alter table public.subscription_processed_events enable row level security;
alter table public.subscription_webhook_logs enable row level security;

create table if not exists public.admin_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_payments (
  id text primary key,
  user_id text not null,
  username text not null,
  product_id text not null,
  amount integer not null,
  paid_at timestamptz not null,
  referrer_id text null,
  source text null,
  payment_key text null,
  order_id text null,
  status text null
);

create index if not exists idx_admin_payments_paid_at on public.admin_payments (paid_at desc);
create index if not exists idx_admin_payments_user on public.admin_payments (user_id, username);

create table if not exists public.broadcast_sessions (
  owner_user_id text not null,
  session_id text not null,
  title text not null,
  promo_raw_text text null,
  event_type text not null,
  custom_opening text null,
  scheduled_at timestamptz null,
  scheduled_end_at timestamptz null,
  repeat_minutes integer not null default 5,
  item_suffix_isnida boolean not null default true,
  last_generated_at timestamptz null,
  last_played_at timestamptz null,
  latest_audio_url text null,
  generated_text text null,
  bgm_youtube_url text null,
  bgm_start_seconds integer null,
  bgm_end_seconds integer null,
  music_mode text null check (music_mode in ('background', 'interval')),
  bgm_volume integer null check (bgm_volume between 0 and 100),
  tts_provider text null,
  tts_preset_id text null,
  tts_voice_template_id text null,
  voice text null,
  tts_style text null,
  tts_style_degree numeric null,
  tts_rate text null,
  tts_pitch text null,
  tts_break_seconds numeric null,
  playback_loop_mode text null check (playback_loop_mode in ('infinite', 'count')),
  playback_repeat_count integer null check (playback_repeat_count between 1 and 999),
  playback_gap_seconds integer null check (playback_gap_seconds between 0 and 3600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, session_id)
);

create index if not exists idx_broadcast_sessions_owner_updated
  on public.broadcast_sessions (owner_user_id, updated_at desc);

alter table public.broadcast_sessions
  add column if not exists playback_loop_mode text null check (playback_loop_mode in ('infinite', 'count'));
alter table public.broadcast_sessions
  add column if not exists playback_repeat_count integer null check (playback_repeat_count between 1 and 999);
alter table public.broadcast_sessions
  add column if not exists playback_gap_seconds integer null check (playback_gap_seconds between 0 and 3600);

create table if not exists public.broadcast_items (
  owner_user_id text not null,
  session_id text not null,
  item_id text not null,
  item_type text not null check (item_type in ('item', 'event')),
  is_selected boolean not null default true,
  name text not null,
  unit text not null,
  price numeric not null,
  original_price numeric null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, session_id, item_id, item_type),
  constraint fk_broadcast_items_session
    foreign key (owner_user_id, session_id)
    references public.broadcast_sessions (owner_user_id, session_id)
    on delete cascade
);

create index if not exists idx_broadcast_items_owner_session_sort
  on public.broadcast_items (owner_user_id, session_id, sort_order asc);

-- 추천인 관리자 계정 (서버 DB 단일 소스)
create table if not exists public.referrer_accounts (
  id text primary key,
  login_id text not null unique,
  name text not null,
  person_name text not null default '',
  phone text not null default '',
  email text not null default '',
  is_active boolean not null default true,
  password_hash text not null,
  uses_default_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_referrer_accounts_active on public.referrer_accounts (is_active);

alter table public.referrer_accounts enable row level security;

-- 보안 감사 이벤트 (append-only)
create table if not exists public.security_audit_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists idx_security_audit_events_at on public.security_audit_events (at desc);

alter table public.security_audit_events enable row level security;
