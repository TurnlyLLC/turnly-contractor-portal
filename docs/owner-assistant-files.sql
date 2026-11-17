insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values('alice-inbox','alice-inbox',false,5242880,array['application/pdf','image/jpeg','image/png','image/webp'])on conflict(id)do nothing;
create table public.owner_assistant_files(id uuid primary key,owner_id uuid not null references public.profiles(id),path text not null unique,file_name text not null,content_type text not null,file_size integer not null check(file_size between 1 and 5242880),sha256 text not null,source text not null,created_at timestamptz not null default now());
create index owner_assistant_files_owner on public.owner_assistant_files(owner_id,id);
alter table public.owner_assistant_files enable row level security;
revoke all on public.owner_assistant_files from public,anon,authenticated;
grant all on public.owner_assistant_files to service_role;
notify pgrst,'reload schema';

create or replace function public.owner_sms_enqueue(p_id uuid,p_sid text,p_owner uuid,p_body text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare previous owner_sms_messages; cfg owner_sms_settings;
begin
 perform pg_advisory_xact_lock(hashtext('turnly-private-owner-voice'));
 select * into cfg from owner_sms_settings where id;
 if not cfg.enabled or cfg.opted_out or cfg.agent_id is null then return jsonb_build_object('blocked','disabled');end if;
 if p_sid !~ '^(SM|MM)[a-fA-F0-9]{32}$' or not exists(select 1 from profiles where id=p_owner and role::text='admin' and status='active') then return jsonb_build_object('blocked','owner');end if;
 select * into previous from owner_sms_messages where message_sid=p_sid;
 if found then return jsonb_build_object('id',previous.id,'replayed',true);end if;
 if owner_assistant_reserved()+50>2500 then return jsonb_build_object('blocked','budget');end if;
 if (select count(*) from owner_sms_messages where created_at>now()-interval '1 minute')>=3 then return jsonb_build_object('blocked','rate');end if;
 insert into owner_sms_messages(id,message_sid,owner_id,body_sealed) values(p_id,p_sid,p_owner,p_body);
 return jsonb_build_object('id',p_id);
end;$$;
