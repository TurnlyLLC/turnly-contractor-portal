-- Let admins restrict contractor job-board access by region and property/contract.

alter table public.profiles
  add column if not exists allowed_regions text[] not null default '{}'::text[],
  add column if not exists allowed_property_ids uuid[] not null default '{}'::uuid[],
  add column if not exists allowed_property_names text[] not null default '{}'::text[];

update public.profiles
set
  allowed_regions = coalesce(allowed_regions, '{}'::text[]),
  allowed_property_ids = coalesce(allowed_property_ids, '{}'::uuid[]),
  allowed_property_names = coalesce(allowed_property_names, '{}'::text[]);

alter table public.profiles
  alter column allowed_regions set default '{}'::text[],
  alter column allowed_regions set not null,
  alter column allowed_property_ids set default '{}'::uuid[],
  alter column allowed_property_ids set not null,
  alter column allowed_property_names set default '{}'::text[],
  alter column allowed_property_names set not null;

do $$
begin
  if to_regclass('public.contractors') is not null then
    alter table public.contractors
      add column if not exists allowed_regions text[] not null default '{}'::text[],
      add column if not exists allowed_property_ids uuid[] not null default '{}'::uuid[],
      add column if not exists allowed_property_names text[] not null default '{}'::text[];

    update public.contractors
    set
      allowed_regions = coalesce(allowed_regions, '{}'::text[]),
      allowed_property_ids = coalesce(allowed_property_ids, '{}'::uuid[]),
      allowed_property_names = coalesce(allowed_property_names, '{}'::text[]);
  end if;

  if to_regclass('public.contractor_invites') is not null then
    alter table public.contractor_invites
      add column if not exists allowed_regions text[] not null default '{}'::text[],
      add column if not exists allowed_property_ids uuid[] not null default '{}'::uuid[],
      add column if not exists allowed_property_names text[] not null default '{}'::text[];

    update public.contractor_invites
    set
      allowed_regions = coalesce(allowed_regions, '{}'::text[]),
      allowed_property_ids = coalesce(allowed_property_ids, '{}'::uuid[]),
      allowed_property_names = coalesce(allowed_property_names, '{}'::text[]);
  end if;
end $$;

