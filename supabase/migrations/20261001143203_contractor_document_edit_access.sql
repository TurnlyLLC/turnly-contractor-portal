-- Allow admins to edit contractor document metadata and replace files while keeping the bucket private.
create index if not exists contractor_documents_type_idx
  on public.contractor_documents(document_type);

drop policy if exists "Admins can update contractor file uploads" on storage.objects;
create policy "Admins can update contractor file uploads"
  on storage.objects for update
  to authenticated
  using (
    bucket_id in ('contractor-documents', 'contractor-performance')
    and public.current_user_has_role(array['admin'])
  )
  with check (
    bucket_id in ('contractor-documents', 'contractor-performance')
    and public.current_user_has_role(array['admin'])
  );

drop policy if exists "Contractors can read own contractor document files" on storage.objects;
create policy "Contractors can read own contractor document files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'contractor-documents'
    and exists (
      select 1
      from public.contractor_documents as document
      where document.storage_bucket = storage.objects.bucket_id
        and document.storage_path = storage.objects.name
        and (
          document.contractor_id = (select auth.uid())
          or document.profile_id = (select auth.uid())
          or document.contractor_email = (
            select profile.email
            from public.profiles as profile
            where profile.id = (select auth.uid())
          )
        )
    )
  );

notify pgrst, 'reload schema';
