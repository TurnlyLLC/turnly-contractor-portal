-- Keep sales reps working active prospects while reserving lead intake and deletion for admins.
-- This leaves select/update permissions intact for sales users.

drop policy if exists "Sales portal users can create leads" on public.sales_leads;
drop policy if exists "Admins can create sales leads" on public.sales_leads;
create policy "Admins can create sales leads"
  on public.sales_leads for insert to authenticated
  with check (coalesce(public.current_user_has_role(array['admin']), false));

drop policy if exists "Sales portal users can delete leads" on public.sales_leads;
drop policy if exists "Admins can delete sales leads" on public.sales_leads;
create policy "Admins can delete sales leads"
  on public.sales_leads for delete to authenticated
  using (coalesce(public.current_user_has_role(array['admin']), false));
