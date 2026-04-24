create table if not exists public.stripe_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  requested_license_key text,
  license_id uuid references public.licenses(id) on delete set null,
  license_key text,
  mode text not null default 'gpt' check (mode in ('gpt')),
  months integer not null check (months in (1, 2, 3)),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'brl' check (currency = 'brl'),
  status text not null default 'created' check (status in ('created', 'open', 'paid', 'cancelled', 'expired')),
  stripe_session_id text unique,
  stripe_customer_id text,
  stripe_payment_intent_id text,
  checkout_url text,
  success_token text not null,
  device_id text,
  client_version text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists stripe_checkout_sessions_status_idx
  on public.stripe_checkout_sessions (status, created_at desc);

create index if not exists stripe_checkout_sessions_license_idx
  on public.stripe_checkout_sessions (license_id, created_at desc);

drop trigger if exists set_stripe_checkout_sessions_updated_at on public.stripe_checkout_sessions;
create trigger set_stripe_checkout_sessions_updated_at
before update on public.stripe_checkout_sessions
for each row execute function public.set_updated_at();

alter table public.stripe_checkout_sessions enable row level security;
alter table public.stripe_webhook_events enable row level security;

comment on table public.stripe_checkout_sessions is 'Stripe hosted checkout sessions for GPT Pro license purchases.';
comment on table public.stripe_webhook_events is 'Idempotent Stripe webhook ledger.';
