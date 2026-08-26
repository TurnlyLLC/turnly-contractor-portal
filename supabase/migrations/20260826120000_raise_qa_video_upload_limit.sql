-- Allow contractor checklist videos to match the PWA's advertised 500 MB limit.
-- The hosted Supabase global storage limit must also be at least this high.

update storage.buckets
set
  file_size_limit = 524288000,
  updated_at = now()
where id = 'qa-videos';

