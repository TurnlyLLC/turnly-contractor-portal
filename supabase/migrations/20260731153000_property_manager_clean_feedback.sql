create extension if not exists pgcrypto;

create table if not exists public.property_manager_clean_feedback (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignment_blocks(id) on delete cascade,
  portal_property_id uuid references public.portal_properties(id) on delete set null,
  property_name text,
  unit_number text,
  feedback_type text not null default 'complaint',
  message text not null check (length(trim(message)) > 0),
  status text not null default 'open',
  created_by uuid not null default auth.uid(),
  created_by_name text,
  created_by_email text,
  admin_notes text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists property_manager_clean_feedback_assignment_idx
  on public.property_manager_clean_feedback (assignment_id);

create index if not exists property_manager_clean_feedback_property_idx
  on public.property_manager_clean_feedback (portal_property_id, created_at desc);

create index if not exists property_manager_clean_feedback_status_idx
  on public.property_manager_clean_feedback (status, created_at desc);

drop trigger if exists set_property_manager_clean_feedback_updated_at on public.property_manager_clean_feedback;
create trigger set_property_manager_clean_feedback_updated_at
  before update on public.property_manager_clean_feedback
  for each row
  execute function public.set_updated_at();

alter table public.property_manager_clean_feedback enable row level security;

create or replace function public.is_turnly_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(regexp_replace(coalesce(p.role::text, ''), '[\s-]+', '_', 'g')) in ('admin', 'sales', 'sales_team')
  );
$$;

create or replace function public.assignment_belongs_to_property(target_assignment_id uuid, target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assignment_blocks a
    where a.id = target_assignment_id
      and (
        a.portal_property_id = target_property_id
        or a.recurring_portal_property_id = target_property_id
        or (
          (a.metadata ->> 'portal_property_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and (a.metadata ->> 'portal_property_id')::uuid = target_property_id
        )
      )
  )
  or exists (
    select 1
    from public.property_assignment_links pal
    where pal.assignment_id = target_assignment_id
      and pal.portal_property_id = target_property_id
  );
$$;

drop policy if exists "Admins can manage clean feedback" on public.property_manager_clean_feedback;
create policy "Admins can manage clean feedback"
  on public.property_manager_clean_feedback
  for all
  using (public.is_turnly_admin())
  with check (public.is_turnly_admin());

drop policy if exists "Property managers can read linked clean feedback" on public.property_manager_clean_feedback;
create policy "Property managers can read linked clean feedback"
  on public.property_manager_clean_feedback
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.property_manager_property_id = property_manager_clean_feedback.portal_property_id
    )
  );

drop policy if exists "Property managers can create linked clean feedback" on public.property_manager_clean_feedback;
create policy "Property managers can create linked clean feedback"
  on public.property_manager_clean_feedback
  for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.property_manager_property_id = property_manager_clean_feedback.portal_property_id
        and public.assignment_belongs_to_property(property_manager_clean_feedback.assignment_id, p.property_manager_property_id)
    )
  );

create or replace function public.create_property_manager_clean_feedback(feedback_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  requester public.profiles%rowtype;
  target_assignment public.assignment_blocks%rowtype;
  linked_property_id uuid;
  created_feedback_id uuid;
  feedback_message text := trim(coalesce(feedback_payload ->> 'message', ''));
  feedback_kind text := lower(regexp_replace(coalesce(nullif(feedback_payload ->> 'feedback_type', ''), 'complaint'), '[\s-]+', '_', 'g'));
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to send clean feedback.';
  end if;

  select * into requester
  from public.profiles
  where id = auth.uid();

  if requester.id is null then
    raise exception 'A profile is required before sending clean feedback.';
  end if;

  if lower(regexp_replace(coalesce(requester.role::text, ''), '[\s-]+', '_', 'g')) <> 'property_manager' then
    raise exception 'Only property manager accounts can send clean feedback.';
  end if;

  linked_property_id := requester.property_manager_property_id;
  if linked_property_id is null then
    raise exception 'Your property manager account must be linked to a property before sending clean feedback.';
  end if;

  if feedback_message = '' then
    raise exception 'Feedback details are required.';
  end if;

  select * into target_assignment
  from public.assignment_blocks
  where id = nullif(feedback_payload ->> 'assignment_id', '')::uuid;

  if target_assignment.id is null then
    raise exception 'The selected assignment could not be found.';
  end if;

  if not public.assignment_belongs_to_property(target_assignment.id, linked_property_id) then
    raise exception 'This assignment is not linked to your property.';
  end if;

  insert into public.property_manager_clean_feedback (
    assignment_id,
    portal_property_id,
    property_name,
    unit_number,
    feedback_type,
    message,
    status,
    created_by,
    created_by_name,
    created_by_email,
    metadata
  )
  values (
    target_assignment.id,
    linked_property_id,
    coalesce(nullif(feedback_payload ->> 'property_name', ''), target_assignment.property_name),
    coalesce(nullif(feedback_payload ->> 'unit_number', ''), target_assignment.unit_number, target_assignment.unit_name),
    feedback_kind,
    feedback_message,
    'open',
    auth.uid(),
    coalesce(requester.full_name, requester.email),
    requester.email,
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'property_manager_clean_feedback',
      'assignment_status', target_assignment.status,
      'assignment_title', target_assignment.title,
      'service_type', target_assignment.service_type,
      'submitted_from', 'property_manager_portal'
    ))
  )
  returning id into created_feedback_id;

  return created_feedback_id;
end;
$$;

grant execute on function public.create_property_manager_clean_feedback(jsonb) to authenticated;
