create table public.city_demand_requests (
 id uuid primary key default gen_random_uuid(),
 dedupe_key text not null unique,
 city text not null check(length(city) between 2 and 100),
 city_key text not null,
 state text not null check(state ~ '^[A-Z]{2}$'),
 zip text not null check(zip ~ '^[0-9]{5}$'),
 email text not null check(length(email) <= 254),
 name text not null default '',
 service text not null check(service in ('standard','deep','move')),
 frequency text not null check(frequency in ('weekly','biweekly','monthly','once','undecided')),
 notify_launch boolean not null default false,
 consent_text text not null,
 consent_version text not null,
 source text not null default 'booking',
 referral_code text not null default '',
 ambassador_code text not null default '',
 utm_source text not null default '',
 utm_medium text not null default '',
 utm_campaign text not null default '',
 created_at timestamptz not null default now()
);
create index city_demand_location_idx on public.city_demand_requests(state,city_key,zip);
create index city_demand_created_idx on public.city_demand_requests(created_at desc);
alter table public.city_demand_requests enable row level security;
revoke all on public.city_demand_requests from public,anon,authenticated;
grant select,insert,update,delete on public.city_demand_requests to service_role;
comment on table public.city_demand_requests is 'City interest only; one request per email/ZIP. Never a booking. Launch email permission is separate, optional, and not general marketing consent.';
create function public.city_demand_summary() returns table(city text,city_key text,state text,zip text,requests bigint,recurring bigint,last_30_days bigint,notify_launch bigint,latest_at timestamptz)
language sql stable security invoker set search_path = '' as $$
 select min(d.city),d.city_key,d.state,d.zip,count(*),count(*) filter(where d.frequency in ('weekly','biweekly','monthly')),count(*) filter(where d.created_at >= now()-interval '30 days'),count(*) filter(where d.notify_launch),max(d.created_at)
 from public.city_demand_requests d group by d.city_key,d.state,d.zip order by count(*) desc,min(d.city),d.state,d.zip;
$$;
revoke all on function public.city_demand_summary() from public,anon,authenticated;
grant execute on function public.city_demand_summary() to service_role;
