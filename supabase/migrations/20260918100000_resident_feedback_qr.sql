-- Private QR card inventory with public, token-only resident feedback capture.
create extension if not exists pgcrypto;

create table if not exists public.resident_feedback_cards (
  id uuid primary key default gen_random_uuid(),
  portal_property_id uuid references public.portal_properties(id) on delete set null,
  property_name text not null check (char_length(btrim(property_name)) between 1 and 180),
  property_code text not null check (property_code ~ '^[A-Z0-9]{2,10}$'),
  card_number integer not null check (card_number between 1 and 999999),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  unique (property_code, card_number)
);

create index if not exists resident_feedback_cards_property_created_idx
  on public.resident_feedback_cards (portal_property_id, created_at desc);

create table if not exists public.resident_feedback_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  card_id uuid not null references public.resident_feedback_cards(id) on delete restrict,
  property_name text not null,
  property_code text not null,
  card_number integer not null,
  rating smallint not null check (rating between 1 and 5),
  message text not null default '' check (char_length(message) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists resident_feedback_responses_created_idx
  on public.resident_feedback_responses (created_at desc, id desc);
create index if not exists resident_feedback_responses_card_created_idx
  on public.resident_feedback_responses (card_id, created_at desc);

alter table public.resident_feedback_cards enable row level security;
alter table public.resident_feedback_responses enable row level security;

revoke all on public.resident_feedback_cards from public, anon, authenticated;
revoke all on public.resident_feedback_responses from public, anon, authenticated;
grant select on public.resident_feedback_cards to authenticated;
grant select on public.resident_feedback_responses to authenticated;
grant all on public.resident_feedback_cards to service_role;
grant all on public.resident_feedback_responses to service_role;

drop policy if exists "Admins can read resident feedback cards" on public.resident_feedback_cards;
create policy "Admins can read resident feedback cards"
  on public.resident_feedback_cards for select to authenticated
  using ((select public.current_profile_is_admin()));

drop policy if exists "Admins can read resident feedback responses" on public.resident_feedback_responses;
create policy "Admins can read resident feedback responses"
  on public.resident_feedback_responses for select to authenticated
  using ((select public.current_profile_is_admin()));

create or replace function public.resolve_resident_feedback_card(p_token text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.resident_feedback_cards c
    where c.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
      and c.disabled_at is null
      and p_token ~ '^[a-f0-9]{64}$'
  );
$$;

revoke all on function public.resolve_resident_feedback_card(text) from public, anon, authenticated;
grant execute on function public.resolve_resident_feedback_card(text) to service_role;

create or replace function public.submit_resident_feedback(
  p_token text,
  p_request_id uuid,
  p_rating smallint,
  p_message text default ''
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  matching_card public.resident_feedback_cards%rowtype;
  clean_message text := btrim(coalesce(p_message, ''));
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_feedback_card';
  end if;
  if p_request_id is null then
    raise exception 'invalid_feedback_request';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_feedback_rating';
  end if;
  if char_length(clean_message) > 2000 then
    raise exception 'feedback_message_too_long';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('resident-feedback-request:' || p_request_id::text, 0));
  if exists (select 1 from public.resident_feedback_responses r where r.request_id = p_request_id) then
    return true;
  end if;

  select c.* into matching_card
  from public.resident_feedback_cards c
  where c.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and c.disabled_at is null
  for update;
  if not found then
    raise exception 'invalid_feedback_card';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('resident-feedback-card:' || matching_card.id::text, 0));
  if exists (
    select 1 from public.resident_feedback_responses r
    where r.card_id = matching_card.id and r.created_at > now() - interval '2 minutes'
  ) then
    raise exception 'feedback_rate_limited';
  end if;

  insert into public.resident_feedback_responses (
    request_id, card_id, property_name, property_code, card_number, rating, message
  ) values (
    p_request_id, matching_card.id, matching_card.property_name,
    matching_card.property_code, matching_card.card_number, p_rating, clean_message
  );
  return true;
end;
$$;

revoke all on function public.submit_resident_feedback(text, uuid, smallint, text) from public, anon, authenticated;
grant execute on function public.submit_resident_feedback(text, uuid, smallint, text) to service_role;
