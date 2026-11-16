-- Opaque OAuth tokens are scoped exclusively to the Turnly business API.
-- No portal session or Supabase JWT is ever returned to the OAuth client.
create table public.integration_oauth_clients (
 id uuid primary key, redirect_uri text not null check(redirect_uri='https://chatgpt.com/connector_platform_oauth_redirect'), created_at timestamptz not null default now()
);
create table public.integration_oauth_codes (
 code_hash text primary key, client_id uuid not null references public.integration_oauth_clients(id), created_by uuid not null references public.profiles(id),
 redirect_uri text not null, resource text not null, scope text not null check(scope='platform:full'), challenge text not null,
 expires_at timestamptz not null, consumed_at timestamptz, key_id uuid references public.integration_keys(id)
);
create table public.integration_oauth_tokens (
 token_hash text primary key, client_id uuid not null references public.integration_oauth_clients(id), key_id uuid not null references public.integration_keys(id),
 kind text not null check(kind in ('access','refresh')), resource text not null check(resource='https://portal.turnlypros.com/api/turnly-mcp'),
 expires_at timestamptz not null, consumed_at timestamptz, created_at timestamptz not null default now()
);
create index integration_oauth_tokens_key on public.integration_oauth_tokens(key_id);
alter table public.integration_oauth_clients enable row level security;
alter table public.integration_oauth_codes enable row level security;
alter table public.integration_oauth_tokens enable row level security;
revoke all on public.integration_oauth_clients,public.integration_oauth_codes,public.integration_oauth_tokens from public,anon,authenticated;
grant all on public.integration_oauth_clients,public.integration_oauth_codes,public.integration_oauth_tokens to service_role;

create function public.integration_oauth_exchange(p_kind text,p_hash text,p_challenge text,p_redirect text,p_client uuid,p_resource text,p_access text,p_refresh text,p_root text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c integration_oauth_codes; t integration_oauth_tokens; k integration_keys; kid uuid;
begin
 if p_resource<>'https://portal.turnlypros.com/api/turnly-mcp' then return jsonb_build_object('ok',false); end if;
 if p_kind='code' then
  select * into c from integration_oauth_codes where code_hash=p_hash for update;
  if not found or c.client_id<>p_client or c.resource<>p_resource or c.redirect_uri<>p_redirect or c.challenge<>p_challenge then return jsonb_build_object('ok',false); end if;
  if c.consumed_at is not null then
   update integration_keys set revoked_at=coalesce(revoked_at,now()) where id=c.key_id;
   return jsonb_build_object('ok',false);
  end if;
  if c.expires_at<=now() or not exists(select 1 from profiles where id=c.created_by and role::text='admin' and status='active') then return jsonb_build_object('ok',false); end if;
  insert into integration_keys(name,prefix,secret_hash,scopes,created_by,expires_at)
   values('ChatGPT OAuth','OAuth',p_root,array['platform:full'],c.created_by,now()+interval '365 days') returning * into k;
  update integration_oauth_codes set consumed_at=now(),key_id=k.id where code_hash=p_hash;
 elsif p_kind='refresh' then
  select * into t from integration_oauth_tokens where token_hash=p_hash and kind='refresh';
  if not found or t.client_id<>p_client or t.resource<>p_resource then return jsonb_build_object('ok',false); end if;
  select * into k from integration_keys where id=t.key_id for update;
  -- Re-read after the grant lock: concurrent refresh must never mint two descendants.
  select * into t from integration_oauth_tokens where token_hash=p_hash for update;
  if t.consumed_at is not null then
   update integration_keys set revoked_at=coalesce(revoked_at,now()) where id=k.id;
   return jsonb_build_object('ok',false);
  end if;
  if t.expires_at<=now() or k.revoked_at is not null or k.expires_at<=now() or not exists(select 1 from profiles where id=k.created_by and role::text='admin' and status='active') then return jsonb_build_object('ok',false); end if;
  update integration_oauth_tokens set consumed_at=now() where token_hash=p_hash;
 else return jsonb_build_object('ok',false);
 end if;
 insert into integration_oauth_tokens(token_hash,client_id,key_id,kind,resource,expires_at) values
  (p_access,p_client,k.id,'access',p_resource,least(k.expires_at,now()+interval '1 hour')),
  (p_refresh,p_client,k.id,'refresh',p_resource,k.expires_at);
 return jsonb_build_object('ok',true);
end $$;

create function public.integration_use_oauth(p_hash text,p_scope text) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare root_hash text;
begin
 select k.secret_hash into root_hash from integration_oauth_tokens t join integration_keys k on k.id=t.key_id
 where t.token_hash=p_hash and t.kind='access' and t.expires_at>now() and t.consumed_at is null
 and t.resource='https://portal.turnlypros.com/api/turnly-mcp';
 if not found then return null; end if;
 return integration_use_key(root_hash,p_scope);
end $$;

create function public.integration_oauth_revoke(p_client uuid,p_hash text) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update integration_keys k set revoked_at=coalesce(k.revoked_at,now()) from integration_oauth_tokens t where t.key_id=k.id and t.client_id=p_client and t.token_hash=p_hash;
end $$;
revoke all on function public.integration_oauth_exchange(text,text,text,text,uuid,text,text,text,text),public.integration_use_oauth(text,text),public.integration_oauth_revoke(uuid,text) from public,anon,authenticated;
grant execute on function public.integration_oauth_exchange(text,text,text,text,uuid,text,text,text,text),public.integration_use_oauth(text,text),public.integration_oauth_revoke(uuid,text) to service_role;
