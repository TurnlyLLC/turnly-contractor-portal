alter table public.recruiting_applications add column enrollment_hash text;
create table public.ba_document_drafts(user_id uuid references public.ba_members(user_id),kind text check(kind in ('agreement','w9')),revision integer not null default 0,data jsonb not null default '{}',updated_at timestamptz not null default now(),primary key(user_id,kind));
create table public.ba_documents(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.ba_members(user_id),kind text not null check(kind in ('agreement','w9')),version text not null,data jsonb not null,signature_name text not null,signed_at timestamptz not null default now(),content_hash text not null,storage_path text,session_id uuid,unique(user_id,kind));
alter table public.ba_document_drafts enable row level security;
alter table public.ba_documents enable row level security;
revoke all on public.ba_document_drafts,public.ba_documents from public,anon,authenticated;
grant select,insert,update on public.ba_document_drafts to service_role;
grant select,insert on public.ba_documents to service_role;
create function public.ba_save_document(p_user uuid,p_kind text,p_revision integer,p_data jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare v integer;
begin
 perform 1 from public.ba_members where user_id=p_user and enabled for update;
 if not found then raise exception 'Account inactive';end if;
 if exists(select 1 from public.ba_documents where user_id=p_user and kind=p_kind) then raise exception 'Document already signed';end if;
 insert into public.ba_document_drafts(user_id,kind)values(p_user,p_kind)on conflict do nothing;
 update public.ba_document_drafts set data=p_data,revision=revision+1,updated_at=now() where user_id=p_user and kind=p_kind and revision=p_revision returning revision into v;
 if v is null then raise exception 'Document changed in another tab. Reload before editing.';end if;return v;
end $$;
create function public.ba_sign_document(p_user uuid,p_kind text,p_revision integer,p_data jsonb,p_name text,p_version text,p_hash text,p_path text,p_session uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare v uuid;
begin
 perform 1 from public.ba_members where user_id=p_user and enabled for update;
 if not found then raise exception 'Account inactive';end if;
 select id into v from public.ba_documents where user_id=p_user and kind=p_kind;
 if v is not null then return v;end if;
 perform 1 from public.ba_document_drafts where user_id=p_user and kind=p_kind and revision=p_revision for update;
 if not found then raise exception 'Document changed. Reload and review before signing.';end if;
 insert into public.ba_documents(user_id,kind,version,data,signature_name,content_hash,storage_path,session_id)values(p_user,p_kind,p_version,p_data,p_name,p_hash,p_path,p_session)returning id into v;
 insert into public.ba_onboarding(user_id)values(p_user)on conflict do nothing;
 if p_kind='agreement' then
 update public.ba_onboarding set agreement_version=p_version,agreement_text=p_data->>'text',signature_name=p_name,signed_at=now(),marketing_ack=true,insurance_ack=true,payout_ack=true,updated_at=now()where user_id=p_user;
 else
 if p_path is null then raise exception 'W-9 record is missing';end if;
 update public.ba_onboarding set w9_path=p_path,w9_received_at=now(),updated_at=now()where user_id=p_user;
 end if;
 return v;
end $$;
revoke all on function public.ba_save_document(uuid,text,integer,jsonb),public.ba_sign_document(uuid,text,integer,jsonb,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.ba_save_document(uuid,text,integer,jsonb),public.ba_sign_document(uuid,text,integer,jsonb,text,text,text,text,uuid) to service_role;
