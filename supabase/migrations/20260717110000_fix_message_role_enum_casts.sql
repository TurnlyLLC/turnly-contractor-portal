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
  sender_role := coalesce(nullif(sender_profile.role::text, ''), '');

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
          coalesce(nullif(recipient_profile.role::text, ''), ''),
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

create or replace function public.send_message_reply_v2(message_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_id uuid := auth.uid();
  target_thread_id uuid;
  clean_body text := nullif(trim(coalesce(message_payload->>'body', message_payload->>'message_body', '')), '');
  sender_profile record;
  new_message_id uuid;
begin
  if sender_id is null then
    raise exception 'Authentication required';
  end if;

  target_thread_id := nullif(message_payload->>'thread_id', '')::uuid;
  if target_thread_id is null then
    raise exception 'Message thread is required';
  end if;

  if clean_body is null then
    raise exception 'Message body is required';
  end if;

  if not exists (
    select 1
    from public.message_thread_participants
    where thread_id = target_thread_id
      and user_id = sender_id
      and is_archived = false
  ) then
    raise exception 'You are not a participant in this message thread';
  end if;

  select id, full_name, email, role
  into sender_profile
  from public.profiles
  where id = sender_id;

  insert into public.message_thread_messages (
    thread_id,
    sender_id,
    sender_role,
    sender_name,
    sender_email,
    body
  ) values (
    target_thread_id,
    sender_id,
    coalesce(nullif(sender_profile.role::text, ''), ''),
    coalesce(nullif(sender_profile.full_name, ''), nullif(sender_profile.email, ''), 'User'),
    coalesce(sender_profile.email, ''),
    clean_body
  )
  returning id into new_message_id;

  return new_message_id;
end;
$$;

grant execute on function public.create_message_thread(uuid[], text, text, text, text, text) to authenticated;
grant execute on function public.send_message_reply_v2(jsonb) to authenticated;

notify pgrst, 'reload schema';
