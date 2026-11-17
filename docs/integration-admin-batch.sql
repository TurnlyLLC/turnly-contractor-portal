create or replace function integration_admin_batch(p_key uuid,p_resource text,p_request uuid,p_records jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare row jsonb; results jsonb:='[]';
begin
 if jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records) not between 1 and 100 or (select count(distinct x->>'id') from jsonb_array_elements(p_records) x)<>jsonb_array_length(p_records) then raise exception 'provide_1_to_100_distinct_records';end if;
 for row in select value from jsonb_array_elements(p_records) order by value->>'id' loop
  if row->>'id' is null then raise exception 'updates_require_existing_id';end if;
  results:=results||jsonb_build_array(integration_mutate(p_key,p_request::text||'_'||(row->>'id'),p_resource,(row->>'id')::uuid,row->'data',(row->>'expected_updated_at')::timestamptz));
 end loop;
 return jsonb_build_object('results',results,'atomic',true);
end $$;
revoke all on function integration_admin_batch(uuid,text,uuid,jsonb) from public,anon,authenticated;grant execute on function integration_admin_batch(uuid,text,uuid,jsonb) to service_role;

create or replace function integration_assignment_series(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare w jsonb; saved jsonb; results jsonb:='[]'; group_id uuid:=gen_random_uuid();
begin
 if jsonb_typeof(p_input->'windows')<>'array' or jsonb_array_length(p_input->'windows') not between 1 and 100 then raise exception 'provide_1_to_100_windows';end if;
 for w in select value from jsonb_array_elements(p_input->'windows') loop
  saved:=integration_booking_admin(p_actor,'create_assignment',(p_input-'windows')||w);
  update assignment_blocks set recurring_group_id=group_id,recurrence_frequency=coalesce(p_input->>'recurrence_frequency','custom'),assignment_type=coalesce(p_input->>'recurrence_frequency','custom'),recurrence_end_date=(p_input->>'recurrence_end_date')::date,auto_renewal=false where id=(saved->>'id')::uuid;
  results:=results||jsonb_build_array(saved);
 end loop;
 return jsonb_build_object('assignments',results,'recurring_group_id',group_id,'atomic',true,'status','pending','auto_renewal',false);
end $$;
revoke all on function integration_assignment_series(uuid,jsonb) from public,anon,authenticated;grant execute on function integration_assignment_series(uuid,jsonb) to service_role;
