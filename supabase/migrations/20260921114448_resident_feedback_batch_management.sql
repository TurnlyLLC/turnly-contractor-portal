-- Batch inventory is removed atomically; feedback keeps its original snapshots.
create table public.resident_feedback_batches (
  id uuid primary key default gen_random_uuid(),
  portal_property_id uuid references public.portal_properties(id) on delete set null,
  property_name text not null,
  property_code text not null check (property_code ~ '^[A-Z0-9]{2,10}$'),
  start_number integer not null check (start_number between 1 and 999999),
  end_number integer not null check (end_number between start_number and 999999),
  card_count integer not null check (card_count > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  legacy_key text unique
);
create index resident_feedback_batches_created_idx on public.resident_feedback_batches (created_at desc, id desc);
alter table public.resident_feedback_batches enable row level security;
revoke all on public.resident_feedback_batches from public, anon, authenticated;
grant all on public.resident_feedback_batches to service_role;

alter table public.resident_feedback_cards add column batch_id uuid references public.resident_feedback_batches(id) on delete cascade;
create index resident_feedback_cards_batch_idx on public.resident_feedback_cards(batch_id);

-- The original bulk insert assigned the same transaction timestamp to each card.
insert into public.resident_feedback_batches
  (portal_property_id, property_name, property_code, start_number, end_number, card_count, created_by, created_at, legacy_key)
select portal_property_id, property_name, property_code, min(card_number), max(card_number), count(*)::integer, created_by, created_at,
  md5(jsonb_build_array(created_at, portal_property_id, property_name, property_code, created_by)::text)
from public.resident_feedback_cards
group by created_at, portal_property_id, property_name, property_code, created_by;

update public.resident_feedback_cards c set batch_id = b.id
from public.resident_feedback_batches b
where b.legacy_key = md5(jsonb_build_array(c.created_at, c.portal_property_id, c.property_name, c.property_code, c.created_by)::text);

-- Keep the previous server version compatible during deployment or rollback.
create function public.attach_legacy_resident_feedback_batch() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.batch_id is null then
    insert into public.resident_feedback_batches as b
      (portal_property_id, property_name, property_code, start_number, end_number, card_count, created_by, created_at, legacy_key)
    values (new.portal_property_id, new.property_name, new.property_code, new.card_number, new.card_number, 1, new.created_by, new.created_at,
      md5(jsonb_build_array(new.created_at, new.portal_property_id, new.property_name, new.property_code, new.created_by)::text))
    on conflict (legacy_key) do update set
      start_number = least(b.start_number, excluded.start_number),
      end_number = greatest(b.end_number, excluded.end_number), card_count = b.card_count + 1
    returning id into new.batch_id;
  end if;
  return new;
end;
$$;
revoke all on function public.attach_legacy_resident_feedback_batch() from public, anon, authenticated;
grant execute on function public.attach_legacy_resident_feedback_batch() to service_role;
create trigger attach_legacy_resident_feedback_batch before insert on public.resident_feedback_cards
for each row execute function public.attach_legacy_resident_feedback_batch();
alter table public.resident_feedback_cards alter column batch_id set not null;

alter table public.resident_feedback_responses alter column card_id drop not null;
alter table public.resident_feedback_responses drop constraint resident_feedback_responses_card_id_fkey;
alter table public.resident_feedback_responses add constraint resident_feedback_responses_card_id_fkey
  foreign key (card_id) references public.resident_feedback_cards(id) on delete set null;

create function public.create_resident_feedback_batch(
  p_batch_id uuid, p_property_id uuid, p_property_code text, p_start_number integer,
  p_token_hashes text[], p_created_by uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  property_label text;
  total integer := cardinality(p_token_hashes);
begin
  if p_batch_id is null or p_created_by is null or total is null or total not between 1 and 2000
    or p_start_number is null or p_start_number < 1 or p_start_number + total - 1 > 999999
    or p_property_code is null or p_property_code !~ '^[A-Z0-9]{2,10}$'
    or exists (select 1 from unnest(p_token_hashes) as t(hash) where hash is null or hash !~ '^[a-f0-9]{64}$') then
    raise exception 'invalid_feedback_batch';
  end if;
  select btrim(coalesce(nullif(property_name, ''), name)) into property_label
    from public.portal_properties where id = p_property_id;
  if property_label is null or char_length(property_label) not between 1 and 180 then
    raise exception 'invalid_feedback_property';
  end if;
  insert into public.resident_feedback_batches
    (id, portal_property_id, property_name, property_code, start_number, end_number, card_count, created_by)
  values (p_batch_id, p_property_id, property_label, p_property_code, p_start_number, p_start_number + total - 1, total, p_created_by);
  insert into public.resident_feedback_cards
    (batch_id, portal_property_id, property_name, property_code, card_number, token_hash, created_by)
  select p_batch_id, p_property_id, property_label, p_property_code, p_start_number + ordinality::integer - 1, hash, p_created_by
    from unnest(p_token_hashes) with ordinality as t(hash, ordinality);
  return jsonb_build_object('id', p_batch_id, 'property_name', property_label, 'card_count', total);
end;
$$;
revoke all on function public.create_resident_feedback_batch(uuid, uuid, text, integer, text[], uuid) from public, anon, authenticated;
grant execute on function public.create_resident_feedback_batch(uuid, uuid, text, integer, text[], uuid) to service_role;

create function public.delete_resident_feedback_batch(p_batch_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare deleted public.resident_feedback_batches%rowtype;
begin
  delete from public.resident_feedback_batches where id = p_batch_id returning * into deleted;
  if not found then return null; end if;
  return jsonb_build_object('id', deleted.id, 'card_count', deleted.card_count, 'property_code', deleted.property_code);
end;
$$;
revoke all on function public.delete_resident_feedback_batch(uuid) from public, anon, authenticated;
grant execute on function public.delete_resident_feedback_batch(uuid) to service_role;
notify pgrst, 'reload schema';
