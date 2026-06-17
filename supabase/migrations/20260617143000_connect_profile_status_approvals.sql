-- Align account approvals with the current profiles.status field.
-- This is safe to run more than once.

alter table public.profiles
  add column if not exists status text not null default 'pending',
  add column if not exists contractor_approved boolean not null default false,
  add column if not exists property_manager_property_id uuid;

update public.profiles
set status = 'pending'
where lower(replace(coalesce(role, ''), ' ', '_')) in ('contractor', 'property_manager')
  and coalesce(nullif(trim(status), ''), 'inactive') in ('inactive', 'pending');

update public.profiles
set status = 'active',
    contractor_approved = true
where lower(replace(coalesce(role, ''), ' ', '_')) not in ('contractor', 'property_manager')
  and coalesce(nullif(trim(status), ''), 'inactive') in ('inactive', 'pending');

update public.profiles
set status = 'active'
where contractor_approved = true
  and coalesce(nullif(trim(status), ''), 'pending') <> 'active';

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and lower(replace(coalesce(role, ''), ' ', '_')) = 'admin'
  );
$$;

grant execute on function public.current_user_is_admin() to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Profiles are readable by admins and owners'
  ) then
    create policy "Profiles are readable by admins and owners"
    on public.profiles
    for select
    using (id = auth.uid() or public.current_user_is_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Profiles are updateable by admins'
  ) then
    create policy "Profiles are updateable by admins"
    on public.profiles
    for update
    using (public.current_user_is_admin())
    with check (public.current_user_is_admin());
  end if;
end $$;
