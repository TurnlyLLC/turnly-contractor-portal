alter table public.recruiting_applications add column login_alias text;
create unique index recruiting_login_alias_unique on public.recruiting_applications(lower(login_alias)) where login_alias is not null;
create function public.assign_cleaner_login_alias() returns trigger language plpgsql set search_path=public as $$
declare parts text[]; base text; n integer := 1;
begin
 if tg_op='UPDATE' and old.login_alias is not null then new.login_alias:=old.login_alias; return new; end if;
 new.login_alias:=null;
 if new.role='cleaner' and lower(split_part(new.email,'@',2)) ~ '(^|\.)(indeed|indeedemail)\.com$' then
  parts:=regexp_split_to_array(trim(new.name),'[[:space:]]+');
  base:=parts[1] || case when array_length(parts,1)>1 then ' '||parts[array_length(parts,1)] else '' end;
  perform pg_advisory_xact_lock(hashtextextended(lower(base),0));
  new.login_alias:=base;
  while exists(select 1 from public.recruiting_applications where lower(login_alias)=lower(new.login_alias) and id<>new.id) loop
   n:=n+1; new.login_alias:=base||' '||n;
  end loop;
  new.answers:=coalesce(new.answers,'{}'::jsonb)||jsonb_build_object('needs_personal_email',true);
 end if;
 return new;
end $$;
create trigger recruiting_cleaner_alias before insert or update of email,name,login_alias on public.recruiting_applications for each row execute function public.assign_cleaner_login_alias();
update public.recruiting_applications set email=email where role='cleaner' and deleted_at is null and lower(split_part(email,'@',2)) ~ '(^|\.)(indeed|indeedemail)\.com$';
