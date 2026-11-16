create or replace function public.integration_use_key(p_hash text,p_scope text) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare k integration_keys; n integer;
begin
 select * into k from integration_keys where secret_hash=p_hash and workspace='turnly' and revoked_at is null and expires_at>now() for update;
 if k.id is null or not exists(select 1 from profiles where id=k.created_by and role::text in ('admin','owner','super_admin') and status='active') then return null; end if;
 if not p_scope=any(k.scopes) then raise exception 'scope_denied'; end if;
 insert into integration_rate values(k.id,date_trunc('minute',now()),1)
 on conflict(key_id) do update set bucket=excluded.bucket,requests=case when integration_rate.bucket=excluded.bucket then integration_rate.requests+1 else 1 end returning requests into n;
 if n>60 then return '00000000-0000-0000-0000-000000000000'::uuid; end if;
 update integration_keys set last_used_at=now() where id=k.id;
 return k.id;
end $$;
create or replace function integration_private.enqueue_event() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare kind text; body jsonb;
begin
 kind:=case when tg_table_name='sales_leads' then 'lead' else 'booking' end||case when tg_op='INSERT' then '.created' else '.updated' end;
 if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new; end if;
 if tg_table_name='sales_leads' and to_jsonb(new)->>'business_segment'<>'residential' then return new; end if;
 body:=jsonb_build_object('resource_id',new.id,'resource',case when tg_table_name='sales_leads' then 'leads' else 'bookings' end);
 insert into integration_deliveries(hook_id,event_type,payload)
 select h.id,kind,body from integration_hooks h join profiles p on p.id=h.created_by
 where h.enabled and kind=any(h.events) and p.role::text in ('admin','owner','super_admin') and p.status='active';
 return new;
end $$;
