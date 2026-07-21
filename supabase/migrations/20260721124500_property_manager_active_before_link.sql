-- Property managers should enter their portal immediately, even before an
-- admin links the account to a property. Contractors still require approval.

alter table public.profiles
  add column if not exists requested_property_name text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_role text;
  profile_role public.profiles.role%type;
  profile_status public.profiles.status%type;
  profile_name text;
  requested_property text;
begin
  normalized_role := lower(regexp_replace(coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'contractor'), '[\s-]+', '_', 'g'));
  profile_role := normalized_role;
  profile_status := case
    when normalized_role = 'contractor' then 'pending'
    when normalized_role = 'property_manager' then 'active'
    else coalesce(nullif(new.raw_user_meta_data->>'status', ''), 'active')
  end;
  profile_name := nullif(new.raw_user_meta_data->>'full_name', '');
  requested_property := nullif(
    btrim(coalesce(
      new.raw_user_meta_data->>'requested_property_name',
      new.raw_user_meta_data->>'associated_property',
      new.raw_user_meta_data->>'property_name',
      ''
    )),
    ''
  );

  if profile_name is null then
    profile_name := nullif(
      btrim(concat(
        coalesce(new.raw_user_meta_data->>'first_name', ''),
        ' ',
        coalesce(new.raw_user_meta_data->>'last_name', '')
      )),
      ''
    );
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    phone,
    role,
    status,
    contractor_approved,
    requested_property_name
  )
  values (
    new.id,
    new.email,
    profile_name,
    nullif(new.raw_user_meta_data->>'phone', ''),
    profile_role,
    profile_status,
    normalized_role = 'property_manager' or profile_status::text in ('active', 'approved', 'enabled'),
    requested_property
  )
  on conflict (id) do update
  set
    email = coalesce(public.profiles.email, excluded.email),
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    phone = coalesce(public.profiles.phone, excluded.phone),
    role = coalesce(public.profiles.role, excluded.role),
    requested_property_name = coalesce(public.profiles.requested_property_name, excluded.requested_property_name),
    status = case
      when lower(replace(coalesce(excluded.role::text, ''), ' ', '_')) = 'property_manager'
        and (
          public.profiles.status is null
          or btrim(public.profiles.status::text) = ''
          or lower(replace(public.profiles.status::text, ' ', '_')) = 'pending'
        )
        then 'active'
      when excluded.status = 'pending'
        and lower(replace(coalesce(excluded.role::text, ''), ' ', '_')) = 'contractor'
        then 'pending'
      when public.profiles.status is null or btrim(public.profiles.status::text) = ''
        then excluded.status
      else public.profiles.status
    end,
    contractor_approved = case
      when lower(replace(coalesce(excluded.role::text, ''), ' ', '_')) = 'property_manager'
        then true
      when excluded.status = 'pending'
        and lower(replace(coalesce(excluded.role::text, ''), ' ', '_')) = 'contractor'
        then false
      else coalesce(public.profiles.contractor_approved, excluded.contractor_approved)
    end;

  return new;
end;
$$;

update public.profiles
set
  status = 'active',
  contractor_approved = true
where lower(replace(coalesce(role::text, ''), ' ', '_')) = 'property_manager'
  and (
    status is null
    or btrim(status::text) = ''
    or lower(replace(status::text, ' ', '_')) = 'pending'
  );

notify pgrst, 'reload schema';
