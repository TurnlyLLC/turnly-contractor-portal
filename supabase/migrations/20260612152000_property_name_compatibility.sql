-- Keep legacy property_name and newer name columns in sync for property records.

alter table public.properties
  add column if not exists property_name text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'properties'
      and column_name = 'name'
  ) then
    execute '
      update public.properties
      set property_name = name
      where property_name is null
        and name is not null
    ';

    execute '
      update public.properties
      set name = property_name
      where name is null
        and property_name is not null
    ';
  end if;
end $$;

create index if not exists properties_property_name_idx
  on public.properties (property_name);
