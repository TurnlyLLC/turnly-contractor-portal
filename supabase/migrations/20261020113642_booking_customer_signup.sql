alter table public.residential_accounts alter column verified_at drop not null;
-- NULL preserves verified legacy ownership; new receipt-created accounts own explicit bookings only.
alter table public.residential_accounts add column booking_ids uuid[];
create function public.create_booking_customer(p_booking uuid,p_token text,p_password text)
-- Receipt capability plus service-role execution protects this account-creation transaction.
-- Definer access is limited to checking an existing Auth identity; no Auth record is changed.
returns boolean language plpgsql security definer set search_path='' as $$
declare b public.referral_bookings%rowtype;
begin
 if current_setting('role',true) <> 'service_role' then raise exception 'Service access required'; end if;
 select * into b from public.referral_bookings where id=p_booking and token_hash=p_token and status in ('scheduled','completed','requested','review_required') and assignment_deleted_at is null;
 if not found then raise exception 'A saved booking is required'; end if;
 if p_password !~ '^scrypt-v1:[a-f0-9]{32}:[a-f0-9]{128}$' then raise exception 'Invalid password hash'; end if;
 perform pg_advisory_xact_lock(hashtextextended(b.email,610082100));
 if exists(select 1 from public.residential_accounts where email=b.email) or exists(select 1 from auth.users where lower(email)=b.email) then return false; end if;
 insert into public.residential_accounts(email,name,password_hash,verified_at,booking_ids) values(b.email,b.name,p_password,null,array[b.id]);
 return true;
end $$;
create function public.link_customer_rebooking(p_account uuid,p_anchor uuid,p_booking uuid)
returns void language plpgsql security invoker set search_path=public as $$
begin
 update residential_accounts a set booking_ids=array_append(a.booking_ids,p_booking)
 where a.id=p_account and p_anchor=any(a.booking_ids) and not p_booking=any(a.booking_ids)
 and exists(select 1 from referral_bookings b where b.id=p_booking and b.email=a.email);
end $$;
revoke all on function public.create_booking_customer(uuid,text,text), public.link_customer_rebooking(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_booking_customer(uuid,text,text), public.link_customer_rebooking(uuid,uuid,uuid) to service_role;
