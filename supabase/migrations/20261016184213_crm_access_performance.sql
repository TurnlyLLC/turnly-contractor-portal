-- Access is identical for all rows in one request. Evaluate once per statement,
-- not once for every lead scanned (including skipped pagination rows).
do $$
declare p record; statement text;
begin
 for p in select * from pg_policies where schemaname='public' and
 (qual='current_user_can_use_sales_portal()' or with_check='current_user_can_use_sales_portal()') loop
  statement=format('alter policy %I on public.%I',p.policyname,p.tablename);
  if p.qual='current_user_can_use_sales_portal()' then statement=statement||' using ((select public.current_user_can_use_sales_portal()))'; end if;
  if p.with_check='current_user_can_use_sales_portal()' then statement=statement||' with check ((select public.current_user_can_use_sales_portal()))'; end if;
  execute statement;
 end loop;
end $$;