create or replace function public.contractor_assignment_matches_scope(
  target public.assignment_blocks,
  target_contractor_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  profile_row public.profiles%rowtype;
  meta jsonb := coalesce(target.metadata, '{}'::jsonb);
  allowed_property_id_values text[];
  allowed_property_name_values text[];
  allowed_region_values text[];
  property_id_candidates text[];
  property_name_candidates text[];
  region_candidates text[];
begin
  select *
  into profile_row
  from public.profiles
  where id = target_contractor_id;

  if not found then
    return false;
  end if;

  allowed_property_id_values := coalesce(array(
    select lower(trim(value::text))
    from unnest(coalesce(profile_row.allowed_property_ids, '{}'::uuid[])) as value
    where value is not null
  ), '{}'::text[]);

  allowed_property_name_values := coalesce(array(
    select lower(trim(value))
    from unnest(coalesce(profile_row.allowed_property_names, '{}'::text[])) as value
    where trim(coalesce(value, '')) <> ''
  ), '{}'::text[]);

  allowed_region_values := coalesce(array(
    select lower(trim(value))
    from unnest(coalesce(profile_row.allowed_regions, '{}'::text[])) as value
    where trim(coalesce(value, '')) <> ''
  ), '{}'::text[]);

  if cardinality(allowed_property_id_values) = 0
    and cardinality(allowed_property_name_values) = 0
    and cardinality(allowed_region_values) = 0 then
    return true;
  end if;

  property_id_candidates := array_remove(array[
    lower(coalesce(target.property_id::text, '')),
    lower(coalesce(target.portal_property_id::text, '')),
    lower(coalesce(target.recurring_property_id::text, '')),
    lower(coalesce(target.recurring_portal_property_id::text, '')),
    lower(coalesce(meta->>'property_id', '')),
    lower(coalesce(meta->>'portal_property_id', '')),
    lower(coalesce(meta->>'recurring_property_id', '')),
    lower(coalesce(meta->>'recurring_portal_property_id', '')),
    lower(coalesce(meta->>'client_id', '')),
    lower(coalesce(meta->>'contract_id', ''))
  ], '');

  property_name_candidates := array_remove(array[
    lower(trim(coalesce(target.property_name, ''))),
    lower(trim(coalesce(target.title, ''))),
    lower(trim(coalesce(target.address, ''))),
    lower(trim(coalesce(meta->>'property_name', ''))),
    lower(trim(coalesce(meta->>'name', ''))),
    lower(trim(coalesce(meta->>'title', ''))),
    lower(trim(coalesce(meta->>'company_name', ''))),
    lower(trim(coalesce(meta->>'client_name', ''))),
    lower(trim(coalesce(meta->>'address', ''))),
    lower(trim(coalesce(meta->>'property_address', ''))),
    lower(trim(coalesce(meta->>'service_address', '')))
  ], '');

  region_candidates := array_remove(array[
    lower(trim(coalesce(target.address, ''))),
    lower(trim(coalesce(meta->>'region', ''))),
    lower(trim(coalesce(meta->>'market', ''))),
    lower(trim(coalesce(meta->>'location', ''))),
    lower(trim(coalesce(meta->>'city', ''))),
    lower(trim(coalesce(meta->>'state', ''))),
    lower(trim(coalesce(meta->>'address', ''))),
    lower(trim(coalesce(meta->>'property_address', ''))),
    lower(trim(coalesce(meta->>'service_address', '')))
  ], '');

  if exists (
    select 1
    from unnest(allowed_property_id_values) as allowed_value
    join unnest(property_id_candidates) as candidate
      on candidate = allowed_value
  ) then
    return true;
  end if;

  if exists (
    select 1
    from unnest(allowed_property_name_values) as allowed_value
    join unnest(property_name_candidates) as candidate
      on candidate = allowed_value
        or candidate like '%' || allowed_value || '%'
        or allowed_value like '%' || candidate || '%'
  ) then
    return true;
  end if;

  if exists (
    select 1
    from unnest(allowed_region_values) as allowed_value
    join unnest(region_candidates) as candidate
      on candidate = allowed_value
        or candidate like '%' || allowed_value || '%'
        or allowed_value like '%' || candidate || '%'
  ) then
    return true;
  end if;

  return false;
end;
$$;

drop policy if exists "Authenticated users can read assignment blocks" on public.assignment_blocks;
drop policy if exists "Authenticated users can update assignment blocks" on public.assignment_blocks;
drop policy if exists "Authenticated users can view assignment blocks" on public.assignment_blocks;
drop policy if exists "Approved contractors can view assignments" on public.assignment_blocks;
drop policy if exists "Approved contractors can claim open assignments" on public.assignment_blocks;

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
      (
        status in ('open', 'preferred_pending')
        and claimed_by is null
        and (
          coalesce(visibility, 'open') = 'open'
          or auth.uid() = any(coalesce(preferred_contractor_ids, '{}'::uuid[]))
        )
        and public.contractor_assignment_matches_scope(assignment_blocks, auth.uid())
      )
      or claimed_by = auth.uid()
      or assigned_to = auth.uid()
      or started_by = auth.uid()
      or completed_by = auth.uid()
    )
  );

create policy "Approved contractors can claim open assignments"
  on public.assignment_blocks
  for update
  to authenticated
  using (
    status in ('open', 'preferred_pending')
    and claimed_by is null
    and public.contractor_assignment_matches_scope(assignment_blocks, auth.uid())
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
    and public.contractor_assignment_matches_scope(assignment_blocks, auth.uid())
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text = 'contractor'
        and profiles.contractor_approved = true
    )
  );

create or replace function public.claim_assignment_block(target_assignment_id uuid)
returns public.assignment_blocks
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_row public.assignment_blocks;
  contractor_profile record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select full_name, email
  into contractor_profile
  from public.profiles
  where id = auth.uid()
    and role::text = 'contractor'
    and contractor_approved = true;

  if not found then
    raise exception 'Only approved contractors can claim assignments';
  end if;

  update public.assignment_blocks as assignment
  set
    status = 'claimed',
    visibility = 'claimed',
    claimed_by = auth.uid(),
    claimed_by_name = coalesce(contractor_profile.full_name, contractor_profile.email),
    claimed_by_email = contractor_profile.email,
    assigned_to = auth.uid(),
    assigned_to_name = coalesce(contractor_profile.full_name, contractor_profile.email),
    assigned_to_email = contractor_profile.email,
    accepted_at = coalesce(accepted_at, now()),
    claimed_at = now()
  where assignment.id = target_assignment_id
    and status in ('open', 'preferred_pending')
    and (
      coalesce(visibility, 'open') = 'open'
      or auth.uid() = any(coalesce(preferred_contractor_ids, '{}'::uuid[]))
    )
    and auth.uid() <> all(coalesce(declined_contractor_ids, '{}'::uuid[]))
    and public.contractor_assignment_matches_scope(assignment, auth.uid())
  returning * into claimed_row;

  if not found then
    raise exception 'Assignment is not available to claim';
  end if;

  return claimed_row;
end;
$$;

grant execute on function public.contractor_assignment_matches_scope(public.assignment_blocks, uuid) to authenticated;
grant execute on function public.claim_assignment_block(uuid) to authenticated;

notify pgrst, 'reload schema';
