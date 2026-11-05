begin;
create temporary table archive_trigger_test(id uuid,deleted_at timestamptz);
create trigger test_snapshot before update of deleted_at on archive_trigger_test for each row when(old.deleted_at is null and new.deleted_at is not null) execute function public.archive_sales_member_records();
do $test$
declare u uuid; leads integer; saved integer; docs integer; pay integer;
begin
 select id into u from public.profiles where role::text in ('sales','sales_team') and sales_member_deleted_at is null limit 1;
 select count(*) into leads from public.sales_leads where sales_owner_id=u;
 select count(*) into docs from public.crm_seller_agreements where user_id=u;
 select count(*) into pay from public.crm_pay_plans where user_id=u;
 insert into archive_trigger_test values(u,null);
 update archive_trigger_test set deleted_at=now() where id=u;
 select jsonb_array_length(leads_snapshot) into saved from public.crm_member_archives where user_id=u;
 if saved is distinct from leads then raise exception 'Lead snapshot mismatch';end if;
 if (select count(*) from public.crm_seller_agreements where user_id=u)<>docs or (select count(*) from public.crm_pay_plans where user_id=u)<>pay then raise exception 'History changed';end if;
 if not exists(select 1 from public.crm_member_archives where user_id=u and profile_snapshot->>'id'=u::text) then raise exception 'Profile snapshot missing';end if;
 if has_table_privilege('authenticated','public.crm_member_archives','SELECT') or has_function_privilege('authenticated','public.archive_sales_member_records()','EXECUTE') then raise exception 'Unsafe grants';end if;
end $test$;
rollback;
select 'PASS: archive trigger captures profile and assigned leads, retains documents and pay, and blocks direct access; test rolled back' as result;
