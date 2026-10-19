create table public.recruiting_applications (
 id uuid primary key, role text not null check(role in ('cleaner','brand_ambassador')),
 name text not null, email text not null, phone text not null, city text not null, state text not null,
 service_city text not null check(service_city in ('Raleigh','Durham','Asheville','Greensboro')),
 answers jsonb not null, consent_version text not null, payload_hash text not null,
 status text not null default 'new' check(status in ('new','reviewing','contacted','interview','onboarding','waitlist','not_selected','withdrawn')),
 review_note text not null default '', reviewed_by uuid references auth.users(id), version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index recruiting_applications_queue on public.recruiting_applications(status,created_at desc);
create index recruiting_applications_role_city on public.recruiting_applications(role,service_city,created_at desc);
create table public.recruiting_application_events (
 id bigint generated always as identity primary key, application_id uuid not null references public.recruiting_applications(id),
 status text not null, note text not null, actor uuid references auth.users(id), created_at timestamptz not null default now()
);
create index recruiting_application_events_application on public.recruiting_application_events(application_id,created_at desc);
alter table public.recruiting_applications enable row level security;
alter table public.recruiting_application_events enable row level security;
revoke all on public.recruiting_applications,public.recruiting_application_events from anon,authenticated;
grant select,insert,update on public.recruiting_applications to service_role;
grant select,insert on public.recruiting_application_events to service_role;
grant usage,select on sequence public.recruiting_application_events_id_seq to service_role;
create function public.record_recruiting_application_event() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.recruiting_application_events(application_id,status,note,actor)
 values(new.id,new.status,case when TG_OP='INSERT' then 'Application received' else new.review_note end,new.reviewed_by);
 return new;
end $$;
revoke all on function public.record_recruiting_application_event() from public,anon,authenticated;
create trigger recruiting_application_audit after insert or update on public.recruiting_applications for each row execute function public.record_recruiting_application_event();
