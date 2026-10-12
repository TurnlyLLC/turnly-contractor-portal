-- Mobile requests live in Rork Cloud. Keep their admin decisions here without
-- deleting profiles, documents, assignments, or payment history.
create table public.contractor_deletion_reviews (
  profile_id uuid not null references public.profiles(id),
  requested_at timestamptz not null,
  status text not null check(status in ('processing','approved','declined')),
  reviewed_by uuid not null references public.profiles(id),
  reviewed_at timestamptz not null default now(),
  note text not null default '',
  primary key(profile_id,requested_at)
);
alter table public.contractor_deletion_reviews enable row level security;
revoke all on public.contractor_deletion_reviews from public,anon,authenticated;
grant all on public.contractor_deletion_reviews to service_role;
create policy "Admins can read deletion decisions" on public.contractor_deletion_reviews
  for select to authenticated using (public.current_profile_is_admin());
grant select on public.contractor_deletion_reviews to authenticated;
create index contractor_deletion_review_actor_idx on public.contractor_deletion_reviews(reviewed_by);

create or replace function public.review_contractor_deletion(
  p_actor uuid,p_profile uuid,p_requested_at timestamptz,p_action text,p_note text default ''
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare existing public.contractor_deletion_reviews; target public.profiles;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role::text='admin' and status='active') then
    raise exception 'Active admin access is required';
  end if;
  if p_requested_at is null or p_requested_at>now()+interval '5 minutes' then raise exception 'Invalid request date'; end if;
  if p_action not in ('begin','complete','decline') then raise exception 'Invalid deletion decision'; end if;
  if length(trim(p_note))<5 or length(p_note)>1000 then raise exception 'Enter a review note between 5 and 1,000 characters'; end if;
  select * into target from public.profiles where id=p_profile and role::text='contractor' for update;
  if not found then raise exception 'Contractor account not found'; end if;
  select * into existing from public.contractor_deletion_reviews where profile_id=p_profile and requested_at=p_requested_at;
  if existing.status='approved' then return jsonb_build_object('ok',true,'status','approved'); end if;
  if existing.status='declined' then raise exception 'This request has already been declined'; end if;
  if p_action='decline' and existing.status='processing' then raise exception 'Deletion already started. Retry approval to finish it'; end if;
  if p_action='complete' and existing.status is distinct from 'processing' then raise exception 'Deletion has not started'; end if;

  insert into public.contractor_deletion_reviews(profile_id,requested_at,status,reviewed_by,note)
    values(p_profile,p_requested_at,case p_action when 'begin' then 'processing' when 'complete' then 'approved' else 'declined' end,p_actor,trim(p_note))
    on conflict(profile_id,requested_at) do update set status=excluded.status,reviewed_by=p_actor,reviewed_at=now(),note=excluded.note;
  if p_action in ('begin','complete') then
    update public.profiles set status=case when p_action='begin' then 'deletion_pending' else 'deleted' end,
      contractor_approved=false,approval_status='revoked',onboarding_override=false where id=p_profile;
    update public.contractors set status=case when p_action='begin' then 'deletion_pending' else 'deleted' end,
      contractor_approved=false,approval_status='revoked' where profile_id=p_profile;
  end if;
  insert into public.admin_audit_log(actor_id,action,entity,entity_id,before_value,after_value,source)
    values(p_actor,'contractor_deletion_'||p_action,'profiles',p_profile::text,target.status,
      jsonb_build_object('requested_at',p_requested_at,'note',p_note)::text,'contractor_directory');
  return jsonb_build_object('ok',true,'status',case p_action when 'begin' then 'processing' when 'complete' then 'approved' else 'declined' end);
end;
$$;
revoke all on function public.review_contractor_deletion(uuid,uuid,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.review_contractor_deletion(uuid,uuid,timestamptz,text,text) to service_role;
notify pgrst,'reload schema';
