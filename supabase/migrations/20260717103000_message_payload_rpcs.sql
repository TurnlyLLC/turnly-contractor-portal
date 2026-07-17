create or replace function public.create_message_thread_v2(message_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_list jsonb := coalesce(message_payload->'recipient_ids', '[]'::jsonb);
  target_recipients uuid[] := '{}'::uuid[];
begin
  if jsonb_typeof(recipient_list) = 'array' then
    select coalesce(array_agg(value::uuid), '{}'::uuid[])
    into target_recipients
    from jsonb_array_elements_text(recipient_list) as ids(value)
    where nullif(trim(value), '') is not null;
  end if;

  return public.create_message_thread(
    target_recipients,
    coalesce(message_payload->>'subject', message_payload->>'thread_subject', 'Message'),
    coalesce(message_payload->>'body', message_payload->>'message_body', ''),
    coalesce(message_payload->>'related_type', ''),
    coalesce(message_payload->>'related_id', ''),
    coalesce(message_payload->>'related_title', '')
  );
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
    coalesce(sender_profile.role, ''),
    coalesce(nullif(sender_profile.full_name, ''), nullif(sender_profile.email, ''), 'User'),
    coalesce(sender_profile.email, ''),
    clean_body
  )
  returning id into new_message_id;

  return new_message_id;
end;
$$;

grant execute on function public.create_message_thread_v2(jsonb) to authenticated;
grant execute on function public.send_message_reply_v2(jsonb) to authenticated;

notify pgrst, 'reload schema';
