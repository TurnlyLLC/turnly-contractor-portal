-- Central app designations. Primary role remains compatible with existing portals.
create table public.app_access_roles (
 role text primary key, label text not null, permissions text[] not null
);
insert into public.app_access_roles values
 ('contractor','Contractor',array['contractor.portal','contractor.jobs.service_area']),
 ('brand_ambassador','Brand Ambassador',array['ambassador.portal','ambassador.referrals']),
 ('admin','Admin',array['admin.portal','admin.access.manage']);
create table public.app_user_access (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 roles text[] not null check(cardinality(roles)>0 and roles <@ array['contractor','brand_ambassador','admin']::text[]),
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null
);
create table public.app_access_audit (
 id bigint generated always as identity primary key,
 user_id uuid not null, actor_id uuid, previous_roles text[], roles text[] not null,
 created_at timestamptz not null default now()
);
alter table public.app_access_roles enable row level security;
alter table public.app_user_access enable row level security;
alter table public.app_access_audit enable row level security;
revoke all on public.app_access_roles,public.app_user_access,public.app_access_audit from anon,authenticated;
grant select on public.app_access_roles,public.app_user_access,public.app_access_audit to authenticated;
grant all on public.app_access_roles,public.app_user_access,public.app_access_audit to service_role;
create policy access_catalog_read on public.app_access_roles for select to authenticated using(true);
create policy access_own_or_admin_read on public.app_user_access for select to authenticated using(user_id=auth.uid() or public.current_profile_is_admin());
create policy access_audit_admin_read on public.app_access_audit for select to authenticated using(public.current_profile_is_admin());
insert into public.app_user_access(user_id,roles)
 select id,array[role::text] from public.profiles where role::text in ('contractor','brand_ambassador','admin');

create function turnly_private.sync_app_primary_role() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.role is distinct from new.role then
  delete from public.app_user_access where user_id=new.id;
 end if;
 if new.role::text in ('contractor','brand_ambassador','admin') then
  insert into public.app_user_access(user_id,roles) values(new.id,array[new.role::text])
  on conflict(user_id) do update set roles=(select array_agg(distinct r) from unnest(public.app_user_access.roles||excluded.roles) r),updated_at=now();
 elsif tg_op='UPDATE' and old.role is distinct from new.role then
  delete from public.app_user_access where user_id=new.id;
 end if;
 return new;
end $$;
revoke all on function turnly_private.sync_app_primary_role() from public,anon,authenticated;
create trigger sync_app_primary_role after insert or update of role on public.profiles for each row execute function turnly_private.sync_app_primary_role();

create function public.admin_set_app_access(p_actor uuid,p_user uuid,p_roles text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.profiles; chosen text[]; previous text[]; primary_role text;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role::text='admin' and status='active') then raise exception 'Active admin access required';end if;
 select * into p from public.profiles where id=p_user for update;
 if not found or p.role::text not in ('contractor','brand_ambassador','admin') then raise exception 'Choose a contractor, ambassador or admin account';end if;
 if p_roles is null or cardinality(p_roles)=0 or array_position(p_roles,null) is not null or not p_roles <@ array['contractor','brand_ambassador','admin']::text[] then raise exception 'Select at least one supported role';end if;
 select array_agg(distinct r order by r) into chosen from unnest(p_roles) r;
 if (lower(p.email)='admin@turnlypros.com' or p_user=p_actor) and not 'admin'=any(chosen) then raise exception 'This admin account must retain Admin access';end if;
 select roles into previous from public.app_user_access where user_id=p_user;
 primary_role:=case when 'admin'=any(chosen) then 'admin' when 'contractor'=any(chosen) then 'contractor' else 'brand_ambassador' end;
 update public.profiles set role=primary_role::public.user_role where id=p_user;
 insert into public.app_user_access(user_id,roles,updated_by) values(p_user,chosen,p_actor)
 on conflict(user_id) do update set roles=excluded.roles,updated_by=p_actor,updated_at=now();
 if 'brand_ambassador'=any(chosen) then
  insert into public.ba_members(user_id,name,email,code,enabled,must_change_password)
  values(p_user,coalesce(nullif(p.full_name,''),p.email),p.email,'BA-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),true,false)
  on conflict(user_id) do update set enabled=true;
 else
  update public.ba_members set enabled=false,session_id=null where user_id=p_user;
 end if;
 insert into public.app_access_audit(user_id,actor_id,previous_roles,roles) values(p_user,p_actor,previous,chosen);
 return jsonb_build_object('user_id',p_user,'roles',chosen,'primary_role',primary_role);
end $$;
revoke all on function public.admin_set_app_access(uuid,uuid,text[]) from public,anon,authenticated;
grant execute on function public.admin_set_app_access(uuid,uuid,text[]) to service_role;

create function public.my_app_access() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; chosen text[]; permissions text[];
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 select * into p from public.profiles where id=auth.uid();
 if not found then raise exception 'Profile not found';end if;
 select roles into chosen from public.app_user_access where user_id=p.id;
 chosen:=coalesce(chosen,'{}');
 if p.status is distinct from 'active' then chosen:='{}';end if;
 select coalesce(array_agg(distinct permission),'{}') into permissions from public.app_access_roles r cross join lateral unnest(r.permissions) permission where r.role=any(chosen);
 return jsonb_build_object('user_id',p.id,'status',p.status,'primary_role',p.role,'roles',chosen,'permissions',permissions,
 'service_areas',turnly_private.contractor_selected_zones(p),'allowed_property_ids',p.allowed_property_ids,'allowed_property_names',p.allowed_property_names,
 'contractor_approved',p.contractor_approved,'jobs_require_service_area_match',true,'contract_version',1);
end $$;
revoke all on function public.my_app_access() from public,anon;
grant execute on function public.my_app_access() to authenticated;
comment on table public.app_user_access is 'Central Turnly app designations. Admin directory edits through admin_set_app_access; clients call my_app_access. Onboarding and service-area restrictions still apply.';

create function public.my_app_job_board() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 return public.contractor_job_board(auth.uid());
end $$;
revoke all on function public.my_app_job_board() from public,anon;
grant execute on function public.my_app_job_board() to authenticated;
