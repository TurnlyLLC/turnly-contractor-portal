-- Add account access gates for portal signups.
-- Contractors must be approved before seeing assignment data.
-- Property managers must be linked to a specific portal property before seeing data.

alter table public.profiles
  add column if not exists contractor_approved boolean,
  add column if not exists property_manager_property_id uuid;

update public.profiles
set contractor_approved = true
where contractor_approved is null
  and role = 'contractor';

update public.profiles
set contractor_approved = true
where contractor_approved is null
  and role <> 'contractor';

alter table public.profiles
  alter column contractor_approved set default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_property_manager_property_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_property_manager_property_id_fkey
      foreign key (property_manager_property_id)
      references public.portal_properties(id)
      on delete set null;
  end if;
end $$;

create index if not exists profiles_property_manager_property_idx
  on public.profiles (property_manager_property_id);

create index if not exists profiles_contractor_approved_idx
  on public.profiles (contractor_approved)
  where role = 'contractor';

create or replace function public.current_user_has_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role::text = any(required_roles)
  );
$$;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_role text;
  selected_first_name text;
  selected_last_name text;
  selected_full_name text;
  selected_phone text;
  selected_contractor_approved boolean;
begin
  selected_role := lower(coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'contractor'));
  selected_role := replace(selected_role, ' ', '_');
  selected_role := replace(selected_role, '-', '_');

  if selected_role not in ('admin', 'contractor', 'sales', 'sales_team', 'property_manager') then
    selected_role := 'contractor';
  end if;

  selected_first_name := coalesce(nullif(new.raw_user_meta_data->>'first_name', ''), '');
  selected_last_name := coalesce(nullif(new.raw_user_meta_data->>'last_name', ''), '');
  selected_phone := coalesce(nullif(new.raw_user_meta_data->>'phone', ''), '');
  selected_full_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(trim(selected_first_name || ' ' || selected_last_name), ''),
    split_part(new.email, '@', 1)
  );
  selected_contractor_approved := selected_role <> 'contractor';

  insert into public.profiles (
    id,
    first_name,
    last_name,
    full_name,
    email,
    phone,
    role,
    contractor_approved,
    property_manager_property_id
  )
  values (
    new.id,
    selected_first_name,
    selected_last_name,
    selected_full_name,
    new.email,
    selected_phone,
    selected_role,
    selected_contractor_approved,
    null
  )
  on conflict (id) do update
  set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    full_name = excluded.full_name,
    email = excluded.email,
    phone = excluded.phone,
    role = excluded.role,
    contractor_approved = coalesce(public.profiles.contractor_approved, excluded.contractor_approved),
    property_manager_property_id = public.profiles.property_manager_property_id;

  return new;
end;
$$;

drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
  on public.profiles
  for select
  to authenticated
  using (public.current_user_has_role(array['admin']));

drop policy if exists "Admins can update profile access" on public.profiles;
create policy "Admins can update profile access"
  on public.profiles
  for update
  to authenticated
  using (public.current_user_has_role(array['admin']))
  with check (public.current_user_has_role(array['admin']));

drop policy if exists "Portal roles can view portal properties" on public.portal_properties;
drop policy if exists "Portal roles can insert portal properties" on public.portal_properties;
drop policy if exists "Portal roles can update portal properties" on public.portal_properties;
drop policy if exists "Business roles can view portal properties" on public.portal_properties;
drop policy if exists "Business roles can insert portal properties" on public.portal_properties;
drop policy if exists "Business roles can update portal properties" on public.portal_properties;

create policy "Business roles can view portal properties"
  on public.portal_properties
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text in ('admin', 'sales', 'sales_team')
    )
    or exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text = 'property_manager'
        and profiles.property_manager_property_id = portal_properties.id
    )
  );

create policy "Business roles can insert portal properties"
  on public.portal_properties
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text in ('admin', 'sales', 'sales_team')
    )
  );

create policy "Business roles can update portal properties"
  on public.portal_properties
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text in ('admin', 'sales', 'sales_team')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text in ('admin', 'sales', 'sales_team')
    )
  );

drop policy if exists "Portal roles can view clients" on public.clients;
drop policy if exists "Portal roles can insert clients" on public.clients;
drop policy if exists "Portal roles can update clients" on public.clients;
drop policy if exists "Business roles can view clients" on public.clients;
drop policy if exists "Business roles can insert clients" on public.clients;
drop policy if exists "Business roles can update clients" on public.clients;

create policy "Business roles can view clients"
  on public.clients
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text in ('admin', 'sales', 'sales_team')
    )
    or exists (
      select 1
      from public.profiles
      join public.portal_properties
        on portal_properties.id = profiles.property_manager_property_id
      where profiles.id = auth.uid()
        and profiles.role::text = 'property_manager'
        and portal_properties.client_id = clients.id
    )
  );

create policy "Business roles can insert clients"
  on public.clients
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text in ('admin', 'sales', 'sales_team')
    )
  );

create policy "Business roles can update clients"
  on public.clients
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text in ('admin', 'sales', 'sales_team')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text in ('admin', 'sales', 'sales_team')
    )
  );

alter table public.assignment_blocks enable row level security;

drop policy if exists "Contractors can claim open assignments" on public.assignment_blocks;
drop policy if exists "Admins can manage assignments" on public.assignment_blocks;
drop policy if exists "Approved contractors can view assignments" on public.assignment_blocks;
drop policy if exists "Approved contractors can claim open assignments" on public.assignment_blocks;
drop policy if exists "Linked property managers can view assignments" on public.assignment_blocks;

create policy "Admins can manage assignments"
  on public.assignment_blocks
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text = 'admin'
    )
  );

create policy "Approved contractors can view assignments"
  on public.assignment_blocks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text = 'contractor'
        and profiles.contractor_approved = true
    )
    and (
      (status = 'open' and claimed_by is null)
      or claimed_by = auth.uid()
    )
  );

create policy "Approved contractors can claim open assignments"
  on public.assignment_blocks
  for update
  to authenticated
  using (
    status = 'open'
    and claimed_by is null
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text = 'contractor'
        and profiles.contractor_approved = true
    )
  )
  with check (
    status = 'claimed'
    and claimed_by = auth.uid()
    and claimed_at is not null
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text = 'contractor'
        and profiles.contractor_approved = true
    )
  );

create policy "Linked property managers can view assignments"
  on public.assignment_blocks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text = 'property_manager'
        and profiles.property_manager_property_id is not null
        and profiles.property_manager_property_id in (
          assignment_blocks.portal_property_id,
          assignment_blocks.recurring_portal_property_id
        )
    )
  );
