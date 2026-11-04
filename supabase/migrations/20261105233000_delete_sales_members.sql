alter table public.profiles add column sales_member_deleted_at timestamptz;

-- Supabase Auth removes the login identities. Retain the profile ID for historical sales and pay.
create function public.finalize_deleted_sales_member() returns trigger
language plpgsql security definer set search_path = '' as $$
declare member_role text;
begin
  select role::text into member_role from public.profiles where id=new.id for update;
  if member_role in ('admin','owner','super_admin') then
    raise exception 'Administrator accounts are protected';
  end if;
  if member_role in ('sales','sales_team') then
    update public.profiles set status='inactive', email=null, sales_member_deleted_at=new.deleted_at where id=new.id;
    update public.sales_leads set sales_owner_id=null,sales_owner_name='' where sales_owner_id=new.id;
    delete from public.crm_user_access where user_id=new.id;
    delete from auth.sessions where user_id=new.id;
  end if;
  return new;
end $$;
revoke all on function public.finalize_deleted_sales_member() from public,anon,authenticated;
create trigger finalize_deleted_sales_member after update of deleted_at on auth.users
for each row when (old.deleted_at is null and new.deleted_at is not null)
execute function public.finalize_deleted_sales_member();
