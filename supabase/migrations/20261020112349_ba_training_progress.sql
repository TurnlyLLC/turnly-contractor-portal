create table public.ba_training_progress(
 user_id uuid not null references public.ba_members(user_id),
 course_version text not null,
 lesson_id text not null,
 score integer not null check(score>=0),
 completed_at timestamptz not null default now(),
 primary key(user_id,course_version,lesson_id)
);
alter table public.ba_training_progress enable row level security;
revoke all on public.ba_training_progress from public,anon,authenticated,service_role;
grant select,insert on public.ba_training_progress to service_role;
