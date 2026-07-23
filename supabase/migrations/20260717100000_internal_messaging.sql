create extension if not exists pgcrypto with schema extensions;

create table if not exists public.message_threads (
  id uuid primary key default extensions.gen_random_uuid(),
  subject text not null default 'Message',
  created_by uuid not null default auth.uid(),
  created_by_name text not null default '',
  created_by_email text not null default '',
  created_by_role text not null default '',
  related_type text not null default '',
  related_id text not null default '',
  related_title text not null default '',
  last_message_at timestamptz,
  last_message_preview text not null default '',
  is_archived boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_thread_participants (
  id uuid primary key default extensions.gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  user_id uuid not null,
  role text not null default '',
  display_name text not null default '',
  email text not null default '',
  last_read_at timestamptz,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique(thread_id, user_id)
);

create table if not exists public.message_thread_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_id uuid not null default auth.uid(),
  sender_role text not null default '',
  sender_name text not null default '',
  sender_email text not null default '',
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists message_threads_last_message_idx
  on public.message_threads(last_message_at desc nulls last, created_at desc);

create index if not exists message_thread_participants_user_idx
  on public.message_thread_participants(user_id, is_archived);

create index if not exists message_thread_participants_thread_idx
  on public.message_thread_participants(thread_id);

create index if not exists message_thread_messages_thread_created_idx
  on public.message_thread_messages(thread_id, created_at);

create or replace function public.touch_message_thread_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.message_threads
  set last_message_at = new.created_at,
      last_message_preview = left(new.body, 180),
      updated_at = now()
  where id = new.thread_id;

  update public.message_thread_participants
  set last_read_at = new.created_at
  where thread_id = new.thread_id
    and user_id = new.sender_id;

  return new;
end;
$$;

drop trigger if exists message_thread_messages_after_insert on public.message_thread_messages;
create trigger message_thread_messages_after_insert
after insert on public.message_thread_messages
for each row execute function public.touch_message_thread_from_message();

create or replace function public.create_message_thread(
  recipient_ids uuid[] default '{}'::uuid[],
  thread_subject text default 'Message',
  message_body text default '',
  related_type text default '',
  related_id text default '',
  related_title text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_id uuid := auth.uid();
  sender_profile record;
  recipient_id uuid;
  recipient_profile record;
  target_recipients uuid[] := coalesce(recipient_ids, '{}'::uuid[]);
  created_thread_id uuid;
  sender_name text;
  sender_email text;
  sender_role text;
  clean_body text := nullif(trim(coalesce(message_body, '')), '');
begin
  if sender_id is null then
    raise exception 'Authentication required';
  end if;

  if clean_body is null then
    raise exception 'Message body is required';
  end if;

  select id, full_name, email, role
  into sender_profile
  from public.profiles
  where id = sender_id;

  sender_name := coalesce(nullif(sender_profile.full_name, ''), nullif(sender_profile.email, ''), 'User');
  sender_email := coalesce(sender_profile.email, '');
  sender_role := coalesce(sender_profile.role, '');

  if coalesce(array_length(target_recipients, 1), 0) = 0 then
    select coalesce(array_agg(id), '{}'::uuid[])
    into target_recipients
    from public.profiles
    where lower(replace(coalesce(role::text, ''), '-', '_')) = 'admin';
  end if;

  if coalesce(array_length(target_recipients, 1), 0) = 0 then
    raise exception 'No message recipients found';
  end if;

  insert into public.message_threads (
    subject,
    created_by,
    created_by_name,
    created_by_email,
    created_by_role,
    related_type,
    related_id,
    related_title,
    last_message_at,
    last_message_preview
  ) values (
    coalesce(nullif(trim(thread_subject), ''), 'Message'),
    sender_id,
    sender_name,
    sender_email,
    sender_role,
    coalesce(related_type, ''),
    coalesce(related_id, ''),
    coalesce(related_title, ''),
    now(),
    left(clean_body, 180)
  )
  returning id into created_thread_id;

  insert into public.message_thread_participants (
    thread_id,
    user_id,
    role,
    display_name,
    email,
    last_read_at
  ) values (
    created_thread_id,
    sender_id,
    sender_role,
    sender_name,
    sender_email,
    now()
  )
  on conflict (thread_id, user_id) do nothing;

  foreach recipient_id in array target_recipients loop
    if recipient_id is not null and recipient_id <> sender_id then
      select id, full_name, email, role
      into recipient_profile
      from public.profiles
      where id = recipient_id;

      if recipient_profile.id is not null then
        insert into public.message_thread_participants (
          thread_id,
          user_id,
          role,
          display_name,
          email
        ) values (
          created_thread_id,
          recipient_profile.id,
          coalesce(recipient_profile.role, ''),
          coalesce(nullif(recipient_profile.full_name, ''), nullif(recipient_profile.email, ''), 'User'),
          coalesce(recipient_profile.email, '')
        )
        on conflict (thread_id, user_id) do nothing;
      end if;
    end if;
  end loop;

  if not exists (
    select 1
    from public.message_thread_participants
    where thread_id = created_thread_id
      and user_id <> sender_id
  ) then
    raise exception 'No valid recipients found';
  end if;

  insert into public.message_thread_messages (
    thread_id,
    sender_id,
    sender_role,
    sender_name,
    sender_email,
    body
  ) values (
    created_thread_id,
    sender_id,
    sender_role,
    sender_name,
    sender_email,
    clean_body
  );

  return created_thread_id;
end;
$$;

create or replace function public.mark_message_thread_read(target_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.message_thread_participants
  set last_read_at = now()
  where thread_id = target_thread_id
    and user_id = auth.uid();
end;
$$;

alter table public.message_threads enable row level security;
alter table public.message_thread_participants enable row level security;
alter table public.message_thread_messages enable row level security;

drop policy if exists message_threads_select_participant on public.message_threads;
create policy message_threads_select_participant
on public.message_threads
for select
to authenticated
using (
  exists (
    select 1
    from public.message_thread_participants p
    where p.thread_id = id
      and p.user_id = auth.uid()
      and p.is_archived = false
  )
);

drop policy if exists message_threads_insert_own on public.message_threads;
create policy message_threads_insert_own
on public.message_threads
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists message_threads_update_participant on public.message_threads;
create policy message_threads_update_participant
on public.message_threads
for update
to authenticated
using (
  exists (
    select 1
    from public.message_thread_participants p
    where p.thread_id = id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.message_thread_participants p
    where p.thread_id = id
      and p.user_id = auth.uid()
  )
);

drop policy if exists message_participants_select_thread_members on public.message_thread_participants;
create policy message_participants_select_thread_members
on public.message_thread_participants
for select
to authenticated
using (
  exists (
    select 1
    from public.message_thread_participants own
    where own.thread_id = message_thread_participants.thread_id
      and own.user_id = auth.uid()
      and own.is_archived = false
  )
);

drop policy if exists message_participants_insert_own_thread on public.message_thread_participants;
create policy message_participants_insert_own_thread
on public.message_thread_participants
for insert
to authenticated
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.message_threads t
    where t.id = thread_id
      and t.created_by = auth.uid()
  )
);

drop policy if exists message_participants_update_own on public.message_thread_participants;
create policy message_participants_update_own
on public.message_thread_participants
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists message_messages_select_participant on public.message_thread_messages;
create policy message_messages_select_participant
on public.message_thread_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.message_thread_participants p
    where p.thread_id = message_thread_messages.thread_id
      and p.user_id = auth.uid()
      and p.is_archived = false
  )
);

drop policy if exists message_messages_insert_participant on public.message_thread_messages;
create policy message_messages_insert_participant
on public.message_thread_messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.message_thread_participants p
    where p.thread_id = message_thread_messages.thread_id
      and p.user_id = auth.uid()
      and p.is_archived = false
  )
);

grant select, insert, update on public.message_threads to authenticated;
grant select, insert, update on public.message_thread_participants to authenticated;
grant select, insert on public.message_thread_messages to authenticated;
grant execute on function public.create_message_thread(uuid[], text, text, text, text, text) to authenticated;
grant execute on function public.mark_message_thread_read(uuid) to authenticated;

notify pgrst, 'reload schema';
