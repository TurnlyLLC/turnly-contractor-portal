-- Allow larger before/after QA video uploads from contractor and admin PWAs.
-- Hosted Supabase's global Storage file-size limit must also be at least this high.

update storage.buckets
set
  file_size_limit = 1073741824,
  updated_at = now()
where id = 'qa-videos';
