create table if not exists public.device_transfer_events (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  previous_device_id uuid references public.devices(id) on delete set null,
  previous_device_fingerprint text,
  next_device_id text not null,
  month_key text not null check (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  status text not null check (status in ('approved', 'blocked')),
  reason text,
  created_at timestamptz not null default now()
);

create unique index if not exists device_transfer_events_one_approved_per_month_idx
  on public.device_transfer_events (license_id, month_key)
  where status = 'approved';

create index if not exists device_transfer_events_license_month_idx
  on public.device_transfer_events (license_id, month_key, created_at desc);

alter table public.device_transfer_events enable row level security;

comment on table public.device_transfer_events is 'Monthly self-service device transfer audit log for licenses.';
