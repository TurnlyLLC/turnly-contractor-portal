create table public.relay_sweep_settings (
  id integer primary key check (id = 1),
  reserve_cents bigint not null check (reserve_cents between 0 and 99999999999),
  cadence text not null check (cadence in ('weekly','daily','paused')),
  weekday integer not null check (weekday between 0 and 6)
);
alter table public.relay_sweep_settings enable row level security;
revoke all on public.relay_sweep_settings from public, anon, authenticated;
grant select, update on public.relay_sweep_settings to service_role;
insert into public.relay_sweep_settings values (1,100000,'weekly',5);
