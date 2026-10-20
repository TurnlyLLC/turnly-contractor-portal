create or replace function public.crm_consume_voice_call(p_id uuid,p_identity text,p_sid text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v crm_voice_calls; v_admin boolean;
begin
 select * into v from crm_voice_calls where id=p_id;
 if not found then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(v.user_id::text,123));
 select * into v from crm_voice_calls where id=p_id for update;
 if not found or v.status<>'prepared' or v.created_at<now()-interval '2 minutes' or p_identity<>'client:sales_'||v.user_id::text then return null; end if;
 select role='admin' into v_admin from profiles where id=v.user_id and status='active' and role in ('admin','sales','sales_team');
 if not found then return null; end if;
 if exists(select 1 from crm_voice_calls where user_id=v.user_id and id<>v.id and status in ('dialing','initiated','ringing','in-progress') and created_at>now()-interval '61 minutes') then return null; end if;
 if exists(select 1 from crm_user_access where user_id=v.user_id and (not enabled or must_change_password)) then return null; end if;
 if exists(select 1 from crm_user_access where user_id=v.user_id) and not coalesce(crm_server_session_ready(v.user_id,v.session_id::text),false) then return null; end if;
 if not exists(select 1 from sales_leads where id=v.lead_id and business_segment='residential' and not coalesce(do_not_contact,false) and (v_admin or sales_owner_id=v.user_id)) then return null; end if;
 update crm_voice_calls set status='dialing',parent_sid=p_sid where id=v.id;
 return to_jsonb(v)||jsonb_build_object('is_admin',v_admin);
end $$;