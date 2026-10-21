-- Private encrypted drafts. Signed records remain in the mobile onboarding service.
create table public.contractor_onboarding_drafts (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null check (length(item_id) between 1 and 120),
  revision integer not null default 1,
  ciphertext text not null check(length(ciphertext) <= 300000),
  updated_at timestamptz not null default now(),
  primary key(profile_id,item_id)
);
alter table public.contractor_onboarding_drafts enable row level security;
revoke all on public.contractor_onboarding_drafts from public,anon,authenticated;
grant select,insert,update,delete on public.contractor_onboarding_drafts to service_role;

create function public.save_contractor_onboarding_draft(p_profile uuid,p_item text,p_revision integer,p_ciphertext text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare r integer;
begin
  if p_revision = 0 then
    insert into public.contractor_onboarding_drafts(profile_id,item_id,ciphertext)
    values(p_profile,p_item,p_ciphertext) on conflict do nothing returning revision into r;
  else
    update public.contractor_onboarding_drafts set ciphertext=p_ciphertext,revision=revision+1,updated_at=now()
    where profile_id=p_profile and item_id=p_item and revision=p_revision returning revision into r;
  end if;
  if r is null then raise exception 'Draft changed in another window. Reopen the form before editing.'; end if;
  return r;
end $$;
revoke all on function public.save_contractor_onboarding_draft(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.save_contractor_onboarding_draft(uuid,text,integer,text) to service_role;
