-- Let property manager accounts log in without requiring Supabase email
-- verification, while leaving contractor signup verification unchanged.

create or replace function public.auto_confirm_property_manager_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_role text;
begin
  normalized_role := lower(regexp_replace(coalesce(nullif(new.raw_user_meta_data->>'role', ''), ''), '[\s-]+', '_', 'g'));

  if normalized_role = 'property_manager' then
    new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
    new.confirmation_token := '';
    new.confirmation_sent_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists aa_turnly_property_manager_auto_confirm on auth.users;

create trigger aa_turnly_property_manager_auto_confirm
before insert on auth.users
for each row execute function public.auto_confirm_property_manager_auth_user();
