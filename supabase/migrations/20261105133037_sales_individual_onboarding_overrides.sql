alter table public.crm_onboarding_rules drop constraint crm_onboarding_team_only;
alter table public.crm_onboarding_rules add constraint crm_onboarding_scope_check check(scope='team' or scope ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
create or replace function public.crm_onboarding_requirements(p_user uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select '{"training":true,"introduction":true,"agreement":true,"portal":true,"playbook":true}'::jsonb
 ||coalesce((select requirements from public.crm_onboarding_rules where scope='team'),'{}'::jsonb)
 ||coalesce((select requirements from public.crm_onboarding_rules where scope=p_user::text),'{}'::jsonb);
$$;
