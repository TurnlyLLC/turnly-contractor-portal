create extension if not exists pgcrypto;

create table if not exists public.property_regions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active',
  notes text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_regions_name_not_blank check (length(trim(name)) > 0),
  constraint property_regions_status_check check (status in ('active', 'inactive', 'archived'))
);

create unique index if not exists property_regions_name_key
  on public.property_regions (lower(trim(name)));

create table if not exists public.property_region_links (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.property_regions(id) on delete cascade,
  portal_property_id uuid references public.portal_properties(id) on delete cascade,
  contract_id uuid references public.client_contracts(id) on delete cascade,
  property_name text not null default '',
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_region_links_status_check check (status in ('active', 'inactive', 'archived')),
  constraint property_region_links_target_check check (
    portal_property_id is not null
    or contract_id is not null
    or length(trim(property_name)) > 0
  )
);

create index if not exists property_region_links_region_idx
  on public.property_region_links(region_id);

create unique index if not exists property_region_links_region_portal_property_key
  on public.property_region_links(region_id, portal_property_id)
  where portal_property_id is not null;

create unique index if not exists property_region_links_region_contract_key
  on public.property_region_links(region_id, contract_id)
  where contract_id is not null;

create table if not exists public.property_manager_region_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  region_id uuid not null references public.property_regions(id) on delete cascade,
  access_level text not null default 'manager',
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_manager_region_links_access_level_check check (access_level in ('viewer', 'manager', 'admin')),
  constraint property_manager_region_links_status_check check (status in ('active', 'inactive', 'archived')),
  unique(profile_id, region_id)
);

create index if not exists property_manager_region_links_profile_idx
  on public.property_manager_region_links(profile_id);

create index if not exists property_manager_region_links_region_idx
  on public.property_manager_region_links(region_id);

create table if not exists public.property_manager_property_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  portal_property_id uuid references public.portal_properties(id) on delete cascade,
  contract_id uuid references public.client_contracts(id) on delete cascade,
  property_name text not null default '',
  access_level text not null default 'manager',
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_manager_property_links_access_level_check check (access_level in ('viewer', 'manager', 'admin')),
  constraint property_manager_property_links_status_check check (status in ('active', 'inactive', 'archived')),
  constraint property_manager_property_links_target_check check (
    portal_property_id is not null
    or contract_id is not null
    or length(trim(property_name)) > 0
  )
);

create index if not exists property_manager_property_links_profile_idx
  on public.property_manager_property_links(profile_id);

create unique index if not exists property_manager_property_links_profile_portal_property_key
  on public.property_manager_property_links(profile_id, portal_property_id)
  where portal_property_id is not null;

create unique index if not exists property_manager_property_links_profile_contract_key
  on public.property_manager_property_links(profile_id, contract_id)
  where contract_id is not null;

drop trigger if exists property_regions_set_updated_at on public.property_regions;
create trigger property_regions_set_updated_at
before update on public.property_regions
for each row
execute function public.set_updated_at();

drop trigger if exists property_region_links_set_updated_at on public.property_region_links;
create trigger property_region_links_set_updated_at
before update on public.property_region_links
for each row
execute function public.set_updated_at();

drop trigger if exists property_manager_region_links_set_updated_at on public.property_manager_region_links;
create trigger property_manager_region_links_set_updated_at
before update on public.property_manager_region_links
for each row
execute function public.set_updated_at();

drop trigger if exists property_manager_property_links_set_updated_at on public.property_manager_property_links;
create trigger property_manager_property_links_set_updated_at
before update on public.property_manager_property_links
for each row
execute function public.set_updated_at();

alter table public.property_regions enable row level security;
alter table public.property_region_links enable row level security;
alter table public.property_manager_region_links enable row level security;
alter table public.property_manager_property_links enable row level security;

drop policy if exists "Admins can manage property regions" on public.property_regions;
create policy "Admins can manage property regions"
  on public.property_regions
  for all
  to authenticated
  using (public.current_user_has_role(array['admin']))
  with check (public.current_user_has_role(array['admin']));

drop policy if exists "Property managers can view assigned regions" on public.property_regions;
create policy "Property managers can view assigned regions"
  on public.property_regions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.property_manager_region_links pmrl
      join public.profiles p on p.id = pmrl.profile_id
      where pmrl.region_id = property_regions.id
        and pmrl.profile_id = auth.uid()
        and pmrl.status = 'active'
        and lower(regexp_replace(coalesce(p.role::text, ''), '[\s-]+', '_', 'g')) = 'property_manager'
    )
  );

drop policy if exists "Admins can manage property region links" on public.property_region_links;
create policy "Admins can manage property region links"
  on public.property_region_links
  for all
  to authenticated
  using (public.current_user_has_role(array['admin']))
  with check (public.current_user_has_role(array['admin']));

