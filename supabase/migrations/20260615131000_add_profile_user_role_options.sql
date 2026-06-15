-- Ensure profile role options include sales and property manager accounts.
-- Supabase renders enum columns as dropdowns, so add the options to public.user_role
-- when that enum exists. The text-column fallback keeps older schemas compatible.

do $$
begin
  if to_regtype('public.user_role') is not null then
    execute 'alter type public.user_role add value if not exists ''sales''';
    execute 'alter type public.user_role add value if not exists ''sales_team''';
    execute 'alter type public.user_role add value if not exists ''property_manager''';
  end if;
end $$;

alter table public.profiles
  add column if not exists role text;

do $$
declare
  role_type text;
begin
  select format_type(attribute.atttypid, attribute.atttypmod)
  into role_type
  from pg_attribute attribute
  join pg_class class on class.oid = attribute.attrelid
  join pg_namespace namespace on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relname = 'profiles'
    and attribute.attname = 'role'
    and not attribute.attisdropped;

  if role_type = 'text' then
    update public.profiles
    set role = 'contractor'
    where role is null;

    alter table public.profiles
      alter column role set default 'contractor';

    alter table public.profiles
      drop constraint if exists profiles_role_supported;

    alter table public.profiles
      drop constraint if exists profiles_role_check;

    alter table public.profiles
      add constraint profiles_role_supported
      check (role in ('admin', 'contractor', 'sales', 'sales_team', 'property_manager'))
      not valid;
  elsif role_type in ('user_role', 'public.user_role') then
    execute 'alter table public.profiles alter column role set default ''contractor''::public.user_role';
  end if;
end $$;
