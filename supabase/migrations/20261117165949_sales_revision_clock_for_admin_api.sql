-- Use an actual revision for each write, including multiple writes in one transaction.
create or replace function public.sales_touch_updated_at() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$ begin new.updated_at=clock_timestamp();return new;end $$;