drop policy if exists "Property managers can view assigned region properties" on public.property_region_links;
create policy "Property managers can view assigned region properties"
  on public.property_region_links
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.property_manager_region_links pmrl
      join public.profiles p on p.id = pmrl.profile_id
      where pmrl.region_id = property_region_links.region_id
        and pmrl.profile_id = auth.uid()
        and pmrl.status = 'active'
        and lower(regexp_replace(coalesce(p.role::text, ''), '[\s-]+', '_', 'g')) = 'property_manager'
    )
  );

drop policy if exists "Admins can manage property manager region links" on public.property_manager_region_links;
create policy "Admins can manage property manager region links"
  on public.property_manager_region_links
  for all
  to authenticated
  using (public.current_user_has_role(array['admin']))
  with check (public.current_user_has_role(array['admin']));

drop policy if exists "Property managers can view own region links" on public.property_manager_region_links;
create policy "Property managers can view own region links"
  on public.property_manager_region_links
  for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists "Admins can manage property manager property links" on public.property_manager_property_links;
create policy "Admins can manage property manager property links"
  on public.property_manager_property_links
  for all
  to authenticated
  using (public.current_user_has_role(array['admin']))
  with check (public.current_user_has_role(array['admin']));

drop policy if exists "Property managers can view own property links" on public.property_manager_property_links;
create policy "Property managers can view own property links"
  on public.property_manager_property_links
  for select
  to authenticated
  using (profile_id = auth.uid());

create or replace function public.uuid_from_text(value text)
returns uuid
language plpgsql
immutable
strict
as $$
begin
  if value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return value::uuid;
  end if;
  return null;
end;
$$;

create or replace function public.property_manager_accessible_property_ids(manager_id uuid)
returns table(portal_property_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with allowed_profile as (
    select p.*
    from public.profiles p
    where p.id = manager_id
      and (
        manager_id = auth.uid()
        or public.current_user_has_role(array['admin'])
      )
      and lower(regexp_replace(coalesce(p.role::text, ''), '[\s-]+', '_', 'g')) = 'property_manager'
  ),
  base_property as (
    select public.canonical_portal_property_id(p.property_manager_property_id) as id
    from allowed_profile p
    where p.property_manager_property_id is not null
  ),
  direct_property as (
    select public.canonical_portal_property_id(pmpl.portal_property_id) as id
    from public.property_manager_property_links pmpl
    join allowed_profile p on p.id = pmpl.profile_id
    where pmpl.status = 'active'
      and pmpl.portal_property_id is not null
  ),
  direct_contract_property as (
    select public.canonical_portal_property_id(pp.id) as id
    from public.property_manager_property_links pmpl
    join allowed_profile p on p.id = pmpl.profile_id
    join public.portal_properties pp on (
      pp.id = pmpl.contract_id
      or pp.client_id = pmpl.contract_id
    )
    where pmpl.status = 'active'
      and pmpl.contract_id is not null
  ),
  region_property as (
    select public.canonical_portal_property_id(prl.portal_property_id) as id
    from public.property_manager_region_links pmrl
    join allowed_profile p on p.id = pmrl.profile_id
    join public.property_region_links prl on prl.region_id = pmrl.region_id
    where pmrl.status = 'active'
      and prl.status = 'active'
      and prl.portal_property_id is not null
  ),
  region_contract_property as (
    select public.canonical_portal_property_id(pp.id) as id
    from public.property_manager_region_links pmrl
    join allowed_profile p on p.id = pmrl.profile_id
    join public.property_region_links prl on prl.region_id = pmrl.region_id
    join public.portal_properties pp on (
      pp.id = prl.contract_id
      or pp.client_id = prl.contract_id
    )
    where pmrl.status = 'active'
      and prl.status = 'active'
      and prl.contract_id is not null
  )
  select distinct id
  from (
    select id from base_property
    union all
    select id from direct_property
    union all
    select id from direct_contract_property
    union all
    select id from region_property
    union all
    select id from region_contract_property
  ) properties
  where id is not null;
$$;

create or replace function public.property_manager_can_access_portal_property(manager_id uuid, target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_property_id is not null
    and exists (
      select 1
      from public.property_manager_accessible_property_ids(manager_id) access
      where public.portal_property_access_matches(access.portal_property_id, target_property_id)
    );
$$;

create or replace function public.property_manager_can_access_property_identifier(manager_id uuid, target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_id is not null
    and exists (
      select 1
      from public.property_manager_accessible_property_ids(manager_id) access
      left join public.portal_properties pp on pp.id = access.portal_property_id
      where public.portal_property_access_matches(access.portal_property_id, target_id)
        or pp.client_id = target_id
    );
$$;

create or replace function public.property_manager_assignment_matches_scope(
  target public.assignment_blocks,
  manager_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    where public.property_manager_can_access_property_identifier(manager_id, target.portal_property_id)
      or public.property_manager_can_access_property_identifier(manager_id, target.recurring_portal_property_id)
      or public.property_manager_can_access_property_identifier(manager_id, target.property_id)
      or public.property_manager_can_access_property_identifier(manager_id, target.recurring_property_id)
      or public.property_manager_can_access_property_identifier(
        manager_id,
        public.uuid_from_text(target.metadata ->> 'portal_property_id')
      )
      or public.property_manager_can_access_property_identifier(
        manager_id,
        public.uuid_from_text(target.metadata ->> 'property_id')
      )
      or exists (
        select 1
        from public.property_assignment_links pal
        where pal.assignment_id = target.id
          and public.property_manager_can_access_property_identifier(manager_id, pal.portal_property_id)
      )
  );
$$;

drop policy if exists "Linked property managers can view portal properties" on public.portal_properties;
create policy "Linked property managers can view portal properties"
  on public.portal_properties
  for select
  to authenticated
  using (
    public.property_manager_can_access_portal_property(auth.uid(), portal_properties.id)
  );

drop policy if exists "Linked property managers can view assignments" on public.assignment_blocks;
create policy "Linked property managers can view assignments"
  on public.assignment_blocks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(regexp_replace(coalesce(p.role::text, ''), '[\s-]+', '_', 'g')) = 'property_manager'
        and public.property_manager_assignment_matches_scope(assignment_blocks, auth.uid())
    )
  );

drop policy if exists "Linked property managers can view QA jobs" on public.qa_jobs;
create policy "Linked property managers can view QA jobs"
  on public.qa_jobs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(regexp_replace(coalesce(p.role::text, ''), '[\s-]+', '_', 'g')) = 'property_manager'
        and (
          public.property_manager_can_access_property_identifier(auth.uid(), qa_jobs.portal_property_id)
          or exists (
            select 1
            from public.property_assignment_links pal
            where pal.assignment_id = qa_jobs.assignment_id
              and public.property_manager_can_access_property_identifier(auth.uid(), pal.portal_property_id)
          )
        )
    )
  );

