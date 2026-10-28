create function public.crm_seller_training_acknowledge_v4(p_user uuid) returns boolean
language plpgsql security invoker set search_path=public as $$
begin
 if not exists(select 1 from crm_seller_agreements where user_id=p_user and version='20261027-v1') then raise exception 'Sign your seller agreement first.';end if;
 if (select count(*) from crm_training_progress where user_id=p_user and version='20261027-v2' and lesson in ('introduction','portal') and completed_at is not null)<>2 then raise exception 'Watch every playbook video before finishing training.';end if;
 insert into crm_training_reviews(user_id,version) values(p_user,'20261028-v3') on conflict do nothing;
 return true;
end $$;
revoke all on function public.crm_seller_training_acknowledge_v4(uuid) from public,anon,authenticated;
grant execute on function public.crm_seller_training_acknowledge_v4(uuid) to service_role;
