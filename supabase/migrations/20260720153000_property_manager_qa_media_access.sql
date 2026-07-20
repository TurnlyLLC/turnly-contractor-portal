-- Allow linked property managers to review QA jobs and videos for their property.

drop policy if exists "Linked property managers can view QA jobs" on public.qa_jobs;
create policy "Linked property managers can view QA jobs"
  on public.qa_jobs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      join public.assignment_blocks
        on assignment_blocks.id = qa_jobs.assignment_id
      where profiles.id = auth.uid()
        and profiles.role = 'property_manager'
        and profiles.property_manager_property_id is not null
        and profiles.property_manager_property_id in (
          assignment_blocks.portal_property_id,
          assignment_blocks.recurring_portal_property_id
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
      from public.profiles
      join public.portal_properties
        on portal_properties.id = profiles.property_manager_property_id
      where profiles.id = auth.uid()
        and profiles.role = 'property_manager'
        and profiles.property_manager_property_id is not null
        and qa_videos.property_id in (
          portal_properties.id,
          portal_properties.client_id
        )
    )
    or exists (
      select 1
      from public.profiles
      join public.assignment_blocks
        on assignment_blocks.id = qa_videos.assignment_id
      where profiles.id = auth.uid()
        and profiles.role = 'property_manager'
        and profiles.property_manager_property_id is not null
        and profiles.property_manager_property_id in (
          assignment_blocks.portal_property_id,
          assignment_blocks.recurring_portal_property_id
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
      from public.qa_videos
      where qa_videos.storage_path = name
        and (
          exists (
            select 1
            from public.profiles
            join public.portal_properties
              on portal_properties.id = profiles.property_manager_property_id
            where profiles.id = auth.uid()
              and profiles.role = 'property_manager'
              and profiles.property_manager_property_id is not null
              and qa_videos.property_id in (
                portal_properties.id,
                portal_properties.client_id
              )
          )
          or exists (
            select 1
            from public.profiles
            join public.assignment_blocks
              on assignment_blocks.id = qa_videos.assignment_id
            where profiles.id = auth.uid()
              and profiles.role = 'property_manager'
              and profiles.property_manager_property_id is not null
              and profiles.property_manager_property_id in (
                assignment_blocks.portal_property_id,
                assignment_blocks.recurring_portal_property_id
              )
          )
        )
    )
  );

notify pgrst, 'reload schema';
