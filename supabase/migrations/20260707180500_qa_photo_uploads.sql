create table if not exists public.qa_photos (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  label text not null default '',
  photo_phase text not null default 'other',
  property_id uuid,
  property_name text not null default '',
  unit_name text not null default '',
  assignment_id uuid references public.assignment_blocks(id) on delete set null,
  contractor_id uuid references auth.users(id) on delete set null,
  contractor_name text not null default '',
  recorded_at timestamptz,
  notes text not null default '',
  tags text[] not null default '{}'::text[],
  storage_bucket text not null default 'qa-photos',
  storage_path text not null,
  file_name text not null default '',
  mime_type text not null default '',
  file_size bigint not null default 0,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_name text not null default '',
  source text not null default 'admin_upload',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.qa_photos
  add column if not exists title text not null default '',
  add column if not exists label text not null default '',
  add column if not exists photo_phase text not null default 'other',
  add column if not exists property_id uuid,
  add column if not exists property_name text not null default '',
  add column if not exists unit_name text not null default '',
  add column if not exists assignment_id uuid references public.assignment_blocks(id) on delete set null,
  add column if not exists contractor_id uuid references auth.users(id) on delete set null,
  add column if not exists contractor_name text not null default '',
  add column if not exists recorded_at timestamptz,
  add column if not exists notes text not null default '',
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists storage_bucket text not null default 'qa-photos',
  add column if not exists storage_path text not null default '',
  add column if not exists file_name text not null default '',
  add column if not exists mime_type text not null default '',
  add column if not exists file_size bigint not null default 0,
  add column if not exists uploaded_by uuid references auth.users(id) on delete set null,
  add column if not exists uploaded_by_name text not null default '',
  add column if not exists source text not null default 'admin_upload',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists qa_photos_created_at_idx
  on public.qa_photos(created_at desc);

create index if not exists qa_photos_property_idx
  on public.qa_photos(property_id);

create index if not exists qa_photos_assignment_idx
  on public.qa_photos(assignment_id);

create index if not exists qa_photos_uploaded_by_idx
  on public.qa_photos(uploaded_by);

create or replace function public.set_qa_photos_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_qa_photos_updated_at on public.qa_photos;
create trigger set_qa_photos_updated_at
  before update on public.qa_photos
  for each row
  execute function public.set_qa_photos_updated_at();

insert into storage.buckets (id, name, public)
values ('qa-photos', 'qa-photos', false)
on conflict (id) do update
set public = false;

alter table public.qa_photos enable row level security;

drop policy if exists "Admins can manage QA photos" on public.qa_photos;
create policy "Admins can manage QA photos"
  on public.qa_photos
  for all
  to authenticated
  using (public.current_user_has_role(array['admin']))
  with check (public.current_user_has_role(array['admin']));

drop policy if exists "Uploaders can create QA photos" on public.qa_photos;
create policy "Uploaders can create QA photos"
  on public.qa_photos
  for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.current_user_has_role(array['admin', 'contractor', 'property_manager', 'sales_team'])
  );

drop policy if exists "Uploaders can read their QA photos" on public.qa_photos;
create policy "Uploaders can read their QA photos"
  on public.qa_photos
  for select
  to authenticated
  using (uploaded_by = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Admins can read QA photos'
  ) then
    create policy "Admins can read QA photos"
      on storage.objects for select
      to authenticated
      using (
        bucket_id = 'qa-photos'
        and public.current_user_has_role(array['admin'])
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can upload QA photos'
  ) then
    create policy "Authenticated users can upload QA photos"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'qa-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
        and public.current_user_has_role(array['admin', 'contractor', 'property_manager', 'sales_team'])
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Uploaders can read own QA photos'
  ) then
    create policy "Uploaders can read own QA photos"
      on storage.objects for select
      to authenticated
      using (
        bucket_id = 'qa-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Admins can delete QA photos'
  ) then
    create policy "Admins can delete QA photos"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'qa-photos'
        and public.current_user_has_role(array['admin'])
      );
  end if;
end $$;

grant select, insert, update, delete on public.qa_photos to authenticated;

notify pgrst, 'reload schema';
