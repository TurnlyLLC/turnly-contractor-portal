-- Ensure contractor signups become pending profile rows that admins can approve.

alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists role text;
alter table public.profiles add column if not exists status text;
alter table public.profiles add column if not exists contractor_approved boolean default false;
alter table public.profiles add column if not exists property_manager_property_id uuid;

alter table public.profiles alter column status set default 'pending';
alter table public.profiles alter column contractor_approved set default false;

update public.profiles
set status = 'pending'
where status is null or btrim(status) = '';

update public.profiles
set contractor_approved = true
where lower(replace(coalesce(role::text, ''), ' ', '_')) = 'contractor'
  and lower(coalesce(status::text, '')) in ('active', 'approved', 'enabled')
  and contractor_approved is distinct from true;

alter table public.profiles alter column status set not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_role text;
  profile_status text;
  profile_name text;
begin
  profile_role := lower(regexp_replace(coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'contractor'), '[\s-]+', '_', 'g'));
  profile_status := coalesce(
    nullif(new.raw_user_meta_data->>'status', ''),
    case
      when profile_role in ('contractor', 'property_manager') then 'pending'
      else 'active'
    end
  );
  profile_name := nullif(new.raw_user_meta_data->>'full_name', '');

  if profile_name is null then
    profile_name := nullif(
      btrim(concat(
        coalesce(new.raw_user_meta_data->>'first_name', ''),
        ' ',
        coalesce(new.raw_user_meta_data->>'last_name', '')
      )),
      ''
    );
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    phone,
    role,
    status,
    contractor_approved
  )
  values (
    new.id,
    new.email,
    profile_name,
    nullif(new.raw_user_meta_data->>'phone', ''),
    profile_role,
    profile_status,
    profile_status in ('active', 'approved', 'enabled')
  )
  on conflict (id) do update
  set
    email = coalesce(public.profiles.email, excluded.email),
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    phone = coalesce(public.profiles.phone, excluded.phone),
    role = coalesce(public.profiles.role, excluded.role),
    status = case
      when excluded.status = 'pending'
        and lower(replace(coalesce(excluded.role::text, ''), ' ', '_')) in ('contractor', 'property_manager')
        then 'pending'
      when public.profiles.status is null or btrim(public.profiles.status::text) = ''
        then excluded.status
      else public.profiles.status
    end,
    contractor_approved = case
      when excluded.status = 'pending'
        and lower(replace(coalesce(excluded.role::text, ''), ' ', '_')) = 'contractor'
        then false
      else coalesce(public.profiles.contractor_approved, excluded.contractor_approved)
    end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists zz_turnly_profile_status_guard on auth.users;

create trigger zz_turnly_profile_status_guard
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_profile_is_admin()
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
      and lower(replace(coalesce(role::text, ''), ' ', '_')) = 'admin'
  );
$$;

alter table public.profiles enable row level security;

drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles"
  on public.profiles
  for select
  to authenticated
  using (public.current_profile_is_admin() or id = auth.uid());

drop policy if exists "Admins can update account approvals" on public.profiles;
create policy "Admins can update account approvals"
  on public.profiles
  for update
  to authenticated
  using (public.current_profile_is_admin() or id = auth.uid())
  with check (
    public.current_profile_is_admin()
    or (
      id = auth.uid()
      and (
        (
          lower(replace(coalesce(role::text, ''), ' ', '_')) in ('contractor', 'property_manager')
          and lower(coalesce(status::text, '')) = 'pending'
        )
        or (
          lower(replace(coalesce(role::text, ''), ' ', '_')) not in ('contractor', 'property_manager')
          and lower(coalesce(status::text, '')) = 'active'
        )
      )
    )
  );

drop policy if exists "Users can create own signup profile" on public.profiles;
create policy "Users can create own signup profile"
  on public.profiles
  for insert
  to authenticated
  with check (
    id = auth.uid()
    and (
      (
        lower(replace(coalesce(role::text, ''), ' ', '_')) in ('contractor', 'property_manager')
        and lower(coalesce(status::text, '')) = 'pending'
      )
      or (
        lower(replace(coalesce(role::text, ''), ' ', '_')) not in ('contractor', 'property_manager')
        and lower(coalesce(status::text, '')) = 'active'
      )
    )
  );

grant select, insert, update on public.profiles to authenticated;
