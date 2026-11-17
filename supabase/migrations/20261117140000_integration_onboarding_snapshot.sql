-- Service-only, scope-checked operational snapshot. No form answers or identity/bank secrets.
grant select on turnly_backend.background_grandfather,turnly_backend.background_progress to service_role;
create function public.integration_onboarding_snapshot(p_key uuid,p_profile uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare k public.integration_keys; result jsonb;
begin
 select * into k from public.integration_keys where id=p_key;
 if not found or k.revoked_at is not null or (k.expires_at is not null and k.expires_at<=now())
 or not ('platform:full'=any(k.scopes) or 'contractors:read'=any(k.scopes))
 or not exists(select 1 from public.profiles where id=k.created_by and role::text='admin' and status='active') then raise exception 'invalid_key'; end if;
 if not exists(select 1 from public.profiles where id=p_profile and role::text='contractor') then raise exception 'contractor_missing';end if;
 select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object(
 'id',i.id,'title',i.title,'kind',i.kind,'required',i.required=1,'min_version',i.min_version,
 'grandfathered',i.kind='background' and exists(select 1 from turnly_backend.background_grandfather g where g.user_id=p_profile::text)
 and not exists(select 1 from turnly_backend.background_progress b where b.user_id=p_profile::text and b.item_id=i.id)
 and (s.id is null or (s.status<>'rejected' and s.created_at<=extract(epoch from timestamptz '2026-10-28T00:00:00Z')*1000)),
 'submission',case when s.id is null then null else jsonb_build_object('id',s.id,'status',s.status,'version',s.version,
 'source',s.source,'hasFile',s.file_id is not null,'fileName',s.file_name,'expirationDate',s.expiration_date,
 'reviewerNote',s.reviewer_note,'reviewedAt',to_timestamp(s.reviewed_at/1000.0),'createdAt',to_timestamp(s.created_at/1000.0)) end
 ) order by i.sort,i.id),'[]'::jsonb)) into result
 from turnly_backend.items i left join lateral (select * from turnly_backend.submissions x
 where x.user_id=p_profile::text and x.item_id=i.id order by x.created_at desc,x.id desc limit 1) s on true
 where i.active=1 and i.deleted=0;
 return result;
end;$$;
revoke all on function public.integration_onboarding_snapshot(uuid,uuid) from public,anon,authenticated;
grant execute on function public.integration_onboarding_snapshot(uuid,uuid) to service_role;
