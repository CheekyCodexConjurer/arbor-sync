create table if not exists public.license_entitlements (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  mode text not null check (mode in ('gpt')),
  status text not null default 'active' check (status in ('active', 'past_due', 'revoked', 'expired')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  months integer not null default 1 check (months > 0),
  monthly_price numeric(10, 2) not null default 0 check (monthly_price >= 0),
  paid_amount numeric(10, 2) not null default 0 check (paid_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (license_id, mode)
);

create index if not exists license_entitlements_license_status_mode_idx
  on public.license_entitlements (license_id, status, mode);

drop trigger if exists set_license_entitlements_updated_at on public.license_entitlements;
create trigger set_license_entitlements_updated_at
before update on public.license_entitlements
for each row execute function public.set_updated_at();

alter table public.license_entitlements enable row level security;

insert into public.license_entitlements (license_id, mode, status, starts_at, expires_at)
select
  licenses.id,
  product_modes.mode,
  'active',
  now(),
  licenses.current_period_end
from public.licenses
cross join (values ('gpt')) as product_modes(mode)
where licenses.status = 'active'
on conflict (license_id, mode) do nothing;

comment on table public.license_entitlements is 'Per-product access rights for a license.';
comment on column public.license_entitlements.mode is 'AI product mode enabled for this license.';
comment on column public.license_entitlements.monthly_price is 'Monthly amount charged to the user for this product entitlement.';
comment on column public.license_entitlements.paid_amount is 'Amount already paid for this product entitlement.';
