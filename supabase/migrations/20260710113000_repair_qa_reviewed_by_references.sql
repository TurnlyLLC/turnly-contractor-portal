do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'qa_jobs_reviewed_by_fkey'
      and conrelid = 'public.qa_jobs'::regclass
  ) then
    alter table public.qa_jobs
      drop constraint qa_jobs_reviewed_by_fkey;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'qa_videos_reviewed_by_fkey'
      and conrelid = 'public.qa_videos'::regclass
  ) then
    alter table public.qa_videos
      drop constraint qa_videos_reviewed_by_fkey;
  end if;
end $$;

comment on column public.qa_jobs.reviewed_by is
  'Auth user id for the admin who reviewed the QA job. Intentionally not constrained to staff_profiles because admin profiles live in public.profiles/auth.users.';

comment on column public.qa_videos.reviewed_by is
  'Auth user id for the admin who reviewed the QA upload. Intentionally not constrained to staff_profiles because admin profiles live in public.profiles/auth.users.';

notify pgrst, 'reload schema';
