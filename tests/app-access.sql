-- Run in a transaction and roll back: never leave test roles on a real account.
begin;
do $$
declare admin_id uuid; person public.profiles; got jsonb;
begin
 select id into admin_id from public.profiles where email='admin@turnlypros.com';
 select * into person from public.profiles where role='contractor' order by id limit 1;
 perform set_config('request.jwt.claim.sub',person.id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',person.id,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',person.id::text,true);
 got:=public.my_app_access();
 assert got->'roles' ? 'contractor','Contractor default missing';
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform public.admin_set_app_access(admin_id,person.id,array['contractor','brand_ambassador']);
 perform set_config('request.jwt.claim.sub',person.id::text,true);
 got:=public.my_app_access();
 assert got->'roles' ?& array['contractor','brand_ambassador'],'Multiple roles not retained';
 assert exists(select 1 from public.profiles where id=person.id and role='contractor' and allowed_regions is not distinct from person.allowed_regions and contractor_approved is not distinct from person.contractor_approved),'Scope or approval changed';
 assert exists(select 1 from public.ba_members where user_id=person.id and enabled),'BA membership missing';
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform public.admin_set_app_access(admin_id,person.id,array['brand_ambassador']);
 assert exists(select 1 from public.profiles where id=person.id and role='brand_ambassador'),'Primary role did not change';
 assert public.contractor_job_board(person.id)='[]'::jsonb,'Removed contractor can access job board';
 perform public.admin_set_app_access(admin_id,person.id,array['contractor']);
 assert exists(select 1 from public.ba_members where user_id=person.id and not enabled and session_id is null),'BA access not revoked';
 begin
  perform public.admin_set_app_access(admin_id,admin_id,array['contractor']);
  raise exception 'Protected admin demotion succeeded';
 exception when raise_exception then
  if sqlerrm<>'This admin account must retain Admin access' then raise;end if;
 end;
 begin
  perform public.admin_set_app_access(person.id,person.id,array['admin']);
  raise exception 'Non-admin role grant succeeded';
 exception when raise_exception then
  if sqlerrm<>'Active admin access required' then raise;end if;
 end;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 update public.profiles set status='inactive' where id=person.id;
 perform set_config('request.jwt.claim.sub',person.id::text,true);
 assert public.my_app_access()->'roles'='[]'::jsonb,'Inactive account has effective roles';
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 update public.profiles set status=person.status where id=person.id;
 perform set_config('request.jwt.claim.sub',person.id::text,true);
end $$;
set local role authenticated;
do $$
begin
 assert (select count(*) from public.app_user_access)=1,'User can read other access records';
 assert (select count(*) from public.app_access_audit)=0,'User can read audit';
 assert public.my_app_access()->>'user_id'=auth.uid()::text,'Context identity mismatch';
 begin
  update public.app_user_access set roles=array['admin'] where user_id=auth.uid();
  raise exception 'Self promotion succeeded';
 exception when insufficient_privilege then null;end;
 begin
  perform public.admin_set_app_access(auth.uid(),auth.uid(),array['admin']);
  raise exception 'Authenticated can call service-only setter';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'access defaults, dual roles, revocation, scope preservation, protected admin, inactive access and RLS passed' result;
rollback;
