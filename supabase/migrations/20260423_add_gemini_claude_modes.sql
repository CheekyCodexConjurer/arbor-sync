alter table public.sessions
  drop constraint if exists sessions_mode_check;

alter table public.sessions
  add constraint sessions_mode_check
  check (mode in ('gpt', 'gemini', 'claude'));

alter table public.mode_payloads
  drop constraint if exists mode_payloads_mode_check;

alter table public.mode_payloads
  add constraint mode_payloads_mode_check
  check (mode in ('gpt', 'gemini', 'claude'));
