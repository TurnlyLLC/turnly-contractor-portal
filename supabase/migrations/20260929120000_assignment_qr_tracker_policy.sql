alter table public.assignment_blocks
  add column if not exists qr_tracker_id text;

create index if not exists assignment_blocks_qr_tracker_id_idx
  on public.assignment_blocks (qr_tracker_id)
  where qr_tracker_id is not null;

create or replace function public.assignment_qr_tracker_is_eligible(target public.assignment_blocks)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  unit_text text;
  building_number integer;
  unit_number_value integer;
  searchable text;
begin
  unit_text := btrim(coalesce(nullif(target.unit_number, ''), nullif(target.unit_name, ''), target.metadata ->> 'unit_number', target.metadata ->> 'unit_name', ''));
  if unit_text !~ '^\s*[0-9]+\s*[-/]\s*[0-9]+\s*$' then
    return false;
  end if;

  searchable := concat_ws(' ', target.title, target.service_type, target.scope, target.unit_number, target.unit_name);
  if searchable !~* '\m(clean|cleaning|turnover|make[- ]?ready|housekeeping)\M' then
    return false;
  end if;
  if searchable ~* '\m(leasing|lease[[:space:]]+office|leasing[[:space:]]+office|leasing[[:space:]]+and[[:space:]]+staging|staging[[:space:]]+unit|clubhouse|model[[:space:]]+unit)\M' then
    return false;
  end if;

  building_number := substring(unit_text from '^\s*([0-9]+)')::integer;
  unit_number_value := substring(unit_text from '[-/]\s*([0-9]+)\s*$')::integer;
  return building_number > 2330 or (building_number = 2330 and unit_number_value > 2);
end;
$$;

create or replace function public.enforce_assignment_qr_tracker_policy()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not public.assignment_qr_tracker_is_eligible(new) then
    new.qr_tracker_id := null;
  elsif new.qr_tracker_id is not null and btrim(new.qr_tracker_id) <> '' then
    new.qr_tracker_id := upper(btrim(new.qr_tracker_id));
  else
    new.qr_tracker_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_assignment_qr_tracker_policy on public.assignment_blocks;
create trigger enforce_assignment_qr_tracker_policy
before insert or update of title, service_type, scope, unit_number, unit_name, metadata, qr_tracker_id
on public.assignment_blocks
for each row execute function public.enforce_assignment_qr_tracker_policy();

update public.assignment_blocks
set qr_tracker_id = null
where qr_tracker_id is not null
  and not public.assignment_qr_tracker_is_eligible(assignment_blocks);

notify pgrst, 'reload schema';
