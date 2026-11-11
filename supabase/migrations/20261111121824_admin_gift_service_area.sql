create or replace function public.gift_assign_service_area(p_actor uuid,p_order uuid,p_zone text,p_expected_zone text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.gift_orders; c record;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role::text='admin' and status='active') then raise exception 'Active admin access required'; end if;
 if p_zone is not null and p_zone not in ('NC:Raleigh','NC:Durham','NC:Asheville','NC:Greensboro') then raise exception 'Choose an available service area'; end if;
 select * into o from public.gift_orders where id=p_order for update;
 if not found then raise exception 'Purchase not found'; end if;
 if o.service_zone is distinct from p_expected_zone then raise exception 'This service area changed. Refresh the purchase before saving.'; end if;
 if o.service_zone is not distinct from p_zone then return jsonb_build_object('ok',true,'service_zone',p_zone); end if;
 update public.gift_orders set service_zone=p_zone where id=p_order;
 insert into public.gift_events(order_id,card_id,kind,actor,details)
 select p_order,id,'service_area_updated',p_actor,jsonb_build_object('previous',o.service_zone,'service_zone',p_zone) from public.gift_cards where order_id=p_order;
 if not found then
  insert into public.gift_events(order_id,kind,actor,details) values(p_order,'service_area_updated',p_actor,jsonb_build_object('previous',o.service_zone,'service_zone',p_zone));
 end if;
 return jsonb_build_object('ok',true,'service_zone',p_zone);
end;
$$;
revoke all on function public.gift_assign_service_area(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.gift_assign_service_area(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
