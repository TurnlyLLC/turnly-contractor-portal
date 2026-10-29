-- Only the authenticated server may finalize this step. Read the verified Auth
-- identity rather than trusting an email supplied by the browser.
create or replace function public.confirm_imported_contractor_email(p_user uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_email text;
begin
 select lower(email) into v_email from auth.users where id=p_user
 and email_confirmed_at is not null and coalesce(email_change,'')='';
 if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or split_part(v_email,'@',2) ~ '(^|\.)indeed(email)?\.com$' then
 raise exception 'A confirmed personal email is required'; end if;
 if not exists(select 1 from profiles where id=p_user and role='contractor') then
 raise exception 'Contractor required'; end if;
 if exists(select 1 from profiles where id<>p_user and lower(email)=v_email) then
 raise exception 'Email already in use'; end if;
 update profiles set email=v_email where id=p_user;
 update recruiting_applications set email=v_email,
 answers=answers||jsonb_build_object('needs_personal_email',false,'personal_email_confirmed_at',now()),
 updated_at=now(),version=version+1
 where hired_user_id=p_user and role='cleaner' and answers->>'needs_personal_email'='true';
end $$;
revoke all on function public.confirm_imported_contractor_email(uuid) from public,anon,authenticated;
grant execute on function public.confirm_imported_contractor_email(uuid) to service_role;
