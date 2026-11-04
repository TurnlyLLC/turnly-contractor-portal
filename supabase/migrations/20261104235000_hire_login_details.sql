create or replace function public.assign_cleaner_login_alias() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare parts text[]; base text; candidate text; n integer := 1;
begin
  if tg_op='UPDATE' and old.login_alias is not null and
     (old.hired_at is not null or new.login_alias is not null) then
    new.login_alias:=old.login_alias;
    return new;
  end if;
  parts:=regexp_split_to_array(trim(new.name),'[[:space:]]+');
  base:=lower(regexp_replace(parts[1] || case when cardinality(parts)>1 then parts[cardinality(parts)] else '' end,'[^[:alnum:]]','','g'));
  base:=coalesce(nullif(base,''),'candidate');
  perform pg_advisory_xact_lock(194783562);
  candidate:=base;
  while exists(select 1 from public.recruiting_applications where lower(login_alias)=candidate and id<>new.id) loop
    n:=n+1;
    candidate:=base||n;
  end loop;
  new.login_alias:=candidate;
  if new.role='cleaner' and lower(split_part(new.email,'@',2)) ~ '(^|\.)(indeed|indeedemail)\.com$' then
    new.answers:=coalesce(new.answers,'{}'::jsonb)||jsonb_build_object('needs_personal_email',true);
  end if;
  return new;
end $$;

create function public.finish_hire_login_email(p_user uuid,p_email text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare verified text;
begin
  select lower(email) into verified from auth.users where id=p_user and email_confirmed_at is not null and coalesce(email_change,'')='';
  if verified is null or verified is distinct from lower(trim(p_email)) or split_part(verified,'@',2) ~ '(^|\.)(indeed|indeedemail)\.com$' then
    raise exception 'Enter and confirm your personal email before continuing.';
  end if;
  update public.profiles set email=verified where id=p_user;
  update public.ba_members set email=verified where user_id=p_user;
  update public.recruiting_applications set email=verified, answers=coalesce(answers,'{}'::jsonb)||jsonb_build_object('needs_personal_email',false)
    where hired_user_id=p_user and status='hired';
end $$;
revoke all on function public.finish_hire_login_email(uuid,text) from public,anon,authenticated;
grant execute on function public.finish_hire_login_email(uuid,text) to service_role;
