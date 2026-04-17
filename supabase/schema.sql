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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, session_id)
);

create index if not exists idx_broadcast_sessions_owner_updated
  on public.broadcast_sessions (owner_user_id, updated_at desc);

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
