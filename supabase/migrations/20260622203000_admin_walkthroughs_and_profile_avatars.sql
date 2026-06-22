alter table public.portal_properties
  add column if not exists walkthrough_type text not null default '',
  add column if not exists walkthrough_location text not null default '',
  add column if not exists walkthrough_end_at timestamptz,
  add column if not exists walkthrough_assigned_to text not null default '',
  add column if not exists walkthrough_status text not null default 'scheduled',
  add column if not exists walkthrough_at timestamptz,
  add column if not exists walkthrough_notes text not null default '';

create index if not exists portal_properties_walkthrough_at_idx
  on public.portal_properties (walkthrough_at);

create index if not exists portal_properties_walkthrough_status_idx
  on public.portal_properties (walkthrough_status);

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists avatar_path text;

insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Profile avatars are publicly readable'
  ) then
    create policy "Profile avatars are publicly readable"
      on storage.objects for select
      using (bucket_id = 'profile-avatars');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can upload their own profile avatars'
  ) then
    create policy "Users can upload their own profile avatars"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can update their own profile avatars'
  ) then
    create policy "Users can update their own profile avatars"
      on storage.objects for update
      to authenticated
      using (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can delete their own profile avatars'
  ) then
    create policy "Users can delete their own profile avatars"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;
