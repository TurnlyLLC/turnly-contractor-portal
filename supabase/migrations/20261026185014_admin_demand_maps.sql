create table public.map_geocodes (
 address_key text primary key,
 latitude double precision,
 longitude double precision,
 result text not null check (result in ('matched','not_found')),
 matched_address text,
 provider text not null default 'US Census',
 checked_at timestamptz not null default now(),
 check ((result='matched' and latitude between -90 and 90 and longitude between -180 and 180) or (result='not_found' and latitude is null and longitude is null))
);
create table public.out_of_area_requests (
 id uuid primary key,
 token_hash text not null,
 request_hash text not null,
 name text not null,
 email text not null,
 phone text not null,
 property_address text not null,
 city text not null,
 state text not null,
 zip text not null,
 beds integer not null,
 baths numeric not null,
 sqft integer not null,
 service text not null,
 frequency text not null,
 preferred_date date,
 notes text,
 referral_code text,
 ambassador_code text,
 status text not null default 'out_of_range' check(status='out_of_range'),
 created_at timestamptz not null default now()
);
create index out_of_area_requests_created_idx on public.out_of_area_requests(created_at desc);
alter table public.map_geocodes enable row level security;
alter table public.out_of_area_requests enable row level security;
revoke all on public.map_geocodes,public.out_of_area_requests from public,anon,authenticated;
grant select,insert,update,delete on public.map_geocodes,public.out_of_area_requests to service_role;
comment on table public.out_of_area_requests is 'Unconfirmed expansion demand only. Never a chargeable booking or claimable assignment.';
