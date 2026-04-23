update public.sessions
set status = 'revoked',
    revoked_at = coalesce(revoked_at, now())
where mode <> 'gpt'
  and status = 'active';

delete from public.license_entitlements
where mode <> 'gpt';

delete from public.mode_payloads
where mode <> 'gpt';

alter table public.sessions
  drop constraint if exists sessions_mode_check;

alter table public.sessions
  add constraint sessions_mode_check check (mode in ('gpt'));

alter table public.mode_payloads
  drop constraint if exists mode_payloads_mode_check;

alter table public.mode_payloads
  add constraint mode_payloads_mode_check check (mode in ('gpt'));

alter table public.license_entitlements
  drop constraint if exists license_entitlements_mode_check;

alter table public.license_entitlements
  add constraint license_entitlements_mode_check check (mode in ('gpt'));
