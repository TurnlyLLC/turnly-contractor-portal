-- Central validation covers browser writes, booking RPCs, imports and scheduled jobs.
create extension if not exists http with schema extensions;
create schema if not exists service_private;
revoke all on schema service_private from public, anon, authenticated;
create table public.service_cities (
 city text not null, state text not null, latitude double precision not null,
 longitude double precision not null, radius_miles double precision not null default 25,
 active boolean not null default true, primary key(state,city),
 check(radius_miles > 0 and radius_miles <= 100)
);
insert into public.service_cities(city,state,latitude,longitude) values
 ('Raleigh','NC',35.7796,-78.6382),('Durham','NC',35.9940,-78.8986),
 ('Asheville','NC',35.5951,-82.5515),('Greensboro','NC',36.0726,-79.7920);
alter table public.service_cities enable row level security;
revoke all on public.service_cities from anon,authenticated;
grant select on public.service_cities to anon,authenticated;
create policy service_cities_read on public.service_cities for select using(true);
grant all on public.service_cities to service_role;

create table service_private.address_checks (
 address_key text primary key, latitude double precision not null, longitude double precision not null,
 matched_address text not null, checked_at timestamptz not null default now()
);
create table service_private.address_review (
 address_key text primary key, issue text not null, checked_at timestamptz not null default now()
);
create function service_private.address_key(address text) returns text language sql immutable
set search_path='' as $$select lower(regexp_replace(trim(coalesce(address,'')), '[[:space:],]+',' ','g'))$$;
create function service_private.miles(a double precision,b double precision,c double precision,d double precision)
returns double precision language sql immutable strict set search_path='' as $$
 select 3958.7613 * 2 * asin(sqrt(least(1::double precision,
 power(sin(radians(c-a)/2),2)+cos(radians(a))*cos(radians(c))*power(sin(radians(d-b)/2),2))))
$$;

create function service_private.verify_address(address text) returns service_private.address_checks
language plpgsql security definer set search_path='' as $$
declare cached service_private.address_checks; response record; candidate jsonb; candidates jsonb;
 key text:=service_private.address_key(address); lat double precision; lon double precision;
