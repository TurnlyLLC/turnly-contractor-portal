create or replace function public.gift_admin_search_v2(p_mode text default 'cards', p_search text default '', p_status text default '', p_from date default null, p_to date default null, p_page integer default 1, p_size integer default 25, p_sort text default 'newest',p_unassigned boolean default false)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb; term text; code_term text; page_size integer:=least(100,greatest(1,coalesce(p_size,25))); page_no integer:=greatest(1,coalesce(p_page,1));
begin
 if p_mode not in ('cards','orders') or p_sort not in ('newest','oldest') then raise exception 'Invalid search options'; end if;
 if p_from > p_to then raise exception 'Start date must be before end date'; end if;
 term:='%'||replace(replace(replace(left(trim(coalesce(p_search,'')),160),'\','\\'),'%','\%'),'_','\_')||'%';
 code_term:=replace(replace(upper(term),' ',''),'-','');
 if p_mode='cards' then
 with filtered as materialized (
  select c.*, o.service_zone,o.name,o.email,o.email_status,o.paid_at,o.status order_status
  from gift_cards c join gift_orders o on o.id=c.order_id
  where (not coalesce(p_unassigned,false) or o.service_zone is null) and (p_status='' or c.status=p_status)
   and (p_from is null or o.paid_at >= (p_from::timestamp at time zone 'America/New_York'))
   and (p_to is null or o.paid_at < ((p_to+1)::timestamp at time zone 'America/New_York'))
   and (p_search='' or o.name ilike term or o.email ilike term or c.order_id::text ilike term or c.code ilike code_term)
 ), paged as (
  select * from filtered order by case when p_sort='newest' then paid_at end desc,case when p_sort='oldest' then paid_at end asc,id
  limit page_size offset (page_no::bigint-1)*page_size
 ) select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)) from paged p),'[]'::jsonb), 'total',count(*),'page',page_no,'size',page_size,
  'summary',jsonb_build_object('remaining',coalesce(sum(balance_cents),0),'reserved',coalesce(sum(reserved_cents),0),'available',coalesce(sum(case when status='active' then balance_cents-reserved_cents else 0 end),0))) into result from filtered;
 else
 with filtered as materialized (
  select o.service_zone,o.id,o.name,o.email,o.quantity,o.amount_cents,o.status,o.email_status,o.created_at,o.paid_at
  from gift_orders o where (not coalesce(p_unassigned,false) or o.service_zone is null) and (p_status='' or o.status=p_status)
   and (p_from is null or coalesce(o.paid_at,o.created_at) >= (p_from::timestamp at time zone 'America/New_York'))
   and (p_to is null or coalesce(o.paid_at,o.created_at) < ((p_to+1)::timestamp at time zone 'America/New_York'))
   and (p_search='' or o.name ilike term or o.email ilike term or o.id::text ilike term or exists(select 1 from gift_cards c where c.order_id=o.id and c.code ilike code_term))
 ), paged as (
  select * from filtered order by case when p_sort='newest' then coalesce(paid_at,created_at) end desc,case when p_sort='oldest' then coalesce(paid_at,created_at) end asc,id
  limit page_size offset (page_no::bigint-1)*page_size
 ) select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)) from paged p),'[]'::jsonb),'total',count(*),'page',page_no,'size',page_size,
  'summary',jsonb_build_object('paid',coalesce(sum(amount_cents) filter(where status='paid'),0),'pending',count(*) filter(where status='pending'),'review',count(*) filter(where status='review'))) into result from filtered;
 end if;
 return result;
end $$;
revoke all on function public.gift_admin_search_v2(text,text,text,date,date,integer,integer,text,boolean) from public,anon,authenticated;
grant execute on function public.gift_admin_search_v2(text,text,text,date,date,integer,integer,text,boolean) to service_role;

create or replace function public.gift_bulk_assign_service_area(p_actor uuid,p_orders jsonb,p_zone text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item jsonb; n int;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role::text='admin' and status='active') then raise exception 'Active admin access required'; end if;
 if jsonb_typeof(p_orders) is distinct from 'array' then raise exception 'Select purchases first'; end if;
 n:=jsonb_array_length(p_orders);
 if n<1 or n>100 then raise exception 'Select between 1 and 100 purchases'; end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_orders))<>n then raise exception 'Duplicate or missing purchase IDs'; end if;
 for item in select value from jsonb_array_elements(p_orders) order by value->>'id' loop
  if not item ? 'expected_zone' then raise exception 'Refresh purchases before saving'; end if;
  perform public.gift_assign_service_area(p_actor,(item->>'id')::uuid,p_zone,item->>'expected_zone');
 end loop;
 return jsonb_build_object('ok',true,'updated',n,'service_zone',p_zone);
end;$$;
revoke all on function public.gift_bulk_assign_service_area(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.gift_bulk_assign_service_area(uuid,jsonb,text) to service_role;
notify pgrst,'reload schema';
