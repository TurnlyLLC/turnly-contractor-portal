-- Store a readable contractor identifier when an assignment is claimed.

alter table public.assignment_blocks
  add column if not exists claimed_by_email text;
