create table public.owner_email_requests(id uuid primary key,actor uuid not null references public.profiles(id),request_hash text not null,expires_at timestamptz not null,claimed_at timestamptz,created_at timestamptz not null default now());
alter table public.owner_email_requests enable row level security;
revoke all on public.owner_email_requests from public,anon,authenticated;
grant all on public.owner_email_requests to service_role;
create function public.owner_email_claim(p_id uuid,p_actor uuid,p_hash text)returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from profiles where id=p_actor and role::text='admin' and status='active')then return false;end if;
 update owner_email_requests set claimed_at=now() where id=p_id and actor=p_actor and request_hash=p_hash and expires_at>now() and claimed_at is null;
 return found;
end $$;
revoke all on function public.owner_email_claim(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.owner_email_claim(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
