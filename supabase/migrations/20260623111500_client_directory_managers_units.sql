alter table public.clients
  add column if not exists account_manager_ids uuid[] not null default '{}',
  add column if not exists account_manager_names text[] not null default '{}',
  add column if not exists service_model text not null default 'apartment_turnover',
  add column if not exists unit_count integer not null default 0,
  add column if not exists unit_notes text not null default '';

update public.clients
set
  account_manager_ids = case
    when coalesce(array_length(account_manager_ids, 1), 0) > 0 then account_manager_ids
    when account_manager_id is not null then array[account_manager_id]
    else '{}'
  end,
  account_manager_names = case
    when coalesce(array_length(account_manager_names, 1), 0) > 0 then account_manager_names
    when nullif(account_manager_name, '') is not null then string_to_array(account_manager_name, ',')
    else '{}'
  end,
  service_model = coalesce(nullif(service_model, ''), 'apartment_turnover'),
  unit_count = greatest(coalesce(unit_count, 0), 0),
  unit_notes = coalesce(unit_notes, '')
where true;

update public.clients
set account_manager_names = array(
  select trim(name)
  from unnest(account_manager_names) as manager_name(name)
  where trim(name) <> ''
)
where true;

alter table public.clients
  alter column account_manager_ids set default '{}',
  alter column account_manager_ids set not null,
  alter column account_manager_names set default '{}',
  alter column account_manager_names set not null,
  alter column service_model set default 'apartment_turnover',
  alter column service_model set not null,
  alter column unit_count set default 0,
  alter column unit_count set not null,
  alter column unit_notes set default '',
  alter column unit_notes set not null;

create index if not exists clients_account_manager_ids_idx
  on public.clients using gin (account_manager_ids);

create index if not exists clients_account_manager_names_idx
  on public.clients using gin (account_manager_names);

create index if not exists clients_service_model_idx
  on public.clients (service_model);

notify pgrst, 'reload schema';