begin
 if length(key)<10 or length(key)>600 or key !~ '^[0-9]' then
  raise exception 'Enter a complete street address, city, state and ZIP code to check our service area.';
 end if;
 select * into cached from service_private.address_checks where address_key=key and checked_at>now()-interval '180 days';
 if not found then
  begin
   perform set_config('http.curlopt_timeout_msec','4500',true);
   select * into response from extensions.http_get(
    'https://services.nconemap.gov/secure/rest/services/AddressNC/AddressNC_geocoder/GeocodeServer/findAddressCandidates',
    jsonb_build_object('f','json','SingleLine',address,'outSR','4326','outFields','Addr_type,Region,City,Postal','maxLocations','2'));
   if response.status<>200 then raise exception 'Geocoder unavailable'; end if;
   candidates:=response.content::jsonb->'candidates'; candidate:=candidates->0;
  exception when others then
   raise exception 'Address verification is temporarily unavailable. Please try again before submitting this request.';
  end;
  if candidate is null or coalesce((candidate->>'score')::numeric,0)<98
    or coalesce(candidate#>>'{attributes,Addr_type}','') not in ('PointAddress','Subaddress')
    or coalesce(candidate#>>'{attributes,Region}','')<>'NC'
    or (jsonb_array_length(candidates)>1 and (candidates->1->>'score')::numeric >= (candidate->>'score')::numeric) then
   raise exception 'We could not verify this exact address. Enter the complete North Carolina street address, city and ZIP code.';
  end if;
  lat:=(candidate#>>'{location,y}')::double precision; lon:=(candidate#>>'{location,x}')::double precision;
  if lat is null or lon is null or lat not between 33 and 37 or lon not between -85 and -75 then raise exception 'Unable to verify this North Carolina address.'; end if;
  insert into service_private.address_checks values(key,lat,lon,candidate->>'address',now())
   on conflict(address_key) do update set latitude=excluded.latitude,longitude=excluded.longitude,
   matched_address=excluded.matched_address,checked_at=excluded.checked_at returning * into cached;
 end if;
 if not exists(select 1 from public.service_cities c where c.active and c.state='NC'
   and service_private.miles(c.latitude,c.longitude,cached.latitude,cached.longitude)<=c.radius_miles) then
  raise exception 'This address is outside our service area. We serve addresses within 25 miles of Raleigh, Durham, Asheville or Greensboro, North Carolina.';
 end if;
 return cached;
end $$;

-- Run only after approval to send address-only lookups to NC OneMap. Validate
-- existing jobs before the city visibility policy is enabled in this transaction.
do $$declare a text; begin
 for a in select distinct address from public.assignment_blocks where nullif(trim(address),'') is not null loop
  begin
   perform service_private.verify_address(a);
  exception when others then
   insert into service_private.address_review(address_key,issue)
   values(service_private.address_key(a),sqlerrm) on conflict(address_key) do nothing;
  end;
 end loop;
end $$;

create function service_private.request_address(row_data jsonb, table_name text) returns text
language plpgsql immutable set search_path='' as $$
declare r jsonb:=row_data; street text; city text; state text; zip text;
begin
 if table_name='residential_inquiries' then r:=r->'payload'; end if;
 street:=coalesce(nullif(r->>'property_address',''),nullif(r->>'street_address',''),nullif(r->>'address',''));
 if street is null then return ''; end if;
 city:=coalesce(nullif(r->>'city',''),nullif(r->>'sales_city',''));
 state:=coalesce(nullif(r->>'state',''),nullif(r->>'sales_state',''));
 zip:=coalesce(nullif(r->>'zip',''),nullif(r->>'postal_code',''));
 -- Full formatted addresses already carry locality; do not append it twice.
 if street ~* ',.*[[:space:],][A-Z]{2}[[:space:],]+[0-9]{5}' then return street; end if;
 return concat_ws(', ',street,city,state,zip);
end $$;

create function service_private.enforce_request_area() returns trigger
language plpgsql security definer set search_path='' as $$
declare address text:=service_private.request_address(to_jsonb(new),tg_table_name); old_address text; checked service_private.address_checks;
begin
 if tg_op='UPDATE' then
  old_address:=service_private.request_address(to_jsonb(old),tg_table_name);
  if address=old_address then return new; end if;
 end if;
 if address='' and tg_table_name not in ('assignment_blocks','referral_bookings') then return new; end if;
 checked:=service_private.verify_address(address);
 return new;
end $$;
do $$declare t text; begin
 foreach t in array array['assignment_blocks','referral_bookings','properties','portal_properties','sales_leads','commercial_leads','residential_inquiries'] loop
  if to_regclass('public.'||t) is not null then
   execute format('create trigger service_area_check before insert or update on public.%I for each row execute function service_private.enforce_request_area()',t);
  end if;
 end loop;
end $$;

alter table public.profiles add column service_city text, add column service_state text;
alter table public.contractors add column service_city text, add column service_state text;
alter table public.contractor_invites add column service_city text, add column service_state text;
alter table public.profiles add foreign key(service_state,service_city) references public.service_cities(state,city);
alter table public.contractors add foreign key(service_state,service_city) references public.service_cities(state,city);
alter table public.contractor_invites add foreign key(service_state,service_city) references public.service_cities(state,city);
update public.profiles p set service_city=c.city,service_state=c.state from public.service_cities c
 where p.role::text='contractor' and lower(trim(coalesce(nullif(p.market,''),nullif(p.region,''),p.location)))=lower(c.city);
update public.contractors p set service_city=c.city,service_state=c.state from public.service_cities c
 where lower(trim(coalesce(nullif(to_jsonb(p)->>'market',''),nullif(to_jsonb(p)->>'region',''),to_jsonb(p)->>'location')))=lower(c.city);

create function service_private.protect_contractor_city() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.service_city is not distinct from old.service_city and new.service_state is not distinct from old.service_state then return new; end if;
 if new.service_city is null and new.service_state is null and tg_op='INSERT' then return new; end if;
 if (new.service_city is null)<>(new.service_state is null) then raise exception 'Select both a service state and city.'; end if;
 if (auth.uid() is null and coalesce(auth.role(),'') in ('anon','authenticated')) or (auth.uid() is not null and not exists(select 1 from public.profiles where id=auth.uid() and role::text in ('admin','owner','super_admin'))) then
  raise exception 'Only administrators can change a contractor service city.';
 end if;
 return new;
end $$;
create trigger protect_service_city before insert or update on public.profiles for each row execute function service_private.protect_contractor_city();
create trigger protect_service_city before insert or update on public.contractors for each row execute function service_private.protect_contractor_city();
create trigger protect_service_city before insert or update on public.contractor_invites for each row execute function service_private.protect_contractor_city();

-- Restrictive policy combines with ALL existing policies: direct assignments and
-- permissive legacy policies cannot expose another city's jobs.
create function public.contractor_job_in_service_city(job public.assignment_blocks) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join public.service_cities c
 on c.city=p.service_city and c.state=p.service_state and c.active
 join service_private.address_checks a on a.address_key=service_private.address_key(job.address)
 where p.id=auth.uid() and p.role::text='contractor' and p.contractor_approved
 and service_private.miles(c.latitude,c.longitude,a.latitude,a.longitude)<=c.radius_miles)
$$;
revoke all on function public.contractor_job_in_service_city(public.assignment_blocks) from public,anon;
grant execute on function public.contractor_job_in_service_city(public.assignment_blocks) to authenticated;
create policy contractor_city_boundary on public.assignment_blocks as restrictive for all to authenticated
 using(not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role::text='contractor') or public.contractor_job_in_service_city(assignment_blocks))
 with check(not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role::text='contractor') or public.contractor_job_in_service_city(assignment_blocks));

-- Security-definer claim/start RPCs also pass through this guard.
create function service_private.guard_contractor_job() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.profiles where id=auth.uid() and role::text='contractor') then
  if tg_op='DELETE' then raise exception 'Contractors cannot delete jobs.'; end if;
  if not public.contractor_job_in_service_city(new) then raise exception 'This job is outside your assigned service city. Contact Turnly to update your location.'; end if;
  if tg_op='UPDATE' and new.address is distinct from old.address then raise exception 'Only administrators can change a job address.'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger contractor_job_city_guard before insert or update or delete on public.assignment_blocks for each row execute function service_private.guard_contractor_job();
revoke all on all functions in schema service_private from public,anon,authenticated;

create function public.check_service_address(address text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a service_private.address_checks; city public.service_cities;
begin
 a:=service_private.verify_address(address);
 select c.* into city from public.service_cities c where c.active
 order by service_private.miles(c.latitude,c.longitude,a.latitude,a.longitude) limit 1;
 return jsonb_build_object('verified',true,'city',city.city,'state',city.state,'radius_miles',city.radius_miles);
end $$;
revoke all on function public.check_service_address(text) from public,anon,authenticated;
grant execute on function public.check_service_address(text) to service_role;
