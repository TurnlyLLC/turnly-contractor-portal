-- The server verifies the current remote document checklist before this call.
-- Training and account/background restrictions are checked again under a row lock.
create or replace function public.auto_approve_completed_contractor(p_profile uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.profiles; changed boolean:=false;
begin
 select * into p from public.profiles where id=p_profile for update;
 if not found or p.role::text<>'contractor' or p.status not in ('active','pending')
   or coalesce(p.approval_status,'pending') not in ('pending','approved') then
   return jsonb_build_object('approved',false,'changed',false);
 end if;
 if not coalesce((select count(*)=12 and (bool_and(waived) or bool_and(lessons_done=5 and score>=90)) from public.contractor_training_status(p_profile)),false) then
   return jsonb_build_object('approved',false,'changed',false);
 end if;
 if exists(select 1 from public.contractor_background_checks where profile_id=p_profile and (status is distinct from 'approved' or sync_state is distinct from 'synced')) then
   return jsonb_build_object('approved',false,'changed',false);
 end if;
 if p.contractor_approved is distinct from true or p.status<>'active' or p.approval_status is distinct from 'approved' then
   update public.profiles set contractor_approved=true,status='active',approval_status='approved',contractor_approved_at=now(),contractor_approved_by=null where id=p_profile;
   update public.contractors set contractor_approved=true,status='active',approval_status='approved' where profile_id=p_profile;
   insert into public.admin_audit_log(actor_id,actor_name,action,entity,entity_id,before_value,after_value,source)
   values(null,'Turnly onboarding automation','contractor_auto_approved','profiles',p_profile::text,
    jsonb_build_object('status',p.status,'approved',p.contractor_approved)::text,
    '{"status":"active","approved":true,"reason":"All required onboarding and training verified complete"}', 'contractor_onboarding');
   changed:=true;
 end if;
 return jsonb_build_object('approved',true,'changed',changed);
end;
$$;
revoke all on function public.auto_approve_completed_contractor(uuid) from public,anon,authenticated;
grant execute on function public.auto_approve_completed_contractor(uuid) to service_role;
notify pgrst,'reload schema';
