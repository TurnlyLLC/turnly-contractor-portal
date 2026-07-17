create or replace function public.user_can_access_message_thread(target_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.message_thread_participants p
    where p.thread_id = target_thread_id
      and p.user_id = auth.uid()
      and p.is_archived = false
  );
$$;

grant execute on function public.user_can_access_message_thread(uuid) to authenticated;

drop policy if exists message_threads_select_participant on public.message_threads;
create policy message_threads_select_participant
on public.message_threads
for select
to authenticated
using (public.user_can_access_message_thread(id));

drop policy if exists message_threads_update_participant on public.message_threads;
create policy message_threads_update_participant
on public.message_threads
for update
to authenticated
using (public.user_can_access_message_thread(id))
with check (public.user_can_access_message_thread(id));

drop policy if exists message_participants_select_thread_members on public.message_thread_participants;
create policy message_participants_select_thread_members
on public.message_thread_participants
for select
to authenticated
using (
  user_id = auth.uid()
  or public.user_can_access_message_thread(thread_id)
);

drop policy if exists message_messages_select_participant on public.message_thread_messages;
create policy message_messages_select_participant
on public.message_thread_messages
for select
to authenticated
using (public.user_can_access_message_thread(thread_id));

drop policy if exists message_messages_insert_participant on public.message_thread_messages;
create policy message_messages_insert_participant
on public.message_thread_messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and public.user_can_access_message_thread(thread_id)
);

notify pgrst, 'reload schema';
