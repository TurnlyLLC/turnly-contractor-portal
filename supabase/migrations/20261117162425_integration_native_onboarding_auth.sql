create or replace function public.integration_onboarding_actor(p_key uuid) returns jsonb language sql security invoker set search_path='' as $$
select jsonb_build_object('id',p.id,'email',p.email,'full_name',p.full_name) from public.integration_keys k join public.profiles p on p.id=k.created_by where k.id=p_key and k.revoked_at is null and (k.expires_at is null or k.expires_at>now()) and 'platform:full'=any(k.scopes) and p.role::text='admin' and p.status='active'
$$;
revoke all on function public.integration_onboarding_actor(uuid) from public,anon,authenticated;
grant execute on function public.integration_onboarding_actor(uuid) to service_role;
