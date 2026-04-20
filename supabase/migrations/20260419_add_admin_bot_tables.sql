create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_telegram_user_id text not null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null unique,
  label text not null,
  description text not null,
  schedule_text text,
  enabled boolean not null default false,
  status text not null default 'planned',
  last_run_at timestamptz,
  last_result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_admin_jobs_updated_at on public.admin_jobs;
create trigger set_admin_jobs_updated_at
before update on public.admin_jobs
for each row execute function public.set_updated_at();

alter table public.admin_audit_logs enable row level security;
alter table public.admin_jobs enable row level security;

insert into public.admin_jobs (job_key, label, description, schedule_text, enabled, status)
values
  ('weekly-json-revoke', 'Revogar JSON semanal', 'Placeholder para rotacao semanal de payload.', 'Domingo 00:00', false, 'planned'),
  ('delete-all-chats', 'Excluir todos os chats', 'Placeholder para rotina administrativa futura.', null, false, 'planned')
on conflict (job_key) do update
set label = excluded.label,
    description = excluded.description,
    schedule_text = excluded.schedule_text,
    status = excluded.status;
