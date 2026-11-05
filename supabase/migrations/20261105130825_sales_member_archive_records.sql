create table public.crm_member_archives(
 user_id uuid primary key references public.profiles(id), archived_at timestamptz not null,
 profile_snapshot jsonb not null, leads_snapshot jsonb not null default '[]'::jsonb
);
alter table public.crm_member_archives enable row level security;
revoke all on public.crm_member_archives from public,anon,authenticated;
grant all on public.crm_member_archives to service_role;
insert into public.crm_member_archives(user_id,archived_at,profile_snapshot)
select id,sales_member_deleted_at,jsonb_build_object('id',id,'full_name',full_name,'role',role,'status',status) from public.profiles where sales_member_deleted_at is not null on conflict do nothing;

create function public.archive_sales_member_records() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.profiles where id=new.id and role::text in ('sales','sales_team')) then
  insert into public.crm_member_archives(user_id,archived_at,profile_snapshot,leads_snapshot)
  select p.id,new.deleted_at,jsonb_build_object('id',p.id,'full_name',p.full_name,'email',p.email,'role',p.role,'status',p.status,'username',a.username),
  coalesce((select jsonb_agg(to_jsonb(l)) from public.sales_leads l where l.sales_owner_id=p.id),'[]'::jsonb)
  from public.profiles p left join public.crm_user_access a on a.user_id=p.id where p.id=new.id
  on conflict(user_id) do nothing;
 end if;
 return new;
end $$;
revoke all on function public.archive_sales_member_records() from public,anon,authenticated;
create trigger archive_sales_member_records before update of deleted_at on auth.users
for each row when(old.deleted_at is null and new.deleted_at is not null)
execute function public.archive_sales_member_records();

