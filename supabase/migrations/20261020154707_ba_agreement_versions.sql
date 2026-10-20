-- Keep every executed agreement immutable; W-9 remains a single signed record.
alter table public.ba_documents drop constraint ba_documents_user_id_kind_key;
alter table public.ba_documents add constraint ba_documents_user_kind_version_key unique(user_id,kind,version);
create unique index ba_documents_one_w9 on public.ba_documents(user_id) where kind='w9';
alter table public.ba_document_drafts add column version text not null default '';
update public.ba_document_drafts set version=case when kind='w9' then 'irs-w9-2024-03' else 'ambassador-agreement-2026-10-19-v1' end;

-- Preserve agreements signed through the legacy onboarding workflow before its
-- current-agreement summary is updated by a renewal.
insert into public.ba_documents(user_id,kind,version,data,signature_name,signed_at,content_hash)
select user_id,'agreement',agreement_version,jsonb_build_object('text',agreement_text),
 signature_name,signed_at,md5(agreement_text)
from public.ba_onboarding o
where signed_at is not null and agreement_version is not null and agreement_text is not null
 and not exists(select 1 from public.ba_documents d where d.user_id=o.user_id and d.kind='agreement' and d.version=o.agreement_version);

create function public.ba_save_document_version(p_user uuid,p_kind text,p_revision integer,p_data jsonb,p_version text)
returns integer language plpgsql security invoker set search_path='' as $$
declare v integer;
begin
 perform 1 from public.ba_members where user_id=p_user and enabled for update;
 if not found then raise exception 'Account inactive';end if;
 if p_kind not in ('agreement','w9') or coalesce(p_version,'')='' then raise exception 'Document version required';end if;
 if exists(select 1 from public.ba_documents where user_id=p_user and kind=p_kind and (version=p_version or p_kind='w9')) then raise exception 'Document already signed';end if;
 insert into public.ba_document_drafts(user_id,kind)values(p_user,p_kind)on conflict do nothing;
 update public.ba_document_drafts set data=p_data,version=p_version,revision=revision+1,updated_at=now()
 where user_id=p_user and kind=p_kind and revision=p_revision returning revision into v;
 if v is null then raise exception 'Document changed in another tab. Reload before editing.';end if;return v;
end $$;

create function public.ba_sign_document_version(p_user uuid,p_kind text,p_revision integer,p_data jsonb,p_name text,p_version text,p_hash text,p_path text,p_session uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v uuid;
begin
 perform 1 from public.ba_members where user_id=p_user and enabled for update;
 if not found then raise exception 'Account inactive';end if;
 if p_kind not in ('agreement','w9') or coalesce(p_version,'')='' then raise exception 'Document version required';end if;
 select id into v from public.ba_documents where user_id=p_user and kind=p_kind and (version=p_version or p_kind='w9');
 if v is not null then return v;end if;
 perform 1 from public.ba_document_drafts where user_id=p_user and kind=p_kind and revision=p_revision and version=p_version for update;
 if not found then raise exception 'Document changed. Reload and review before signing.';end if;
 insert into public.ba_documents(user_id,kind,version,data,signature_name,content_hash,storage_path,session_id)
 values(p_user,p_kind,p_version,p_data,p_name,p_hash,p_path,p_session)returning id into v;
 insert into public.ba_onboarding(user_id)values(p_user)on conflict do nothing;
 if p_kind='agreement' then
  update public.ba_onboarding set agreement_version=p_version,agreement_text=p_data->>'text',signature_name=p_name,signed_at=now(),marketing_ack=true,insurance_ack=true,payout_ack=true,updated_at=now()where user_id=p_user;
 else
  if p_path is null then raise exception 'W-9 record is missing';end if;
  update public.ba_onboarding set w9_path=p_path,w9_received_at=now(),updated_at=now()where user_id=p_user;
 end if;
 return v;
end $$;
revoke all on function public.ba_save_document_version(uuid,text,integer,jsonb,text),public.ba_sign_document_version(uuid,text,integer,jsonb,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.ba_save_document_version(uuid,text,integer,jsonb,text),public.ba_sign_document_version(uuid,text,integer,jsonb,text,text,text,text,uuid) to service_role;
