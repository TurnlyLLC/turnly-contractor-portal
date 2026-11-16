-- Turnly-only integration boundary. Do not provision other tenants against these tables.
create table public.integration_keys (
 id uuid primary key default gen_random_uuid(), name text not null,
 workspace text not null default 'turnly' check(workspace='turnly'),
 secret_hash text not null unique, prefix text not null, scopes text[] not null,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 expires_at timestamptz not null, revoked_at timestamptz, last_used_at timestamptz,
 check(scopes <@ array['leads:read','leads:create','bookings:read']::text[])
);
create table public.integration_hooks (
 id uuid primary key, name text not null, url text not null, secret_encrypted text not null,
 events text[] not null check(events <@ array['lead.created','lead.updated','booking.created','booking.updated']::text[]),
 enabled boolean not null default true, created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
create table public.integration_deliveries (
 id uuid primary key default gen_random_uuid(), hook_id uuid not null references public.integration_hooks(id),
 event_type text not null, payload jsonb not null, status text not null default 'pending'
 check(status in ('pending','sending','delivered','failed','cancelled')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
 last_status integer, last_error text, created_at timestamptz not null default now(), delivered_at timestamptz
);
create index integration_delivery_due on public.integration_deliveries(next_attempt_at) where status in ('pending','sending');
create table public.integration_rate (key_id uuid primary key references public.integration_keys(id), bucket timestamptz not null, requests integer not null);
create table public.integration_requests (key_id uuid not null references public.integration_keys(id), request_key text not null, body_hash text not null, lead_id uuid not null references public.sales_leads(id), primary key(key_id,request_key));
alter table public.integration_keys enable row level security;
alter table public.integration_hooks enable row level security;
alter table public.integration_deliveries enable row level security;
alter table public.integration_rate enable row level security;
alter table public.integration_requests enable row level security;
revoke all on public.integration_keys,public.integration_hooks,public.integration_deliveries,public.integration_rate,public.integration_requests from public,anon,authenticated;
grant all on public.integration_keys,public.integration_hooks,public.integration_deliveries,public.integration_rate,public.integration_requests to service_role;

create function public.integration_use_key(p_hash text,p_scope text) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare k integration_keys; n integer;
begin
 select * into k from integration_keys where secret_hash=p_hash and workspace='turnly' and revoked_at is null and expires_at>now() for update;
 if k.id is null or not exists(select 1 from profiles where id=k.created_by and role in ('admin','owner','super_admin') and status='active') then return null; end if;
 if not p_scope=any(k.scopes) then raise exception 'scope_denied'; end if;
 insert into integration_rate values(k.id,date_trunc('minute',now()),1)
 on conflict(key_id) do update set bucket=excluded.bucket,requests=case when integration_rate.bucket=excluded.bucket then integration_rate.requests+1 else 1 end returning requests into n;
 if n>60 then return '00000000-0000-0000-0000-000000000000'::uuid; end if;
 update integration_keys set last_used_at=now() where id=k.id;
 return k.id;
end $$;
revoke all on function public.integration_use_key(text,text) from public,anon,authenticated;
grant execute on function public.integration_use_key(text,text) to service_role;

create function public.integration_create_lead(p_key uuid,p_request text,p_hash text,p_data jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare previous integration_requests; found_id uuid; owner_id uuid; was_created boolean:=false;
begin
 select created_by into owner_id from integration_keys where id=p_key and revoked_at is null and expires_at>now() and 'leads:create'=any(scopes) for update;
 if owner_id is null then raise exception 'key_inactive'; end if;
 perform pg_advisory_xact_lock(719261);
 select * into previous from integration_requests where key_id=p_key and request_key=p_request;
 if previous.lead_id is not null then
  if previous.body_hash<>p_hash then raise exception 'idempotency_conflict'; end if;
  return jsonb_build_object('id',previous.lead_id,'created',false,'replayed',true);
 end if;
 select id into found_id from sales_leads where business_segment='residential' and (
  (p_data->>'contact_email'<>'' and lower(contact_email)=lower(p_data->>'contact_email')) or
  (p_data->>'contact_phone'<>'' and right(regexp_replace(contact_phone,'[^0-9]','','g'),10)=right(regexp_replace(p_data->>'contact_phone','[^0-9]','','g'),10) and lower(name)=lower(p_data->>'name'))
 ) order by created_at limit 1;
 if found_id is null then
  insert into sales_leads(created_by,property_name,name,contact_name,contact_email,contact_phone,sales_city,sales_state,lead_source,business_segment,prospect_type,pipeline_stage)
  values(owner_id,p_data->>'name',p_data->>'name',p_data->>'name',p_data->>'contact_email',p_data->>'contact_phone',p_data->>'sales_city',p_data->>'sales_state','Integration API','residential','realtor','new_leads') returning id into found_id;
  was_created:=true;
 end if;
 insert into integration_requests values(p_key,p_request,p_hash,found_id);
 return jsonb_build_object('id',found_id,'created',was_created,'replayed',false);
end $$;
revoke all on function public.integration_create_lead(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.integration_create_lead(uuid,text,text,jsonb) to service_role;

create schema if not exists integration_private;
revoke all on schema integration_private from public,anon,authenticated;
create function integration_private.enqueue_event() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare kind text; body jsonb;
begin
 kind:=case when tg_table_name='sales_leads' then 'lead' else 'booking' end||case when tg_op='INSERT' then '.created' else '.updated' end;
 if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new; end if;
 if tg_table_name='sales_leads' and to_jsonb(new)->>'business_segment'<>'residential' then return new; end if;
 body:=jsonb_build_object('resource_id',new.id,'resource',case when tg_table_name='sales_leads' then 'leads' else 'bookings' end);
 insert into integration_deliveries(hook_id,event_type,payload)
 select h.id,kind,body from integration_hooks h join profiles p on p.id=h.created_by
 where h.enabled and kind=any(h.events) and p.role in ('admin','owner','super_admin') and p.status='active';
 return new;
end $$;
revoke all on function integration_private.enqueue_event() from public,anon,authenticated;
create trigger integration_lead_event after insert or update on public.sales_leads for each row execute function integration_private.enqueue_event();
create trigger integration_booking_event after insert or update on public.referral_bookings for each row execute function integration_private.enqueue_event();

create function public.integration_claim_deliveries() returns setof public.integration_deliveries language sql security invoker set search_path=public,pg_temp as $$
 update integration_deliveries set status='failed',last_error='Delivery worker stopped during the final attempt.'
 where status='sending' and attempts>=8 and next_attempt_at<=now();
 update integration_deliveries set status='sending',attempts=attempts+1,next_attempt_at=now()+interval '5 minutes'
 where id in (select id from integration_deliveries where status in ('pending','sending') and next_attempt_at<=now() and attempts<8 order by next_attempt_at for update skip locked limit 10)
 returning *;
$$;
revoke all on function public.integration_claim_deliveries() from public,anon,authenticated;
grant execute on function public.integration_claim_deliveries() to service_role;
