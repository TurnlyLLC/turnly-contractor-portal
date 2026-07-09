alter table if exists public.profiles
  add column if not exists background_check_status text not null default 'not_started',
  add column if not exists background_check_completed_at timestamptz,
  add column if not exists background_check_notes text not null default '';

alter table if exists public.contractors
  add column if not exists background_check_status text not null default 'not_started',
  add column if not exists background_check_completed_at timestamptz,
  add column if not exists background_check_notes text not null default '';

create table if not exists public.contractor_documents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid,
  contractor_id uuid,
  contractor_key text not null default '',
  contractor_email text not null default '',
  contractor_name text not null default '',
  document_type text not null default 'document',
  title text not null default 'Document',
  status text not null default 'uploaded',
  expiration_date date,
  storage_bucket text not null default 'contractor-documents',
  storage_path text not null default '',
  file_name text not null default '',
  mime_type text not null default '',
  file_size bigint not null default 0,
  notes text not null default '',
  created_by uuid,
  uploaded_by uuid,
  uploaded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contractor_documents
  add column if not exists profile_id uuid,
  add column if not exists contractor_id uuid,
  add column if not exists contractor_key text not null default '',
  add column if not exists contractor_email text not null default '',
  add column if not exists contractor_name text not null default '',
  add column if not exists document_type text not null default 'document',
  add column if not exists title text not null default 'Document',
  add column if not exists status text not null default 'uploaded',
  add column if not exists expiration_date date,
  add column if not exists storage_bucket text not null default 'contractor-documents',
  add column if not exists storage_path text not null default '',
  add column if not exists file_name text not null default '',
  add column if not exists mime_type text not null default '',
  add column if not exists file_size bigint not null default 0,
  add column if not exists notes text not null default '',
  add column if not exists created_by uuid,
  add column if not exists uploaded_by uuid,
  add column if not exists uploaded_at timestamptz not null default now(),
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.contractor_performance_metrics (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid,
  contractor_id uuid,
  contractor_key text not null default '',
  contractor_email text not null default '',
  contractor_name text not null default '',
  metric_type text not null default 'scorecard',
  metric_label text not null default 'Performance Metric',
  metric_value numeric,
  metric_unit text not null default '',
  metric_date date not null default current_date,
  notes text not null default '',
  storage_bucket text not null default '',
  storage_path text not null default '',
  file_name text not null default '',
  mime_type text not null default '',
  file_size bigint not null default 0,
  created_by uuid,
  uploaded_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contractor_performance_metrics
  add column if not exists profile_id uuid,
  add column if not exists contractor_id uuid,
  add column if not exists contractor_key text not null default '',
  add column if not exists contractor_email text not null default '',
  add column if not exists contractor_name text not null default '',
  add column if not exists metric_type text not null default 'scorecard',
  add column if not exists metric_label text not null default 'Performance Metric',
  add column if not exists metric_value numeric,
  add column if not exists metric_unit text not null default '',
  add column if not exists metric_date date not null default current_date,
  add column if not exists notes text not null default '',
  add column if not exists storage_bucket text not null default '',
  add column if not exists storage_path text not null default '',
  add column if not exists file_name text not null default '',
  add column if not exists mime_type text not null default '',
  add column if not exists file_size bigint not null default 0,
  add column if not exists created_by uuid,
  add column if not exists uploaded_by uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists contractor_documents_profile_idx
  on public.contractor_documents(profile_id);

create index if not exists contractor_documents_contractor_idx
  on public.contractor_documents(contractor_id);

create index if not exists contractor_documents_email_idx
  on public.contractor_documents(lower(contractor_email));

create index if not exists contractor_documents_created_at_idx
  on public.contractor_documents(created_at desc);

create index if not exists contractor_performance_profile_idx
  on public.contractor_performance_metrics(profile_id);

create index if not exists contractor_performance_contractor_idx
  on public.contractor_performance_metrics(contractor_id);

create index if not exists contractor_performance_email_idx
  on public.contractor_performance_metrics(lower(contractor_email));

create index if not exists contractor_performance_metric_date_idx
  on public.contractor_performance_metrics(metric_date desc);

create or replace function public.set_contractor_file_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_contractor_documents_updated_at on public.contractor_documents;
create trigger set_contractor_documents_updated_at
  before update on public.contractor_documents
  for each row
  execute function public.set_contractor_file_updated_at();

drop trigger if exists set_contractor_performance_updated_at on public.contractor_performance_metrics;
create trigger set_contractor_performance_updated_at
  before update on public.contractor_performance_metrics
  for each row
  execute function public.set_contractor_file_updated_at();

insert into storage.buckets (id, name, public)
values
  ('contractor-documents', 'contractor-documents', false),
  ('contractor-performance', 'contractor-performance', false)
on conflict (id) do update
set public = false;

alter table public.contractor_documents enable row level security;
alter table public.contractor_performance_metrics enable row level security;

drop policy if exists "Admins can manage contractor documents" on public.contractor_documents;
create policy "Admins can manage contractor documents"
  on public.contractor_documents
  for all
  to authenticated
  using (public.current_user_has_role(array['admin']))
  with check (public.current_user_has_role(array['admin']));

drop policy if exists "Contractors can read own contractor documents" on public.contractor_documents;
create policy "Contractors can read own contractor documents"
  on public.contractor_documents
  for select
  to authenticated
  using (
    contractor_id = auth.uid()
    or profile_id = auth.uid()
    or uploaded_by = auth.uid()
    or created_by = auth.uid()
  );

drop policy if exists "Admins can manage contractor performance metrics" on public.contractor_performance_metrics;
create policy "Admins can manage contractor performance metrics"
  on public.contractor_performance_metrics
  for all
  to authenticated
  using (public.current_user_has_role(array['admin']))
  with check (public.current_user_has_role(array['admin']));

drop policy if exists "Contractors can read own performance metrics" on public.contractor_performance_metrics;
create policy "Contractors can read own performance metrics"
  on public.contractor_performance_metrics
  for select
  to authenticated
  using (
    contractor_id = auth.uid()
    or profile_id = auth.uid()
    or uploaded_by = auth.uid()
    or created_by = auth.uid()
  );

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Admins can read contractor file uploads'
  ) then
    create policy "Admins can read contractor file uploads"
      on storage.objects for select
      to authenticated
      using (
        bucket_id in ('contractor-documents', 'contractor-performance')
        and public.current_user_has_role(array['admin'])
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Admins can upload contractor file uploads'
  ) then
    create policy "Admins can upload contractor file uploads"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id in ('contractor-documents', 'contractor-performance')
        and (storage.foldername(name))[1] = auth.uid()::text
        and public.current_user_has_role(array['admin'])
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Admins can delete contractor file uploads'
  ) then
    create policy "Admins can delete contractor file uploads"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id in ('contractor-documents', 'contractor-performance')
        and public.current_user_has_role(array['admin'])
      );
  end if;
end $$;

grant select, insert, update, delete on public.contractor_documents to authenticated;
grant select, insert, update, delete on public.contractor_performance_metrics to authenticated;

notify pgrst, 'reload schema';
