-- Add review metadata without changing or removing any existing contractor records.
alter table public.profiles
  add column if not exists onboarding_override boolean not null default false,
  add column if not exists onboarding_override_reason text not null default '',
  add column if not exists onboarding_override_by uuid references public.profiles(id),
  add column if not exists onboarding_override_at timestamptz;

alter table public.contractor_documents
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_notes text not null default '';

create schema if not exists contractor_private;
revoke all on schema contractor_private from public, anon, authenticated;

-- Existing self-profile editing must never allow someone to grant their own override.
create or replace function contractor_private.protect_override()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated')
     and not public.current_profile_is_admin() then
    if tg_op = 'INSERT' then
      new.onboarding_override := false;
      new.onboarding_override_reason := '';
      new.onboarding_override_by := null;
      new.onboarding_override_at := null;
    else
      new.onboarding_override := old.onboarding_override;
      new.onboarding_override_reason := old.onboarding_override_reason;
      new.onboarding_override_by := old.onboarding_override_by;
      new.onboarding_override_at := old.onboarding_override_at;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function contractor_private.protect_override() from public, anon, authenticated;
create trigger protect_contractor_onboarding_override
before insert or update on public.profiles
for each row execute function contractor_private.protect_override();

-- Server-only transactional decisions. The API authenticates the actor; this also
-- verifies their stored profile. No user-editable auth metadata is trusted.
create or replace function public.review_contractor_account(
  p_actor uuid, p_profile uuid, p_action text, p_reason text default ''
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare before_row public.profiles; after_row public.profiles;
begin
  if not exists (select 1 from public.profiles where id=p_actor
    and role::text='admin' and status='active') then
    raise exception 'Active admin access is required';
  end if;
  select * into before_row from public.profiles where id=p_profile and role::text='contractor' for update;
  if not found then raise exception 'Contractor account not found'; end if;
  if p_action not in ('approve','override','remove_override') then raise exception 'Invalid review action'; end if;
  if before_row.status in ('deleted','deletion_pending','disabled','suspended') then
    raise exception 'This account cannot be approved from onboarding';
  end if;
  if p_action in ('override','remove_override') and length(trim(p_reason)) < 5 then
    raise exception 'Enter a reason for the override decision';
  end if;
  if length(p_reason)>1000 then raise exception 'Review reason is too long'; end if;

  update public.profiles set
    onboarding_override=case when p_action='override' then true when p_action='remove_override' then false else onboarding_override end,
    onboarding_override_reason=case when p_action<>'approve' then trim(p_reason) else onboarding_override_reason end,
    onboarding_override_by=case when p_action<>'approve' then p_actor else onboarding_override_by end,
    onboarding_override_at=case when p_action<>'approve' then now() else onboarding_override_at end,
    contractor_approved=p_action<>'remove_override',
    approval_status=case when p_action='remove_override' then 'pending' else 'approved' end,
    status=case when p_action='remove_override' then 'pending' else 'active' end,
    contractor_approved_by=p_actor,
    contractor_approved_at=case when p_action='remove_override' then null else now() end
  where id=p_profile returning * into after_row;
  update public.contractors set contractor_approved=after_row.contractor_approved,
    approval_status=after_row.approval_status, status=after_row.status
    where profile_id=p_profile;
  insert into public.admin_audit_log(actor_id,action,entity,entity_id,before_value,after_value,source)
    values(p_actor,'contractor_'||p_action,'profiles',p_profile::text,
      jsonb_build_object('status',before_row.status,'override',before_row.onboarding_override),
      jsonb_build_object('status',after_row.status,'override',after_row.onboarding_override,'reason',p_reason),'contractor_directory');
  return jsonb_build_object('ok',true,'status',after_row.status);
end;
$$;
revoke all on function public.review_contractor_account(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_contractor_account(uuid,uuid,text,text) to service_role;

create or replace function public.review_contractor_document(
  p_actor uuid,p_document uuid,p_status text,p_reason text default '',p_expected_updated_at timestamptz default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare doc public.contractor_documents;
begin
  if not exists (select 1 from public.profiles where id=p_actor and role::text='admin' and status='active') then
    raise exception 'Active admin access is required';
  end if;
  if p_status not in ('approved','rejected') then raise exception 'Invalid document decision'; end if;
  if length(p_reason)>1000 then raise exception 'Review note is too long'; end if;
  if p_status='rejected' and length(trim(p_reason))<5 then raise exception 'Enter a reason so the contractor can correct the document'; end if;
  select * into doc from public.contractor_documents where id=p_document for update;
  if not found then raise exception 'Document not found'; end if;
  if p_expected_updated_at is null or doc.updated_at is distinct from p_expected_updated_at then
    raise exception 'This upload changed. Refresh and review the latest file';
  end if;
  if p_status='approved' and (coalesce(doc.storage_path,'')='' or doc.expiration_date<current_date) then
    raise exception 'An uploaded, unexpired file is required for approval';
  end if;
  update public.contractor_documents set status=p_status,reviewed_by=p_actor,reviewed_at=now(),review_notes=trim(p_reason) where id=p_document;
  insert into public.admin_audit_log(actor_id,action,entity,entity_id,before_value,after_value,source)
    values(p_actor,'document_'||p_status,'contractor_documents',p_document::text,
      jsonb_build_object('status',doc.status),jsonb_build_object('status',p_status,'reason',p_reason),'contractor_directory');
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.review_contractor_document(uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.review_contractor_document(uuid,uuid,text,text,timestamptz) to service_role;
notify pgrst, 'reload schema';
