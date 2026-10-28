create table public.residential_calendar_settings (
 id integer primary key check (id=1), settings jsonb not null default '{}'::jsonb,
 version integer not null default 1, updated_at timestamptz not null default now(), updated_by uuid references auth.users(id)
);
alter table public.residential_calendar_settings enable row level security;
revoke all on public.residential_calendar_settings from public, anon, authenticated;
grant select, update on public.residential_calendar_settings to service_role;
insert into public.residential_calendar_settings(id) values(1);