drop policy if exists "Linked property managers can view QA videos" on public.qa_videos;
create policy "Linked property managers can view QA videos"
  on public.qa_videos
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(regexp_replace(coalesce(p.role::text, ''), '[\s-]+', '_', 'g')) = 'property_manager'
        and (
          public.property_manager_can_access_property_identifier(auth.uid(), qa_videos.portal_property_id)
          or exists (
            select 1
            from public.property_qa_video_links pqvl
            where pqvl.qa_video_id = qa_videos.id
              and public.property_manager_can_access_property_identifier(auth.uid(), pqvl.portal_property_id)
          )
          or exists (
            select 1
            from public.property_assignment_links pal
            where pal.assignment_id = qa_videos.assignment_id
              and public.property_manager_can_access_property_identifier(auth.uid(), pal.portal_property_id)
          )
        )
    )
  );

drop policy if exists "Linked property managers can read QA video files" on storage.objects;
create policy "Linked property managers can read QA video files"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'qa-videos'
    and exists (
      select 1
      from public.qa_videos video
      where video.storage_path = name
        and (
          public.property_manager_can_access_property_identifier(auth.uid(), video.portal_property_id)
          or exists (
            select 1
            from public.property_qa_video_links pqvl
            where pqvl.qa_video_id = video.id
              and public.property_manager_can_access_property_identifier(auth.uid(), pqvl.portal_property_id)
          )
          or exists (
            select 1
            from public.property_assignment_links pal
            where pal.assignment_id = video.assignment_id
              and public.property_manager_can_access_property_identifier(auth.uid(), pal.portal_property_id)
          )
        )
    )
  );

drop policy if exists "Property managers can read linked clean feedback" on public.property_manager_clean_feedback;
create policy "Property managers can read linked clean feedback"
  on public.property_manager_clean_feedback
  for select
  using (
    public.property_manager_can_access_property_identifier(auth.uid(), property_manager_clean_feedback.portal_property_id)
  );

drop policy if exists "Property managers can create linked clean feedback" on public.property_manager_clean_feedback;
create policy "Property managers can create linked clean feedback"
  on public.property_manager_clean_feedback
  for insert
  with check (
    created_by = auth.uid()
    and public.property_manager_can_access_property_identifier(auth.uid(), property_manager_clean_feedback.portal_property_id)
    and exists (
      select 1
      from public.assignment_blocks a
      where a.id = property_manager_clean_feedback.assignment_id
        and public.property_manager_assignment_matches_scope(a, auth.uid())
    )
  );

grant select, insert, update, delete on public.property_regions to authenticated;
grant select, insert, update, delete on public.property_region_links to authenticated;
grant select, insert, update, delete on public.property_manager_region_links to authenticated;
grant select, insert, update, delete on public.property_manager_property_links to authenticated;
grant execute on function public.uuid_from_text(text) to authenticated;
grant execute on function public.property_manager_accessible_property_ids(uuid) to authenticated;
grant execute on function public.property_manager_can_access_portal_property(uuid, uuid) to authenticated;
grant execute on function public.property_manager_can_access_property_identifier(uuid, uuid) to authenticated;
grant execute on function public.property_manager_assignment_matches_scope(public.assignment_blocks, uuid) to authenticated;

notify pgrst, 'reload schema';
