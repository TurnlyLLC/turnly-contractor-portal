create extension if not exists pgcrypto;

create table if not exists public.client_contracts
  (like public.clients including defaults including constraints including indexes);

insert into public.client_contracts
select clients.*
from public.clients as clients
where not exists (
  select 1
  from public.client_contracts as contracts
  where contracts.id = clients.id
);

drop trigger if exists client_contracts_set_updated_at on public.client_contracts;

create trigger client_contracts_set_updated_at
  before update on public.client_contracts
  for each row
  execute function public.set_updated_at();

alter table public.client_contracts enable row level security;

drop policy if exists "Authenticated users can read client contracts" on public.client_contracts;
create policy "Authenticated users can read client contracts"
  on public.client_contracts for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can create client contracts" on public.client_contracts;
create policy "Authenticated users can create client contracts"
  on public.client_contracts for insert
  to authenticated
  with check (created_by is null or created_by = auth.uid());

drop policy if exists "Authenticated users can update client contracts" on public.client_contracts;
create policy "Authenticated users can update client contracts"
  on public.client_contracts for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated users can delete client contracts" on public.client_contracts;
create policy "Authenticated users can delete client contracts"
  on public.client_contracts for delete
  to authenticated
  using (true);

grant select, insert, update, delete on public.client_contracts to authenticated;

notify pgrst, 'reload schema';
