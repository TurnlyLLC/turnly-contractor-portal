-- Shared zone matching for browser and native job boards. No blank-profile wildcard.
create or replace function turnly_private.canonical_job_zone(value text)
returns text language sql immutable set search_path='' as $$
 select case lower(trim(value)) when 'durham' then 'NC:Durham' when 'nc:durham' then 'NC:Durham'
 when 'raleigh' then 'NC:Raleigh' when 'nc:raleigh' then 'NC:Raleigh'
 when 'asheville' then 'NC:Asheville' when 'nc:asheville' then 'NC:Asheville'
 when 'greensboro' then 'NC:Greensboro' when 'nc:greensboro' then 'NC:Greensboro' end;
$$;
create or replace function turnly_private.contractor_selected_zones(p public.profiles)
returns text[] language sql stable set search_path='' as $$
 select coalesce(array_agg(distinct z) filter(where z is not null),'{}'::text[]) from (
 select turnly_private.canonical_job_zone(v) z from unnest(case when cardinality(p.allowed_regions)>0 then p.allowed_regions else array[p.market,p.region] end) v) s;
$$;
create or replace function turnly_private.assignment_job_zone(j public.assignment_blocks)
returns text language plpgsql stable security definer set search_path='' as $$
declare b public.referral_bookings; prop public.portal_properties; addr text:=nullif(trim(j.address),''); st text; city text; v_lat double precision; v_lon double precision; z text; distance double precision; m jsonb:=coalesce(j.metadata,'{}');
begin
 select * into b from public.referral_bookings where id=j.id or id::text=m->>'residential_booking_id' limit 1;
 if found then addr:=concat_ws(', ',b.property_address,b.city,b.state,b.zip);city:=b.city;st:=b.state;
 else
  select * into prop from public.portal_properties where id=j.portal_property_id or id=j.property_id limit 1;
  if found then addr:=coalesce(addr,nullif(prop.address,''));city:=prop.city;st:=prop.state;end if;
 end if;
 st:=upper(trim(coalesce(nullif(st,''),nullif(m->>'state',''),(regexp_match(coalesce(addr,''),'\m([A-Z]{2})\s+[0-9]{5}\M'))[1],'')));
 if st not in ('NC','NORTH CAROLINA') then return null; end if;
 v_lat:=j.site_latitude;v_lon:=j.site_longitude;
 if v_lat is null or v_lon is null then
  select g.latitude,g.longitude into v_lat,v_lon from public.map_geocodes g where g.address_key=encode(sha256(convert_to(upper(regexp_replace(trim(addr),'\s+',' ','g')),'UTF8')),'hex') and g.result='matched';
 end if;
 if v_lat is not null and v_lon is not null then
  select x.zone,3958.7613*2*asin(sqrt(least(1.0,power(sin(radians(x.lat-v_lat)/2),2)+cos(radians(v_lat))*cos(radians(x.lat))*power(sin(radians(x.lon-v_lon)/2),2)))) into z,distance
  from (values ('NC:Durham',35.994::float8,-78.8986::float8),('NC:Raleigh',35.7796,-78.6382),('NC:Asheville',35.5951,-82.5515),('NC:Greensboro',36.0726,-79.792)) x(zone,lat,lon)
  order by 3958.7613*2*asin(sqrt(least(1.0,power(sin(radians(x.lat-v_lat)/2),2)+cos(radians(v_lat))*cos(radians(x.lat))*power(sin(radians(x.lon-v_lon)/2),2)))) limit 1;
  return case when distance<=25 then z end;
 end if;
 -- Exact known NC city only for legacy jobs without stored coordinates; never substring match a street name.
 city:=coalesce(nullif(trim(city),''),nullif(m->>'service_city',''),nullif(m->>'city',''),(regexp_match(coalesce(addr,''),',\s*(Durham|Raleigh|Asheville|Greensboro)\s*,?\s+(NC|North Carolina)\M','i'))[1]);
 return turnly_private.canonical_job_zone(city);
end;
$$;
create or replace function public.contractor_assignment_matches_scope(target public.assignment_blocks,target_contractor_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; z text; m jsonb:=coalesce(target.metadata,'{}');
begin
 if auth.uid() is not null and auth.uid()<>target_contractor_id and not public.current_profile_is_admin() then return false;end if;
 select * into p from public.profiles where id=target_contractor_id and role::text='contractor' and status='active';
 if not found then return false;end if;
 z:=turnly_private.assignment_job_zone(target);
 if z is null or not (z=any(turnly_private.contractor_selected_zones(p))) then return false;end if;
 -- Explicit property restrictions remain additional restrictions, never a way around the zone.
 if cardinality(p.allowed_property_ids)>0 or cardinality(p.allowed_property_names)>0 then
  return exists(select 1 from unnest(p.allowed_property_ids) id where id=any(array[target.property_id,target.portal_property_id,target.recurring_property_id,target.recurring_portal_property_id]) or id::text=any(array[m->>'property_id',m->>'portal_property_id',m->>'recurring_property_id',m->>'recurring_portal_property_id',m->>'client_id',m->>'contract_id']))
  or exists(select 1 from unnest(p.allowed_property_names) n where lower(trim(n))=any(array[lower(trim(target.property_name)),lower(trim(m->>'property_name')),lower(trim(m->>'client_name'))]));
 end if;
 return true;
end;
$$;
revoke all on function public.contractor_assignment_matches_scope(public.assignment_blocks,uuid) from public,anon;
grant execute on function public.contractor_assignment_matches_scope(public.assignment_blocks,uuid) to authenticated,service_role;

create or replace function public.contractor_job_board(p_actor uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(j)||jsonb_build_object('contractor_service_zone',turnly_private.assignment_job_zone(j),'contractor_job_category',case when j.metadata->>'source'='residential_booking' or j.metadata->>'scope_type'='residential' or nullif(j.metadata->>'residential_booking_id','') is not null then 'residential' else 'commercial' end) order by j.start_window,j.id),'[]'::jsonb)
 from public.assignment_blocks j where j.status in ('open','preferred_pending') and j.claimed_by is null and (j.assigned_to is null or j.assigned_to=p_actor)
 and (coalesce(j.visibility,'open')='open' or p_actor=any(coalesce(j.preferred_contractor_ids,'{}'::uuid[])))
 and p_actor<>all(coalesce(j.declined_contractor_ids,'{}'::uuid[]))
 and public.contractor_assignment_matches_scope(j,p_actor)
 and exists(select 1 from public.profiles p where p.id=p_actor and p.contractor_approved=true);
$$;
revoke all on function public.contractor_job_board(uuid) from public,anon,authenticated;
grant execute on function public.contractor_job_board(uuid) to service_role;
revoke all on function turnly_private.canonical_job_zone(text),turnly_private.contractor_selected_zones(public.profiles),turnly_private.assignment_job_zone(public.assignment_blocks) from public,anon,authenticated;
grant usage on schema turnly_private to service_role;
grant execute on function turnly_private.canonical_job_zone(text),turnly_private.contractor_selected_zones(public.profiles),turnly_private.assignment_job_zone(public.assignment_blocks) to service_role;
