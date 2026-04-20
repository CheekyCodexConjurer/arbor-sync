create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  license_key text not null unique,
  status text not null check (status in ('active', 'past_due', 'revoked', 'expired')),
  plan text not null default 'default',
  max_devices integer not null default 1 check (max_devices > 0),
  current_period_end timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  device_id text not null,
  status text not null check (status in ('active', 'revoked')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (license_id, device_id)
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  mode text not null check (mode in ('gpt', 'perplexity')),
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  last_heartbeat_at timestamptz not null default now(),
  heartbeat_count integer not null default 0,
  status text not null check (status in ('active', 'revoked', 'expired')),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mode_payloads (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('gpt', 'perplexity')),
  version integer not null check (version > 0),
  encrypted_payload text not null,
  payload_hash text not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mode, version)
);

create unique index if not exists mode_payloads_one_active_per_mode_idx
  on public.mode_payloads (mode)
  where active = true;

create index if not exists devices_license_status_idx
  on public.devices (license_id, status);

create index if not exists sessions_status_expires_idx
  on public.sessions (status, expires_at);

create index if not exists sessions_device_mode_idx
  on public.sessions (device_id, mode);

create index if not exists mode_payloads_mode_active_idx
  on public.mode_payloads (mode, active, version desc);

drop trigger if exists set_licenses_updated_at on public.licenses;
create trigger set_licenses_updated_at
before update on public.licenses
for each row execute function public.set_updated_at();

drop trigger if exists set_devices_updated_at on public.devices;
create trigger set_devices_updated_at
before update on public.devices
for each row execute function public.set_updated_at();

drop trigger if exists set_sessions_updated_at on public.sessions;
create trigger set_sessions_updated_at
before update on public.sessions
for each row execute function public.set_updated_at();

drop trigger if exists set_mode_payloads_updated_at on public.mode_payloads;
create trigger set_mode_payloads_updated_at
before update on public.mode_payloads
for each row execute function public.set_updated_at();

alter table public.licenses enable row level security;
alter table public.devices enable row level security;
alter table public.sessions enable row level security;
alter table public.mode_payloads enable row level security;

comment on table public.licenses is 'License registry used by the remote session backend.';
comment on table public.devices is 'Registered devices attached to a license.';
comment on table public.sessions is 'Short-lived extension sessions tied to a license and device.';
comment on table public.mode_payloads is 'Encrypted payload bundles per mode and version.';
